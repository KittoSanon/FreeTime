import calendar
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func, select, update
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models, schemas
from ..security import get_current_user, require_roles

router = APIRouter(
    prefix="/items",
    tags=["items"],
    dependencies=[Depends(get_current_user)],
)


@router.get(
    "/analytics/borrow",
    response_model=schemas.BorrowAnalyticsOut,
    dependencies=[Depends(require_roles("admin", "dev_user"))],
)
def get_borrow_analytics(
    db: Session = Depends(get_db),
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
):
    today = date.today()
    if month is None:
        start_date = today.replace(day=1)
    else:
        try:
            year, month_number = (int(part) for part in month.split("-"))
            start_date = date(year, month_number, 1)
        except ValueError as error:
            raise HTTPException(status_code=422, detail="Month must be a valid YYYY-MM value") from error
        if start_date > today.replace(day=1):
            raise HTTPException(status_code=422, detail="Month cannot be in the future")
    end_date = start_date.replace(day=calendar.monthrange(start_date.year, start_date.month)[1])
    activity_end_date = min(end_date, today)
    requests = db.execute(
        select(models.BorrowRequest.status, models.BorrowRequest.created_at)
    ).all()
    loans = db.execute(
        select(
            models.ItemBorrow.item_id,
            models.Item.title,
            models.ItemBorrow.quantity,
            models.ItemBorrow.status,
            models.ItemBorrow.return_condition,
            models.ItemBorrow.borrowed_at,
            models.ItemBorrow.returned_at,
        )
        .join(models.Item, models.Item.id == models.ItemBorrow.item_id)
    ).all()
    units = db.execute(
        select(
            models.ItemUnit.borrowed_count,
            models.ItemUnit.is_broken,
            models.ItemUnit.is_checked_out,
            models.ItemUnit.is_lost,
        )
    ).all()

    request_counts = {"pending": 0, "approved": 0, "rejected": 0}
    activity = {}
    for request_status, created_at in requests:
        request_counts[request_status] = request_counts.get(request_status, 0) + 1
        request_day = created_at.date() if isinstance(created_at, datetime) else created_at
        if request_day and start_date <= request_day <= activity_end_date:
            activity.setdefault(request_day, {"requests": 0, "borrowed_units": 0, "returned_units": 0})
            activity[request_day]["requests"] += 1

    item_stats = {}
    currently_on_use = 0
    total_borrowed_units = 0
    returned_usable = 0
    returned_broken = 0
    lost_units = 0
    for item_id, title, quantity, status, return_condition, borrowed_at, returned_at in loans:
        stats = item_stats.setdefault(
            item_id,
            {"item_title": title, "borrowed_units": 0, "currently_on_use": 0, "returned_broken": 0, "lost": 0},
        )
        stats["borrowed_units"] += quantity
        total_borrowed_units += quantity
        if status in ("checked_out", "return_requested"):
            currently_on_use += quantity
            stats["currently_on_use"] += quantity
        if return_condition == "good":
            returned_usable += quantity
        elif return_condition == "broken":
            returned_broken += quantity
            stats["returned_broken"] += quantity
        elif return_condition == "lost":
            lost_units += quantity
            stats["lost"] += quantity

        borrow_day = borrowed_at.date() if isinstance(borrowed_at, datetime) else borrowed_at
        if borrow_day and start_date <= borrow_day <= activity_end_date:
            activity.setdefault(borrow_day, {"requests": 0, "borrowed_units": 0, "returned_units": 0})
            activity[borrow_day]["borrowed_units"] += quantity
        return_day = returned_at.date() if isinstance(returned_at, datetime) else returned_at
        if return_day and start_date <= return_day <= activity_end_date:
            activity.setdefault(return_day, {"requests": 0, "borrowed_units": 0, "returned_units": 0})
            activity[return_day]["returned_units"] += quantity

    inventory_counts = {"New": 0, "Good": 0, "Worn": 0, "Broken": 0}
    for borrowed_count, is_broken, is_checked_out, is_lost in units:
        if is_lost or is_checked_out:
            continue
        if is_broken or borrowed_count > 10:
            inventory_counts["Broken"] += 1
        elif borrowed_count == 0:
            inventory_counts["New"] += 1
        elif borrowed_count >= 6:
            inventory_counts["Worn"] += 1
        else:
            inventory_counts["Good"] += 1

    recorded_days = sorted(activity)
    missing_ranges = []
    missing_start = None
    current_day = start_date
    while current_day <= activity_end_date:
        if current_day not in activity:
            if missing_start is None:
                missing_start = current_day
        elif missing_start is not None:
            missing_ranges.append({"start_date": missing_start, "end_date": current_day - timedelta(days=1)})
            missing_start = None
        current_day += timedelta(days=1)
    if missing_start is not None:
        missing_ranges.append({"start_date": missing_start, "end_date": activity_end_date})

    return {
        "month": start_date.strftime("%Y-%m"),
        "range_start": start_date,
        "range_end": end_date,
        "total_requests": len(requests),
        "pending_requests": request_counts["pending"],
        "approved_requests": request_counts["approved"],
        "rejected_requests": request_counts["rejected"],
        "currently_on_use": currently_on_use,
        "total_borrowed_units": total_borrowed_units,
        "returned_usable": returned_usable,
        "returned_broken": returned_broken,
        "lost_units": lost_units,
        "available_new": inventory_counts["New"],
        "available_good": inventory_counts["Good"],
        "available_worn": inventory_counts["Worn"],
        "available_broken": inventory_counts["Broken"],
        "daily_activity": [
            {"date": activity_day, **activity[activity_day]}
            for activity_day in recorded_days
        ],
        "missing_ranges": missing_ranges,
        "top_items": sorted(
            item_stats.values(),
            key=lambda item: (-item["borrowed_units"], item["item_title"].lower()),
        )[:8],
    }


