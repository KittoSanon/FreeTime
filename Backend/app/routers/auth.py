from datetime import datetime
import hashlib

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import (
    bearer_scheme,
    create_session,
    get_current_user,
    hash_password,
    require_roles,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["authentication"])


@router.post("/login", response_model=schemas.LoginOut)
def login(payload: schemas.LoginIn, db: Session = Depends(get_db)):
    username = payload.username.strip().lower()
    user = db.scalar(select(models.UserAccount).where(models.UserAccount.username == username))
    if user is None or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token, expires_at = create_session(db, user)
    db.commit()
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_at": expires_at,
        "user": user,
    }


@router.get("/me", response_model=schemas.UserAccountOut)
def current_account(user: models.UserAccount = Depends(get_current_user)):
    return user


@router.post("/logout", status_code=204)
def logout(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    _user: models.UserAccount = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if credentials is None:
        raise HTTPException(status_code=401, detail="Sign in to continue")
    token_hash = hashlib.sha256(credentials.credentials.encode("ascii")).hexdigest()
    session = db.scalar(
        select(models.UserSession).where(
            models.UserSession.token_hash == token_hash,
            models.UserSession.revoked_at.is_(None),
        )
    )
    if session:
        session.revoked_at = datetime.utcnow()
        db.commit()
    return None


@router.get("/users", response_model=list[schemas.UserAccountOut])
def list_users(
    db: Session = Depends(get_db),
    _admin: models.UserAccount = Depends(require_roles("admin")),
):
    return db.scalars(select(models.UserAccount).order_by(models.UserAccount.created_at)).all()


@router.post("/users", response_model=schemas.UserAccountOut, status_code=201)
def create_user(
    payload: schemas.UserAccountCreate,
    db: Session = Depends(get_db),
    _admin: models.UserAccount = Depends(require_roles("admin")),
):
    username = payload.username.strip().lower()
    display_name = payload.display_name.strip()
    if not display_name:
        raise HTTPException(status_code=422, detail="Display name cannot be empty")
    if db.scalar(select(models.UserAccount.id).where(models.UserAccount.username == username)):
        raise HTTPException(status_code=409, detail="That username is already in use")

    user = models.UserAccount(
        username=username,
        display_name=display_name,
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(status_code=409, detail="That username is already in use") from error
    db.refresh(user)
    return user
