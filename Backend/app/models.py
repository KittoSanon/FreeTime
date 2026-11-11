from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from .database import Base


class Item(Base):
    __tablename__ = "items"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(200))
    category: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="stationery",
        server_default="stationery",
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    is_broken: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")


class UserAccount(Base):
    __tablename__ = "user_accounts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(150), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(30), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="1")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())


class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("user_accounts.id", ondelete="CASCADE"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class ItemBorrow(Base):
    __tablename__ = "item_borrows"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    request_id: Mapped[int | None] = mapped_column(
        ForeignKey("borrow_requests.id"),
        nullable=True,
    )
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"), nullable=False)
    borrower_name: Mapped[str] = mapped_column(String(150), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    borrowed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    return_requested_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    return_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    return_decision: Mapped[str | None] = mapped_column(String(30), nullable=True)
    return_condition: Mapped[str | None] = mapped_column(String(30), nullable=True)
    returned_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="checked_out", server_default="checked_out")


class ItemUnit(Base):
    __tablename__ = "item_units"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="CASCADE"), nullable=False)
    borrowed_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    is_broken: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    is_checked_out: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    is_lost: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")


class ItemBorrowUnit(Base):
    __tablename__ = "item_borrow_units"

    item_borrow_id: Mapped[int] = mapped_column(
        ForeignKey("item_borrows.id", ondelete="CASCADE"),
        primary_key=True,
    )
    item_unit_id: Mapped[int] = mapped_column(
        ForeignKey("item_units.id", ondelete="CASCADE"),
        primary_key=True,
    )


class BorrowRequest(Base):
    __tablename__ = "borrow_requests"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    borrower_name: Mapped[str] = mapped_column(String(150), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="pending", server_default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class BorrowRequestItem(Base):
    __tablename__ = "borrow_request_items"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    request_id: Mapped[int] = mapped_column(
        ForeignKey("borrow_requests.id", ondelete="CASCADE"),
        nullable=False,
    )
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)


class Tool(Base):
    __tablename__ = "tools"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    serial_number: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    location: Mapped[str] = mapped_column(String(100), nullable=False)
    calibration_status: Mapped[str] = mapped_column(String(50), nullable=False, default="not_required")
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="available")


class Requisition(Base):
    __tablename__ = "requisitions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    request_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    requester_name: Mapped[str] = mapped_column(String(150), nullable=False)
    line_location: Mapped[str] = mapped_column(String(150), nullable=False)
    urgency: Mapped[str] = mapped_column(String(30), nullable=False, default="normal")
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending")
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())


class RequisitionItem(Base):
    __tablename__ = "requisition_items"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    requisition_id: Mapped[int] = mapped_column(ForeignKey("requisitions.id", ondelete="CASCADE"), nullable=False)
    tool_id: Mapped[int] = mapped_column(ForeignKey("tools.id"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class ToolLoan(Base):
    __tablename__ = "tool_loans"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tool_id: Mapped[int] = mapped_column(ForeignKey("tools.id"), nullable=False)
    requisition_id: Mapped[int | None] = mapped_column(ForeignKey("requisitions.id"), nullable=True)
    borrower_name: Mapped[str] = mapped_column(String(150), nullable=False)
    checked_out_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    due_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    returned_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="checked_out")


class ReturnReceipt(Base):
    __tablename__ = "return_receipts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    receipt_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    loan_id: Mapped[int] = mapped_column(ForeignKey("tool_loans.id"), unique=True, nullable=False)
    condition: Mapped[str] = mapped_column(String(100), nullable=False)
    received_by: Mapped[str] = mapped_column(String(150), nullable=False)
    returned_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())