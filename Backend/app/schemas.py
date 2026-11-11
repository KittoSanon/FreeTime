from typing import Literal
from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator, model_validator


UserRole = Literal["user", "admin", "dev_user"]


class LoginIn(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    password: str = Field(min_length=1, max_length=256)


class UserAccountCreate(BaseModel):
    username: str = Field(min_length=3, max_length=80, pattern=r"^[A-Za-z0-9._-]+$")
    display_name: str = Field(min_length=1, max_length=150)
    password: str = Field(min_length=12, max_length=256)
    role: UserRole


class UserAccountOut(BaseModel):
    id: int
    username: str
    display_name: str
    role: UserRole
    is_active: bool
    created_at: datetime


class LoginOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"]
    expires_at: datetime
    user: UserAccountOut


class ItemCreate(BaseModel):
    title: str
    category: Literal["stationery", "tool"] = "stationery"
    quantity: int = Field(default=0, ge=0)


class ItemQuantityUpdate(BaseModel):
    quantity: int = Field(ge=0)


class ItemConditionUpdate(BaseModel):
    condition: Literal["New", "Good", "Worn", "Broken"]
    quantity: int = Field(ge=1)


class BorrowRequestItemCreate(BaseModel):
    item_id: int = Field(gt=0)
    quantity: int = Field(ge=1)


class BorrowRequestCreate(BaseModel):
    borrower_name: str = Field(min_length=1, max_length=150)
    due_date: date
    items: list[BorrowRequestItemCreate] = Field(min_length=1)

    @field_validator("due_date")
    @classmethod
    def due_date_must_not_be_in_the_past(cls, due_date: date):
        if due_date < date.today():
            raise ValueError("Due date cannot be in the past")
        return due_date

    @model_validator(mode="after")
    def unique_items(self):
        item_ids = [item.item_id for item in self.items]
        if len(item_ids) != len(set(item_ids)):
            raise ValueError("Each item can only appear once in a borrow request")
        return self


class BorrowRequestDecision(BaseModel):
    status: Literal["approved", "rejected"]


class ItemBorrowReturnDecision(BaseModel):
    status: Literal["confirmed", "broken", "lost", "rejected"]


class BorrowRequestItemOut(BaseModel):
    item_id: int
    item_title: str
    quantity: int
    available_quantity: int


class BorrowRequestOut(BaseModel):
    id: int
    borrower_name: str
    status: str
    created_at: datetime
    due_date: date | None
    reviewed_at: datetime | None
    items: list[BorrowRequestItemOut]


class ItemBorrowOut(BaseModel):
    id: int
    request_id: int | None
    item_id: int
    item_title: str
    available_quantity: int
    borrower_name: str
    quantity: int
    borrowed_at: datetime
    due_date: date | None
    return_requested_at: datetime | None
    return_reviewed_at: datetime | None
    return_decision: Literal["confirmed", "rejected"] | None
    return_condition: Literal["good", "broken", "lost"] | None
    returned_at: datetime | None
    status: str


class BorrowAnalyticsDay(BaseModel):
    date: date
    requests: int
    borrowed_units: int
    returned_units: int


class BorrowAnalyticsItem(BaseModel):
    item_title: str
    borrowed_units: int
    currently_on_use: int
    returned_broken: int
    lost: int


class BorrowAnalyticsMissingRange(BaseModel):
    start_date: date
    end_date: date


class BorrowAnalyticsOut(BaseModel):
    month: str
    range_start: date
    range_end: date
    total_requests: int
    pending_requests: int
    approved_requests: int
    rejected_requests: int
    currently_on_use: int
    total_borrowed_units: int
    returned_usable: int
    returned_broken: int
    lost_units: int
    available_new: int
    available_good: int
    available_worn: int
    available_broken: int
    daily_activity: list[BorrowAnalyticsDay]
    missing_ranges: list[BorrowAnalyticsMissingRange]
    top_items: list[BorrowAnalyticsItem]


class ItemOut(BaseModel):
    id: int
    title: str
    category: Literal["stationery", "tool"]
    quantity: int
    borrowed_count: int
    condition_quantities: dict[Literal["New", "Good", "Worn", "Broken"], int]

    model_config = {"from_attributes": True}