@router.get("", response_model=list[schemas.ItemOut])
def list_items(db: Session = Depends(get_db)):
    items = db.scalars(select(models.Item).order_by(models.Item.id)).all()
    borrowed_counts = dict(
        db.execute(
            select(models.ItemBorrow.item_id, func.coalesce(func.sum(models.ItemBorrow.quantity), 0))
            .group_by(models.ItemBorrow.item_id)
        ).all()
    )
    unit_condition = case(
        (models.ItemUnit.is_broken.is_(True), "Broken"),
        (models.ItemUnit.borrowed_count > 10, "Broken"),
        (models.ItemUnit.borrowed_count == 0, "New"),
        (models.ItemUnit.borrowed_count >= 6, "Worn"),
        else_="Good",
    )
    condition_rows = db.execute(
        select(models.ItemUnit.item_id, unit_condition, func.count())
        .where(
            models.ItemUnit.is_checked_out.is_(False),
            models.ItemUnit.is_lost.is_(False),
        )
        .group_by(models.ItemUnit.item_id, unit_condition)
    ).all()
    condition_counts = {}
    for item_id, condition, count in condition_rows:
        condition_counts.setdefault(item_id, {})[condition] = count
    return [
        _item_output(item, borrowed_counts.get(item.id, 0), condition_counts.get(item.id, {}))
        for item in items
    ]


def _item_output(item: models.Item, borrowed_count: int, condition_quantities=None):
    quantities = {"New": 0, "Good": 0, "Worn": 0, "Broken": 0}
    quantities.update(condition_quantities or {})
    return {
        "id": item.id,
        "title": item.title,
        "category": item.category,
        "quantity": item.quantity,
        "borrowed_count": borrowed_count,
        "condition_quantities": quantities,
    }


def _item_borrowed_count(item_id: int, db: Session) -> int:
    return int(db.scalar(
        select(func.coalesce(func.sum(models.ItemBorrow.quantity), 0))
        .where(models.ItemBorrow.item_id == item_id)
    ))


def _item_condition_quantities(item_id: int, db: Session):
    unit_condition = case(
        (models.ItemUnit.is_broken.is_(True), "Broken"),
        (models.ItemUnit.borrowed_count > 10, "Broken"),
        (models.ItemUnit.borrowed_count == 0, "New"),
        (models.ItemUnit.borrowed_count >= 6, "Worn"),
        else_="Good",
    )
    rows = db.execute(
        select(unit_condition, func.count())
        .where(
            models.ItemUnit.item_id == item_id,
            models.ItemUnit.is_checked_out.is_(False),
            models.ItemUnit.is_lost.is_(False),
        )
        .group_by(unit_condition)
    ).all()
    return {condition: count for condition, count in rows}


def _item_output_for_db(item: models.Item, db: Session):
    return _item_output(
        item,
        _item_borrowed_count(item.id, db),
        _item_condition_quantities(item.id, db),
    )

