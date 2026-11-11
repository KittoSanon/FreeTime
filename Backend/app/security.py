import base64
import hashlib
import os
import re
import secrets
from datetime import datetime, timedelta
from typing import Callable

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models
from .database import get_db

PASSWORD_ITERATIONS = 600_000
SESSION_HOURS = 8
bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS)
    return "pbkdf2_sha256${}${}${}".format(
        PASSWORD_ITERATIONS,
        base64.urlsafe_b64encode(salt).decode("ascii"),
        base64.urlsafe_b64encode(digest).decode("ascii"),
    )


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, iterations, encoded_salt, encoded_digest = stored_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        salt = base64.urlsafe_b64decode(encoded_salt.encode("ascii"))
        expected = base64.urlsafe_b64decode(encoded_digest.encode("ascii"))
        actual = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt,
            int(iterations),
        )
        return secrets.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def create_session(db: Session, user: models.UserAccount) -> tuple[str, datetime]:
    token = secrets.token_urlsafe(48)
    expires_at = datetime.utcnow() + timedelta(hours=SESSION_HOURS)
    db.add(
        models.UserSession(
            user_id=user.id,
            token_hash=hashlib.sha256(token.encode("ascii")).hexdigest(),
            expires_at=expires_at,
        )
    )
    return token, expires_at


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> models.UserAccount:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Sign in to continue")
    token_hash = hashlib.sha256(credentials.credentials.encode("ascii")).hexdigest()
    session = db.scalar(
        select(models.UserSession).where(
            models.UserSession.token_hash == token_hash,
            models.UserSession.revoked_at.is_(None),
            models.UserSession.expires_at > datetime.utcnow(),
        )
    )
    user = db.get(models.UserAccount, session.user_id) if session else None
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Your session is invalid or expired")
    return user


def require_roles(*roles: str) -> Callable:
    def check_role(user: models.UserAccount = Depends(get_current_user)) -> models.UserAccount:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Your account does not have permission for this action")
        return user

    return check_role


def bootstrap_admin(db: Session) -> None:
    username = os.getenv("BOOTSTRAP_ADMIN_USERNAME", "").strip().lower()
    password = os.getenv("BOOTSTRAP_ADMIN_PASSWORD", "")
    display_name = os.getenv("BOOTSTRAP_ADMIN_DISPLAY_NAME", "Administrator").strip() or "Administrator"
    if not username and not password:
        return
    if not re.fullmatch(r"[a-z0-9._-]{3,80}", username) or len(password) < 12:
        raise RuntimeError(
            "Set BOOTSTRAP_ADMIN_USERNAME (3-80 letters, digits, dot, underscore, or hyphen) and "
            "BOOTSTRAP_ADMIN_PASSWORD (at least 12 characters)"
        )
    existing_user = db.scalar(
        select(models.UserAccount).where(models.UserAccount.username == username)
    )
    if existing_user:
        if existing_user.role != "admin":
            raise RuntimeError("The configured bootstrap administrator username is already assigned a non-admin role")
        return
    db.add(
        models.UserAccount(
            username=username,
            display_name=display_name,
            password_hash=hash_password(password),
            role="admin",
        )
    )
    db.commit()
