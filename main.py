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

        # ──────────────────────────────
        # users: is_admin / role カラム追加
        # ──────────────────────────────
        if inspector.has_table("users"):
            user_cols = {c["name"] for c in inspector.get_columns("users")}
            simple_migrations = {
                "paid_leave_days":  "ALTER TABLE users ADD COLUMN paid_leave_days INTEGER NOT NULL DEFAULT 20",
                "paid_leave_month": "ALTER TABLE users ADD COLUMN paid_leave_month INTEGER NOT NULL DEFAULT 4",
                "is_admin":         "ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT 0",
                "role":             "ALTER TABLE users ADD COLUMN role VARCHAR(100)",
                "session_token":    "ALTER TABLE users ADD COLUMN session_token VARCHAR(64)",
            }
            for col, sql in simple_migrations.items():
                if col not in user_cols:
                    conn.execute(text(sql))
            conn.commit()

        # ──────────────────────────────
        # attendance_records: user_id + 承認フィールド
        #   user_id が無い場合はテーブルを再作成して制約を変更する
        # ──────────────────────────────
        if inspector.has_table("attendance_records"):
            ar_cols = {c["name"] for c in inspector.get_columns("attendance_records")}

            if "user_id" not in ar_cols:
                # 既存ユーザーを取得（orphan レコードを最初のユーザーに割り当て）
                row = conn.execute(text("SELECT id FROM users ORDER BY id LIMIT 1")).fetchone()
                first_uid = row[0] if row else 1

                conn.execute(text("""
                    CREATE TABLE attendance_records_new (
                        id INTEGER NOT NULL,
                        user_id INTEGER NOT NULL DEFAULT 1,
                        date DATE NOT NULL,
                        type VARCHAR NOT NULL,
                        start_time TIME,
                        end_time TIME,
                        note VARCHAR,
                        paid_leave BOOLEAN NOT NULL DEFAULT 0,
                        half_paid_leave BOOLEAN NOT NULL DEFAULT 0,
                        work_location VARCHAR,
                        work_description TEXT,
                        departure_station VARCHAR,
                        via_station VARCHAR,
                        arrival_station VARCHAR,
                        transport_cost INTEGER,
                        reason TEXT,
                        paid_leave_approval_status VARCHAR,
                        paid_leave_rejection_reason TEXT,
                        PRIMARY KEY (id),
                        UNIQUE (user_id, date),
                        FOREIGN KEY(user_id) REFERENCES users (id)
                    )
                """))

                conn.execute(text(f"""
                    INSERT INTO attendance_records_new
                    (id, user_id, date, type, start_time, end_time, note,
                     paid_leave, half_paid_leave, work_location, work_description,
                     departure_station, via_station, arrival_station, transport_cost,
                     reason, paid_leave_approval_status, paid_leave_rejection_reason)
                    SELECT id, {first_uid}, date, type, start_time, end_time, note,
                           COALESCE(paid_leave, 0), COALESCE(half_paid_leave, 0),
                           work_location, work_description,
                           departure_station, via_station, arrival_station, transport_cost,
                           reason, NULL, NULL
                    FROM attendance_records
                """))

                conn.execute(text("DROP TABLE attendance_records"))
                conn.execute(text("ALTER TABLE attendance_records_new RENAME TO attendance_records"))
                conn.commit()
            else:
                # user_id はあるが不足フィールドのみ追加
                for col, sql in {
                    "paid_leave_approval_status":  "ALTER TABLE attendance_records ADD COLUMN paid_leave_approval_status VARCHAR",
                    "paid_leave_rejection_reason": "ALTER TABLE attendance_records ADD COLUMN paid_leave_rejection_reason TEXT",
                    "break_minutes":               "ALTER TABLE attendance_records ADD COLUMN break_minutes INTEGER",
                    "break_start":                 "ALTER TABLE attendance_records ADD COLUMN break_start TIME",
                    "break_end":                   "ALTER TABLE attendance_records ADD COLUMN break_end TIME",
                }.items():
                    if col not in ar_cols:
                        conn.execute(text(sql))
                conn.commit()

        # ──────────────────────────────
        # monthly_confirmations: user_id + 承認フィールド
        # ──────────────────────────────
        if inspector.has_table("monthly_confirmations"):
            mc_cols = {c["name"] for c in inspector.get_columns("monthly_confirmations")}

            if "user_id" not in mc_cols:
                row = conn.execute(text("SELECT id FROM users ORDER BY id LIMIT 1")).fetchone()
                first_uid = row[0] if row else 1

                conn.execute(text("""
                    CREATE TABLE monthly_confirmations_new (
                        id INTEGER NOT NULL,
                        user_id INTEGER NOT NULL DEFAULT 1,
                        year INTEGER NOT NULL,
                        month INTEGER NOT NULL,
                        confirmed_at DATETIME NOT NULL,
                        approval_status VARCHAR DEFAULT 'PENDING',
                        rejection_reason TEXT,
                        approved_at DATETIME,
                        PRIMARY KEY (id),
                        UNIQUE (user_id, year, month),
                        FOREIGN KEY(user_id) REFERENCES users (id)
                    )
                """))

                conn.execute(text(f"""
                    INSERT INTO monthly_confirmations_new
                    (id, user_id, year, month, confirmed_at,
                     approval_status, rejection_reason, approved_at)
                    SELECT id, {first_uid}, year, month, confirmed_at,
                           'PENDING', NULL, NULL
                    FROM monthly_confirmations
                """))

                conn.execute(text("DROP TABLE monthly_confirmations"))
                conn.execute(text("ALTER TABLE monthly_confirmations_new RENAME TO monthly_confirmations"))
                conn.commit()
            else:
                for col, sql in {
                    "approval_status":  "ALTER TABLE monthly_confirmations ADD COLUMN approval_status VARCHAR DEFAULT 'PENDING'",
                    "rejection_reason": "ALTER TABLE monthly_confirmations ADD COLUMN rejection_reason TEXT",
                    "approved_at":      "ALTER TABLE monthly_confirmations ADD COLUMN approved_at DATETIME",
                }.items():
                    if col not in mc_cols:
                        conn.execute(text(sql))
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

from routers import admin as admin_router

app.include_router(auth.router)
app.include_router(attendance.router)
app.include_router(confirmation.router)
app.include_router(holidays.router)
app.include_router(board.router)
app.include_router(admin_router.router)
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