@router.post(
    "",
    response_model=schemas.ItemOut,
    dependencies=[Depends(require_roles("admin", "dev_user"))],
)
def create_item(payload: schemas.ItemCreate, db: Session = Depends(get_db)):
    item = models.Item(
        title=payload.title,
        category=payload.category,
        quantity=payload.quantity,
    )
    db.add(item)
    db.flush()
    db.add_all(
        models.ItemUnit(item_id=item.id)
        for _ in range(payload.quantity)
    )
    db.commit()
    db.refresh(item)
    return _item_output_for_db(item, db)


@router.patch(
    "/{item_id}",
    response_model=schemas.ItemOut,
    dependencies=[Depends(require_roles("admin", "dev_user"))],
)
def update_item_quantity(
    item_id: int,
    payload: schemas.ItemQuantityUpdate,
    db: Session = Depends(get_db),
):
    item = db.get(models.Item, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")

    delta = payload.quantity - item.quantity
    if delta > 0:
        db.add_all(models.ItemUnit(item_id=item.id) for _ in range(delta))
    elif delta < 0:
        units_to_remove = db.scalars(
            select(models.ItemUnit)
            .where(
                models.ItemUnit.item_id == item.id,
                models.ItemUnit.is_checked_out.is_(False),
                models.ItemUnit.is_broken.is_(False),
                models.ItemUnit.is_lost.is_(False),
            )
            .order_by(models.ItemUnit.borrowed_count.desc())
            .limit(-delta)
        ).all()
        if len(units_to_remove) < -delta:
            raise HTTPException(status_code=409, detail="Unable to reduce stock while items are checked out or broken")
        for unit in units_to_remove:
            db.delete(unit)
    item.quantity = payload.quantity
    db.commit()
    db.refresh(item)
    return _item_output_for_db(item, db)


@router.patch(
    "/{item_id}/condition",
    response_model=schemas.ItemOut,
    dependencies=[Depends(require_roles("admin", "dev_user"))],
)
def update_item_condition(
    item_id: int,
    payload: schemas.ItemConditionUpdate,
    db: Session = Depends(get_db),
):
    item = db.get(models.Item, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")

    if payload.condition == "Broken":
        matching_units = db.scalars(
            select(models.ItemUnit)
            .where(
                models.ItemUnit.item_id == item_id,
                models.ItemUnit.is_checked_out.is_(False),
                models.ItemUnit.is_broken.is_(True),
                models.ItemUnit.is_lost.is_(False),
                models.ItemUnit.borrowed_count <= 10,
            )
            .limit(payload.quantity)
            .with_for_update()
        ).all()
        new_is_broken = False
    else:
        unit_condition = case(
            (models.ItemUnit.borrowed_count > 10, "Broken"),
            (models.ItemUnit.borrowed_count == 0, "New"),
            (models.ItemUnit.borrowed_count >= 6, "Worn"),
            else_="Good",
        )
        matching_units = db.scalars(
            select(models.ItemUnit)
            .where(
                models.ItemUnit.item_id == item_id,
                models.ItemUnit.is_checked_out.is_(False),
                models.ItemUnit.is_broken.is_(False),
                models.ItemUnit.is_lost.is_(False),
                unit_condition == payload.condition,
            )
            .limit(payload.quantity)
            .with_for_update()
        ).all()
        new_is_broken = True
    if len(matching_units) < payload.quantity:
        raise HTTPException(status_code=409, detail="The requested quantity is no longer available in this condition")
    for unit in matching_units:
        unit.is_broken = new_is_broken
    quantity_delta = -payload.quantity if new_is_broken else payload.quantity
    quantity_update = update(models.Item).where(models.Item.id == item_id)
    if new_is_broken:
        quantity_update = quantity_update.where(models.Item.quantity >= payload.quantity)
    result = db.execute(
        quantity_update.values(quantity=models.Item.quantity + quantity_delta)
    )
    if result.rowcount != 1:
        db.rollback()
        raise HTTPException(status_code=409, detail="Item stock changed while updating its condition")
    db.commit()
    db.refresh(item)
    return _item_output_for_db(item, db)


def _borrow_request_output(request: models.BorrowRequest, db: Session):
    request_items = db.execute(
        select(models.BorrowRequestItem, models.Item.title, models.Item.quantity)
        .join(models.Item, models.Item.id == models.BorrowRequestItem.item_id)
        .where(models.BorrowRequestItem.request_id == request.id)
        .order_by(models.BorrowRequestItem.id)
    ).all()
    return {
        "id": request.id,
        "borrower_name": request.borrower_name,
        "status": request.status,
        "created_at": request.created_at,
        "due_date": request.due_date,
        "reviewed_at": request.reviewed_at,
        "items": [
            {
                "item_id": request_item.item_id,
                "item_title": title,
                "quantity": request_item.quantity,
                "available_quantity": available_quantity,
            }
            for request_item, title, available_quantity in request_items
        ],
    }


@router.post(
    "/requests",
    response_model=schemas.BorrowRequestOut,
    status_code=201,
    dependencies=[Depends(require_roles("user", "dev_user"))],
)
def create_borrow_request(
    payload: schemas.BorrowRequestCreate,
    borrower: models.UserAccount = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    request = models.BorrowRequest(
        borrower_name=borrower.username,
        due_date=payload.due_date,
        status="pending",
    )
    db.add(request)
    db.flush()

    for requested_item in payload.items:
        item = db.execute(
            select(models.Item)
            .where(
                models.Item.id == requested_item.item_id,
                models.Item.category == "stationery",
            )
        ).scalar_one_or_none()
        if item is None:
            db.rollback()
            raise HTTPException(
                status_code=404,
                detail=f"Stationery item {requested_item.item_id} was not found",
            )
        if requested_item.quantity > item.quantity:
            db.rollback()
            raise HTTPException(
                status_code=409,
                detail=f"Only {item.quantity} of {item.title} are currently available",
            )
        db.add(
            models.BorrowRequestItem(
                request_id=request.id,
                item_id=item.id,
                quantity=requested_item.quantity,
            )
        )

    db.commit()
    db.refresh(request)
    return _borrow_request_output(request, db)


@router.get("/requests", response_model=list[schemas.BorrowRequestOut])
def list_borrow_requests(
    borrower_name: str = Query(min_length=1, max_length=150),
    current_user: models.UserAccount = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role == "user" and borrower_name != current_user.username:
        raise HTTPException(status_code=403, detail="You can only view your own borrow requests")
    requests = db.scalars(
        select(models.BorrowRequest)
        .where(models.BorrowRequest.borrower_name == borrower_name)
        .order_by(models.BorrowRequest.created_at.desc())
    ).all()
    return [_borrow_request_output(request, db) for request in requests]


@router.get(
    "/requests/history",
    response_model=list[schemas.BorrowRequestOut],
    dependencies=[Depends(require_roles("admin", "dev_user"))],
)
def list_borrow_request_history(db: Session = Depends(get_db)):
    requests = db.scalars(
        select(models.BorrowRequest).order_by(models.BorrowRequest.created_at.desc())
    ).all()
    return [_borrow_request_output(request, db) for request in requests]


@router.get(
    "/requests/pending",
    response_model=list[schemas.BorrowRequestOut],
    dependencies=[Depends(require_roles("admin", "dev_user"))],
)
def list_pending_borrow_requests(db: Session = Depends(get_db)):
    requests = db.scalars(
        select(models.BorrowRequest)
        .where(models.BorrowRequest.status == "pending")
        .order_by(
            models.BorrowRequest.due_date.is_(None),
            models.BorrowRequest.due_date.asc(),
            models.BorrowRequest.created_at.asc(),
        )
    ).all()
    return [_borrow_request_output(request, db) for request in requests]


@router.patch(
    "/requests/{request_id}/decision",
    response_model=schemas.BorrowRequestOut,
    dependencies=[Depends(require_roles("admin", "dev_user"))],
)
def decide_borrow_request(
    request_id: int,
    payload: schemas.BorrowRequestDecision,
    db: Session = Depends(get_db),
):
    request = db.get(models.BorrowRequest, request_id)
    if request is None:
        raise HTTPException(status_code=404, detail="Borrow request not found")
    if request.status != "pending":
        raise HTTPException(status_code=409, detail="This request has already been reviewed")

    request_items = db.scalars(
        select(models.BorrowRequestItem)
        .where(models.BorrowRequestItem.request_id == request_id)
        .order_by(models.BorrowRequestItem.id)
    ).all()

    if payload.status == "approved":
        for request_item in request_items:
            allocation_order = case(
                (models.ItemUnit.borrowed_count.between(6, 10), 0),
                (models.ItemUnit.borrowed_count >= 1, 1),
                else_=2,
            )
            units = db.scalars(
                select(models.ItemUnit)
                .where(
                    models.ItemUnit.item_id == request_item.item_id,
                    models.ItemUnit.is_checked_out.is_(False),
                    models.ItemUnit.is_broken.is_(False),
                    models.ItemUnit.is_lost.is_(False),
                    models.ItemUnit.borrowed_count <= 10,
                )
                .order_by(allocation_order, models.ItemUnit.borrowed_count.desc())
                .limit(request_item.quantity)
                .with_for_update()
            ).all()
            if len(units) != request_item.quantity:
                db.rollback()
                raise HTTPException(
                    status_code=409,
                    detail="A requested item no longer has enough usable stock; request was not approved",
                )
            result = db.execute(
                update(models.Item)
                .where(
                    models.Item.id == request_item.item_id,
                    models.Item.category == "stationery",
                    models.Item.quantity >= request_item.quantity,
                )
                .values(quantity=models.Item.quantity - request_item.quantity)
            )
            if result.rowcount != 1:
                db.rollback()
                raise HTTPException(
                    status_code=409,
                    detail="A requested item no longer has enough stock; request was not approved",
                )
            borrow = models.ItemBorrow(
                request_id=request.id,
                item_id=request_item.item_id,
                borrower_name=request.borrower_name,
                quantity=request_item.quantity,
                due_date=request.due_date,
                status="checked_out",
            )
            db.add(borrow)
            db.flush()
            for unit in units:
                unit.is_checked_out = True
                db.add(models.ItemBorrowUnit(item_borrow_id=borrow.id, item_unit_id=unit.id))

    result = db.execute(
        update(models.BorrowRequest)
        .where(
            models.BorrowRequest.id == request_id,
            models.BorrowRequest.status == "pending",
        )
        .values(status=payload.status, reviewed_at=datetime.now())
    )
    if result.rowcount != 1:
        db.rollback()
        raise HTTPException(status_code=409, detail="This request has already been reviewed")

    db.commit()
    db.refresh(request)
    return _borrow_request_output(request, db)


@router.get("/loans", response_model=list[schemas.ItemBorrowOut])
def list_item_borrows(
    borrower_name: str = Query(min_length=1, max_length=150),
    current_user: models.UserAccount = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role == "user" and borrower_name != current_user.username:
        raise HTTPException(status_code=403, detail="You can only view your own borrow history")
    rows = db.execute(
        select(models.ItemBorrow, models.Item.title, models.Item.quantity)
        .join(models.Item, models.Item.id == models.ItemBorrow.item_id)
        .where(
            models.ItemBorrow.borrower_name == borrower_name,
        )
        .order_by(models.ItemBorrow.borrowed_at.desc())
    ).all()
    return [
        {
            "id": borrow.id,
            "request_id": borrow.request_id,
            "item_id": borrow.item_id,
            "item_title": title,
            "available_quantity": available_quantity,
            "borrower_name": borrow.borrower_name,
            "quantity": borrow.quantity,
            "borrowed_at": borrow.borrowed_at,
            "due_date": borrow.due_date,
            "return_requested_at": borrow.return_requested_at,
            "return_reviewed_at": borrow.return_reviewed_at,
            "return_decision": borrow.return_decision,
            "return_condition": borrow.return_condition,
            "returned_at": borrow.returned_at,
            "status": borrow.status,
        }
        for borrow, title, available_quantity in rows
    ]


@router.get(
    "/loans/returns/pending",
    response_model=list[schemas.ItemBorrowOut],
    dependencies=[Depends(require_roles("admin", "dev_user"))],
)
def list_pending_returns(db: Session = Depends(get_db)):
    rows = db.execute(
        select(models.ItemBorrow, models.Item.title, models.Item.quantity)
        .join(models.Item, models.Item.id == models.ItemBorrow.item_id)
        .where(models.ItemBorrow.status == "return_requested")
        .order_by(models.ItemBorrow.return_requested_at.asc())
    ).all()
    return [
        _item_borrow_output(borrow, title, available_quantity)
        for borrow, title, available_quantity in rows
    ]


@router.get(
    "/loans/checked-out",
    response_model=list[schemas.ItemBorrowOut],
    dependencies=[Depends(require_roles("admin", "dev_user"))],
)
def list_checked_out_loans(db: Session = Depends(get_db)):
    rows = db.execute(
        select(models.ItemBorrow, models.Item.title, models.Item.quantity)
        .join(models.Item, models.Item.id == models.ItemBorrow.item_id)
        .where(models.ItemBorrow.status == "checked_out")
        .order_by(models.ItemBorrow.borrowed_at.asc())
    ).all()
    return [
        _item_borrow_output(borrow, title, available_quantity)
        for borrow, title, available_quantity in rows
    ]


def _item_borrow_output(
    borrow: models.ItemBorrow,
    item_title: str,
    available_quantity: int,
):
    return {
        "id": borrow.id,
        "request_id": borrow.request_id,
        "item_id": borrow.item_id,
        "item_title": item_title,
        "available_quantity": available_quantity,
        "borrower_name": borrow.borrower_name,
        "quantity": borrow.quantity,
        "borrowed_at": borrow.borrowed_at,
        "due_date": borrow.due_date,
        "return_requested_at": borrow.return_requested_at,
        "return_reviewed_at": borrow.return_reviewed_at,
        "return_decision": borrow.return_decision,
        "return_condition": borrow.return_condition,
        "returned_at": borrow.returned_at,
        "status": borrow.status,
    }


@router.patch(
    "/loans/{loan_id}/return-decision",
    response_model=schemas.ItemBorrowOut,
    dependencies=[Depends(require_roles("admin", "dev_user"))],
)
def decide_item_return(
    loan_id: int,
    payload: schemas.ItemBorrowReturnDecision,
    db: Session = Depends(get_db),
):
    borrow = db.get(models.ItemBorrow, loan_id)
    if borrow is None:
        raise HTTPException(status_code=404, detail="Borrow record not found")
    if borrow.status not in ("checked_out", "return_requested"):
        raise HTTPException(status_code=409, detail="This loan is not awaiting return confirmation")
    if payload.status == "rejected" and borrow.status != "return_requested":
        raise HTTPException(status_code=409, detail="There is no borrower return report to reject")

    if payload.status == "rejected":
        now = datetime.now()
        result = db.execute(
            update(models.ItemBorrow)
            .where(
                models.ItemBorrow.id == loan_id,
                models.ItemBorrow.status == "return_requested",
            )
            .values(
                status="checked_out",
                return_reviewed_at=now,
                return_decision="rejected",
            )
        )
        if result.rowcount != 1:
            db.rollback()
            raise HTTPException(status_code=409, detail="This return report has already been reviewed")
    else:
        borrowed_units = db.scalars(
            select(models.ItemUnit)
            .join(
                models.ItemBorrowUnit,
                models.ItemBorrowUnit.item_unit_id == models.ItemUnit.id,
            )
            .where(models.ItemBorrowUnit.item_borrow_id == loan_id)
            .with_for_update()
        ).all()
        if len(borrowed_units) != borrow.quantity:
            raise HTTPException(status_code=409, detail="Borrowed unit history is incomplete; cannot safely confirm this return")
        if any(not unit.is_checked_out for unit in borrowed_units):
            db.rollback()
            raise HTTPException(status_code=409, detail="A borrowed unit is no longer checked out")

        now = datetime.now()
        return_condition = {
            "confirmed": "good",
            "broken": "broken",
            "lost": "lost",
        }[payload.status]
        result = db.execute(
            update(models.ItemBorrow)
            .where(
                models.ItemBorrow.id == loan_id,
                models.ItemBorrow.status == borrow.status,
            )
            .values(
                status="returned",
                return_reviewed_at=now,
                return_decision="confirmed",
                return_condition=return_condition,
                returned_at=now,
            )
        )
        if result.rowcount != 1:
            db.rollback()
            raise HTTPException(status_code=409, detail="This return report has already been reviewed")

        for unit in borrowed_units:
            unit.is_checked_out = False
            if payload.status != "lost":
                unit.borrowed_count += 1
            if payload.status == "broken" or unit.borrowed_count > 10:
                unit.is_broken = True
            if payload.status == "lost":
                unit.is_lost = True

        db.execute(
            update(models.Item)
            .where(models.Item.id == borrow.item_id)
            .values(
                quantity=models.Item.quantity + sum(
                    not unit.is_broken and not unit.is_lost
                    for unit in borrowed_units
                )
            )
        )

    db.commit()
    db.refresh(borrow)
    item = db.get(models.Item, borrow.item_id)
    return _item_borrow_output(borrow, item.title, item.quantity)