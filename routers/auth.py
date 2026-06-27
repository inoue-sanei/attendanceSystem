import uuid
from datetime import timedelta, date as date_type, datetime as datetime_type

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import extract

from database import get_db
from models import User, AttendanceRecord, MonthlyConfirmation
from schemas import (
    MypageResponse, MonthConfirmationStatus, PaidLeaveStatusItem,
    PasswordChangeRequest, Token, TYPE_LABELS,
    UserLoginRequest, UserRegisterRequest, UserRegisterResponse, UserResponse,
)
from services.auth import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    authenticate_user,
    create_access_token,
    create_user,
    get_current_user,
    get_user_by_email,
    get_user_by_username,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserRegisterResponse, status_code=status.HTTP_201_CREATED)
def register(request: UserRegisterRequest, db: Session = Depends(get_db)):
    """新規ユーザー登録"""
    if get_user_by_username(db, request.username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="このユーザー名は既に使用されています。",
        )
    if get_user_by_email(db, request.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="このメールアドレスは既に登録されています。",
        )
    return create_user(db, request.username, request.email, request.password)


@router.post("/login", response_model=Token)
def login(request: UserLoginRequest, db: Session = Depends(get_db)):
    """メールアドレスとパスワードでログイン"""
    user = authenticate_user(db, request.email, request.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="メールアドレスまたはパスワードが正しくありません。",
            headers={"WWW-Authenticate": "Bearer"},
        )
    jti = str(uuid.uuid4())
    access_token = create_access_token(
        data={"sub": str(user.id), "jti": jti},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    user.session_token = jti
    db.commit()
    return Token(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """セッショントークンを無効化してログアウト"""
    current_user.session_token = None
    db.commit()


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    """現在のログインユーザー情報を取得"""
    return current_user


@router.put("/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    request: PasswordChangeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """パスワード変更"""
    if not verify_password(request.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="現在のパスワードが正しくありません。",
        )
    if len(request.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="新しいパスワードは8文字以上で入力してください。",
        )
    current_user.hashed_password = hash_password(request.new_password)
    db.commit()


@router.get("/mypage", response_model=MypageResponse)
def mypage(
    year: int | None = None,
    month: int | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """マイページ用データを返す"""
    today = date_type.today()
    y = year or today.year
    m = month or today.month

    # 当月の勤怠集計
    month_records = (
        db.query(AttendanceRecord)
        .filter(
            AttendanceRecord.user_id == current_user.id,
            extract("year", AttendanceRecord.date) == y,
            extract("month", AttendanceRecord.date) == m,
        )
        .all()
    )
    attendance_count = sum(1 for r in month_records if r.type in ("PRESENT", "LATE", "EARLY_LEAVE"))
    absence_count    = sum(1 for r in month_records if r.type == "ABSENT")

    # 稼働時間・残業時間の計算（1日8時間＝480分を基準、休憩時間を除く）
    STANDARD_WORK_MINUTES = 8 * 60
    total_work_minutes = 0
    overtime_minutes = 0
    for r in month_records:
        if r.start_time and r.end_time:
            start_dt = datetime_type.combine(r.date, r.start_time)
            end_dt   = datetime_type.combine(r.date, r.end_time)
            gross = int((end_dt - start_dt).total_seconds() / 60)
            if r.break_start and r.break_end:
                bs_dt = datetime_type.combine(r.date, r.break_start)
                be_dt = datetime_type.combine(r.date, r.break_end)
                break_mins = max(0, int((be_dt - bs_dt).total_seconds() / 60))
            else:
                break_mins = 0
            net = gross - break_mins
            if net > 0:
                total_work_minutes += net
                overtime_minutes   += max(0, net - STANDARD_WORK_MINUTES)

    # 今年度の有休消化集計（暦年）
    year_records = (
        db.query(AttendanceRecord)
        .filter(
            AttendanceRecord.user_id == current_user.id,
            extract("year", AttendanceRecord.date) == y,
        )
        .all()
    )
    paid_used = sum(1.0 for r in year_records if r.type == "ABSENT" and r.paid_leave)
    paid_used += sum(0.5 for r in year_records if r.type in ("LATE", "EARLY_LEAVE") and r.half_paid_leave)

    total = current_user.paid_leave_days if current_user.paid_leave_days is not None else 20
    remaining = max(0.0, total - paid_used)

    paid_leave_month = current_user.paid_leave_month if current_user.paid_leave_month is not None else 4

    # 月次申請ステータス（直近6ヶ月）
    mc_list = []
    mc_y, mc_m = today.year, today.month
    for _ in range(6):
        mc = db.query(MonthlyConfirmation).filter(
            MonthlyConfirmation.user_id == current_user.id,
            MonthlyConfirmation.year == mc_y,
            MonthlyConfirmation.month == mc_m,
        ).first()
        mc_list.append(MonthConfirmationStatus(
            year=mc_y,
            month=mc_m,
            approval_status=mc.approval_status if mc else None,
            rejection_reason=mc.rejection_reason if mc else None,
        ))
        mc_m -= 1
        if mc_m == 0:
            mc_m = 12
            mc_y -= 1
    mc_list.reverse()

    # 有給申請ステータス（今年度の全申請）
    pl_records = (
        db.query(AttendanceRecord)
        .filter(
            AttendanceRecord.user_id == current_user.id,
            extract("year", AttendanceRecord.date) == today.year,
            AttendanceRecord.paid_leave_approval_status.isnot(None),
        )
        .order_by(AttendanceRecord.date)
        .all()
    )
    _pl_type_label = {
        "ABSENT": "欠勤（有給）",
        "LATE": "遅刻（半休）",
        "EARLY_LEAVE": "早退（半休）",
    }
    pl_statuses = [
        PaidLeaveStatusItem(
            id=r.id,
            date=r.date,
            type_label=_pl_type_label.get(r.type, TYPE_LABELS.get(r.type, r.type)),
            approval_status=r.paid_leave_approval_status,
            rejection_reason=r.paid_leave_rejection_reason,
        )
        for r in pl_records
    ]

    return MypageResponse(
        username=current_user.username,
        email=current_user.email,
        paid_leave_days=total,
        paid_leave_month=paid_leave_month,
        year=y,
        month=m,
        attendance_count=attendance_count,
        absence_count=absence_count,
        paid_leave_used=paid_used,
        paid_leave_remaining=remaining,
        total_work_minutes=total_work_minutes,
        overtime_minutes=overtime_minutes,
        month_confirmations=mc_list,
        paid_leave_statuses=pl_statuses,
    )
