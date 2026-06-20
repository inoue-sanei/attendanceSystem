from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.exceptions import RequestValidationError
from sqlalchemy import inspect, text
from database import Base, engine
from exceptions import AttendanceAlreadyExistsError, AttendanceNotFoundError, MonthAlreadyConfirmedError
from routers import attendance, pages, confirmation, holidays, auth, board

# テーブル作成（初回起動時）
Base.metadata.create_all(bind=engine)


def _migrate() -> None:
    """既存テーブルへの新カラム追加マイグレーション"""
    with engine.connect() as conn:
        inspector = inspect(engine)
        if inspector.has_table("attendance_records"):
            existing = {c["name"] for c in inspector.get_columns("attendance_records")}
            new_cols = {
                "paid_leave":         "ALTER TABLE attendance_records ADD COLUMN paid_leave BOOLEAN NOT NULL DEFAULT 0",
                "half_paid_leave":    "ALTER TABLE attendance_records ADD COLUMN half_paid_leave BOOLEAN NOT NULL DEFAULT 0",
                "work_location":      "ALTER TABLE attendance_records ADD COLUMN work_location VARCHAR",
                "work_description":   "ALTER TABLE attendance_records ADD COLUMN work_description TEXT",
                "departure_station":  "ALTER TABLE attendance_records ADD COLUMN departure_station VARCHAR",
                "via_station":        "ALTER TABLE attendance_records ADD COLUMN via_station VARCHAR",
                "arrival_station":    "ALTER TABLE attendance_records ADD COLUMN arrival_station VARCHAR",
                "transport_cost":     "ALTER TABLE attendance_records ADD COLUMN transport_cost INTEGER",
                "reason":            "ALTER TABLE attendance_records ADD COLUMN reason TEXT",
            }
            for col, sql in new_cols.items():
                if col not in existing:
                    conn.execute(text(sql))
            conn.commit()

        # users テーブルへの追加カラム
        if inspector.has_table("users"):
            user_cols = {c["name"] for c in inspector.get_columns("users")}
            if "paid_leave_days" not in user_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN paid_leave_days INTEGER NOT NULL DEFAULT 20"))
                conn.commit()
            if "paid_leave_month" not in user_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN paid_leave_month INTEGER NOT NULL DEFAULT 4"))
                conn.commit()

        # bulletin_threads / bulletin_comments への updated_at 追加
        if inspector.has_table("bulletin_threads"):
            t_cols = {c["name"] for c in inspector.get_columns("bulletin_threads")}
            if "updated_at" not in t_cols:
                conn.execute(text("ALTER TABLE bulletin_threads ADD COLUMN updated_at DATETIME"))
                conn.commit()
        if inspector.has_table("bulletin_comments"):
            c_cols = {c["name"] for c in inspector.get_columns("bulletin_comments")}
            if "updated_at" not in c_cols:
                conn.execute(text("ALTER TABLE bulletin_comments ADD COLUMN updated_at DATETIME"))
                conn.commit()


_migrate()

app = FastAPI(title="勤怠管理API", docs_url="/docs")
app.mount("/static", StaticFiles(directory="static"), name="static")

app.include_router(auth.router)
app.include_router(attendance.router)
app.include_router(confirmation.router)
app.include_router(holidays.router)
app.include_router(board.router)
app.include_router(pages.router)


# 業務エラーを {"message": "..."} 形式で返す
@app.exception_handler(AttendanceAlreadyExistsError)
async def already_exists_handler(request: Request, exc: AttendanceAlreadyExistsError):
    return JSONResponse(status_code=400, content={"message": str(exc)})


@app.exception_handler(AttendanceNotFoundError)
async def not_found_handler(request: Request, exc: AttendanceNotFoundError):
    return JSONResponse(status_code=404, content={"message": str(exc)})


@app.exception_handler(MonthAlreadyConfirmedError)
async def confirmed_handler(request: Request, exc: MonthAlreadyConfirmedError):
    return JSONResponse(status_code=409, content={"message": str(exc)})


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    msgs = [e["msg"] for e in exc.errors()]
    return JSONResponse(status_code=422, content={"message": ", ".join(msgs)})
