from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, select, text
from .database import Base, SessionLocal, engine
from . import models
from .routers import auth, items
from .security import bootstrap_admin

Base.metadata.create_all(bind=engine)
with SessionLocal() as db:
    bootstrap_admin(db)

# Add new inventory columns to existing databases.
inspector = inspect(engine)
if "items" in inspector.get_table_names():
    item_columns = {column["name"] for column in inspector.get_columns("items")}
    with engine.begin() as connection:
        if "category" not in item_columns:
            connection.execute(text(
                "ALTER TABLE items ADD COLUMN category VARCHAR(50) NOT NULL DEFAULT 'stationery'"
            ))
        if "quantity" not in item_columns:
            connection.execute(text(
                "ALTER TABLE items ADD COLUMN quantity INTEGER NOT NULL DEFAULT 0"
            ))
        if "is_broken" not in item_columns:
            connection.execute(text(
                "ALTER TABLE items ADD COLUMN is_broken BOOLEAN NOT NULL DEFAULT FALSE"
            ))

# Existing requests/loans remain valid without a due date; new requests require one.
inspector = inspect(engine)
with engine.begin() as connection:
    if "borrow_requests" in inspector.get_table_names():
        request_columns = {column["name"] for column in inspector.get_columns("borrow_requests")}
        if "due_date" not in request_columns:
            connection.execute(text("ALTER TABLE borrow_requests ADD COLUMN due_date DATE NULL"))
    if "item_borrows" in inspector.get_table_names():
        borrow_columns = {column["name"] for column in inspector.get_columns("item_borrows")}
        if "request_id" not in borrow_columns:
            connection.execute(text(
                "ALTER TABLE item_borrows ADD COLUMN request_id INTEGER NULL"
            ))
        if "due_date" not in borrow_columns:
            connection.execute(text("ALTER TABLE item_borrows ADD COLUMN due_date DATE NULL"))
        if "return_requested_at" not in borrow_columns:
            connection.execute(text("ALTER TABLE item_borrows ADD COLUMN return_requested_at DATETIME NULL"))
        if "return_reviewed_at" not in borrow_columns:
            connection.execute(text("ALTER TABLE item_borrows ADD COLUMN return_reviewed_at DATETIME NULL"))
        if "return_decision" not in borrow_columns:
            connection.execute(text("ALTER TABLE item_borrows ADD COLUMN return_decision VARCHAR(30) NULL"))
        if "return_condition" not in borrow_columns:
            connection.execute(text("ALTER TABLE item_borrows ADD COLUMN return_condition VARCHAR(30) NULL"))
    if "item_units" in inspector.get_table_names():
        unit_columns = {column["name"] for column in inspector.get_columns("item_units")}
        if "is_lost" not in unit_columns:
            connection.execute(text(
                "ALTER TABLE item_units ADD COLUMN is_lost BOOLEAN NOT NULL DEFAULT FALSE"
            ))

with SessionLocal() as db:
    inventory = db.scalars(select(models.Item).order_by(models.Item.id)).all()
    for item in inventory:
        existing_unit = db.scalar(
            select(models.ItemUnit.id)
            .where(models.ItemUnit.item_id == item.id)
            .limit(1)
        )
        if existing_unit is None and item.quantity:
            initial_quantity = item.quantity
            db.add_all(
                models.ItemUnit(
                    item_id=item.id,
                    borrowed_count=0,
                    is_broken=item.is_broken,
                )
                for _ in range(initial_quantity)
            )
            if item.is_broken:
                item.quantity = 0
            db.flush()

        active_loans = db.scalars(
            select(models.ItemBorrow).where(
                models.ItemBorrow.item_id == item.id,
                models.ItemBorrow.status == "checked_out",
            )
        ).all()
        for loan in active_loans:
            linked_unit_ids = set(db.scalars(
                select(models.ItemBorrowUnit.item_unit_id)
                .where(models.ItemBorrowUnit.item_borrow_id == loan.id)
            ).all())
            missing_units = loan.quantity - len(linked_unit_ids)
            if missing_units < 0:
                raise RuntimeError(f"Borrow record {loan.id} has more linked units than its quantity")
            if missing_units:
                units = [
                    models.ItemUnit(
                        item_id=item.id,
                        borrowed_count=1,
                        is_checked_out=True,
                    )
                    for _ in range(missing_units)
                ]
                db.add_all(units)
                db.flush()
                db.add_all(
                    models.ItemBorrowUnit(item_borrow_id=loan.id, item_unit_id=unit.id)
                    for unit in units
                )

        has_borrow_history = db.scalar(
            select(models.ItemBorrow.id)
            .where(models.ItemBorrow.item_id == item.id)
            .limit(1)
        )
        if has_borrow_history is None:
            db.execute(
                models.ItemUnit.__table__.update()
                .where(models.ItemUnit.item_id == item.id)
                .values(borrowed_count=0)
            )
    db.commit()

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(items.router)
app.include_router(auth.router)

@app.get("/health")
def health():
    return {"status": "ok"}