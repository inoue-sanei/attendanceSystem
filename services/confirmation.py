from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import extract
from fastapi import HTTPException, status
from models import MonthlyConfirmation, AttendanceRecord, LeaveReviewRequest
from schemas import MonthConfirmationResponse
from exceptions import MonthAlreadyConfirmedError


def get_confirmation(db: Session, user_id: int, year: int, month: int) -> MonthConfirmationResponse:
    record = db.query(MonthlyConfirmation).filter(
        MonthlyConfirmation.user_id == user_id,
        MonthlyConfirmation.year == year,
        MonthlyConfirmation.month == month,
    ).first()
    if record is None:
        return MonthConfirmationResponse(confirmed=False, year=year, month=month)
    return MonthConfirmationResponse(
        confirmed=True,
        year=year,
        month=month,
        approval_status=record.approval_status,
        rejection_reason=record.rejection_reason,
    )


def confirm_month(db: Session, user_id: int, year: int, month: int) -> MonthConfirmationResponse:
    # 当月に未承認の有給申請がある場合は確定を拒否
    pending_leave_count = (
        db.query(AttendanceRecord)
        .filter(
            AttendanceRecord.user_id == user_id,
            extract("year", AttendanceRecord.date) == year,
            extract("month", AttendanceRecord.date) == month,
            AttendanceRecord.paid_leave_approval_status == "PENDING",
        )
        .count()
    )
    if pending_leave_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="PENDING_LEAVE_APPROVAL",
        )

    existing = db.query(MonthlyConfirmation).filter(
        MonthlyConfirmation.user_id == user_id,
        MonthlyConfirmation.year == year,
        MonthlyConfirmation.month == month,
    ).first()

    if existing:
        if existing.approval_status in ("PENDING", "APPROVED"):
            raise MonthAlreadyConfirmedError(f"{year}年{month}月は既に確定済みです")
        # REJECTED の場合は削除して再申請
        db.delete(existing)
        db.flush()

    record = MonthlyConfirmation(
        user_id=user_id,
        year=year,
        month=month,
        confirmed_at=datetime.now(),
        approval_status="PENDING",
    )
    db.add(record)
    db.commit()
    return MonthConfirmationResponse(
        confirmed=True,
        year=year,
        month=month,
        approval_status="PENDING",
    )


def request_leave_review(db: Session, user_id: int, year: int, month: int) -> None:
    """管理者への有給承認催促通知を作成（同月分は上書き）"""
    existing = db.query(LeaveReviewRequest).filter(
        LeaveReviewRequest.user_id == user_id,
        LeaveReviewRequest.year == year,
        LeaveReviewRequest.month == month,
    ).first()
    if existing:
        existing.created_at = datetime.now()
        existing.is_read = False
    else:
        db.add(LeaveReviewRequest(
            user_id=user_id,
            year=year,
            month=month,
            created_at=datetime.now(),
            is_read=False,
        ))
    db.commit()
