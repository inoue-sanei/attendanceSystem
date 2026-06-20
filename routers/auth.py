from datetime import timedelta, date as date_type

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import extract

from database import get_db
from models import User, AttendanceRecord
from schemas import (
    MypageResponse, PasswordChangeRequest, Token,
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
    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": UserResponse.model_validate(user),
    }


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
            extract("year", AttendanceRecord.date) == y,
            extract("month", AttendanceRecord.date) == m,
        )
        .all()
    )
    attendance_count = sum(1 for r in month_records if r.type in ("PRESENT", "LATE", "EARLY_LEAVE"))
    absence_count    = sum(1 for r in month_records if r.type == "ABSENT")

    # 今年度の有休消化集計（暦年）
    year_records = (
        db.query(AttendanceRecord)
        .filter(extract("year", AttendanceRecord.date) == y)
        .all()
    )
    paid_used = sum(1.0 for r in year_records if r.type == "ABSENT" and r.paid_leave)
    paid_used += sum(0.5 for r in year_records if r.type in ("LATE", "EARLY_LEAVE") and r.half_paid_leave)

    total = current_user.paid_leave_days if current_user.paid_leave_days is not None else 20
    remaining = max(0.0, total - paid_used)

    paid_leave_month = current_user.paid_leave_month if current_user.paid_leave_month is not None else 4

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
    )
