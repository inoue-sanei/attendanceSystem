from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import extract

from models import User, AttendanceRecord, MonthlyConfirmation, LeaveReviewRequest
from schemas import (
    AdminUserCreateRequest, AdminUserUpdateRequest, AdminUserResponse,
    MonthlyApprovalItem, PaidLeaveApprovalItem, AdminDashboardResponse,
    AttendanceResponse, AttendanceType, TYPE_LABELS, LeaveReviewRequestItem,
)
from services.auth import hash_password, get_user_by_email, get_user_by_username
from fastapi import HTTPException, status


def _to_attendance_response(record: AttendanceRecord) -> AttendanceResponse:
    def _from_csv(v):
        return v.split(",") if v else None

    return AttendanceResponse(
        id=record.id,
        date=record.date,
        type=AttendanceType(record.type),
        type_label=TYPE_LABELS[record.type],
        start_time=record.start_time,
        end_time=record.end_time,
        note=record.note,
        paid_leave=bool(record.paid_leave),
        half_paid_leave=bool(record.half_paid_leave),
        work_location=_from_csv(record.work_location),
        work_description=record.work_description,
        departure_station=record.departure_station,
        via_station=_from_csv(record.via_station),
        arrival_station=record.arrival_station,
        transport_cost=record.transport_cost,
        reason=record.reason,
        paid_leave_approval_status=record.paid_leave_approval_status,
        paid_leave_rejection_reason=record.paid_leave_rejection_reason,
    )


# ── ダッシュボード ──────────────────────────────────

def get_dashboard(db: Session) -> AdminDashboardResponse:
    user_count = db.query(User).filter(User.is_admin == False, User.is_active == True).count()
    pending_monthly = db.query(MonthlyConfirmation).filter(
        MonthlyConfirmation.approval_status == "PENDING"
    ).count()
    pending_leave = db.query(AttendanceRecord).filter(
        AttendanceRecord.paid_leave_approval_status == "PENDING"
    ).count()
    leave_review_requests = db.query(LeaveReviewRequest).filter(
        LeaveReviewRequest.is_read == False
    ).count()
    return AdminDashboardResponse(
        user_count=user_count,
        pending_monthly_count=pending_monthly,
        pending_leave_count=pending_leave,
        leave_review_request_count=leave_review_requests,
    )


def get_leave_review_requests(db: Session) -> list[LeaveReviewRequestItem]:
    requests = (
        db.query(LeaveReviewRequest)
        .join(User, LeaveReviewRequest.user_id == User.id)
        .filter(LeaveReviewRequest.is_read == False)
        .order_by(LeaveReviewRequest.created_at.desc())
        .all()
    )
    return [
        LeaveReviewRequestItem(
            id=r.id,
            user_id=r.user_id,
            username=r.user.username,
            year=r.year,
            month=r.month,
            created_at=r.created_at.strftime("%Y-%m-%d %H:%M"),
        )
        for r in requests
    ]


def mark_leave_review_requests_read(db: Session) -> None:
    db.query(LeaveReviewRequest).filter(LeaveReviewRequest.is_read == False).update({"is_read": True})
    db.commit()


# ── ユーザー管理 ────────────────────────────────────

def list_workers(db: Session) -> list[AdminUserResponse]:
    users = db.query(User).filter(User.is_admin == False).order_by(User.id).all()
    return [AdminUserResponse.model_validate(u) for u in users]


def create_worker(db: Session, req: AdminUserCreateRequest) -> AdminUserResponse:
    if get_user_by_username(db, req.username):
        raise HTTPException(status_code=400, detail="このユーザー名は既に使用されています。")
    if get_user_by_email(db, req.email):
        raise HTTPException(status_code=400, detail="このメールアドレスは既に登録されています。")

    now = datetime.utcnow()
    user = User(
        username=req.username,
        email=req.email,
        hashed_password=hash_password(req.password),
        is_active=True,
        is_admin=False,
        role=req.role,
        paid_leave_days=req.paid_leave_days,
        paid_leave_month=req.paid_leave_month,
        created_at=now,
        updated_at=now,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return AdminUserResponse.model_validate(user)


def update_worker(db: Session, user_id: int, req: AdminUserUpdateRequest) -> AdminUserResponse:
    user = db.query(User).filter(User.id == user_id, User.is_admin == False).first()
    if not user:
        raise HTTPException(status_code=404, detail="作業者が見つかりません。")

    # username / email 重複チェック（自分以外）
    dup_name = db.query(User).filter(User.username == req.username, User.id != user_id).first()
    if dup_name:
        raise HTTPException(status_code=400, detail="このユーザー名は既に使用されています。")
    dup_email = db.query(User).filter(User.email == req.email, User.id != user_id).first()
    if dup_email:
        raise HTTPException(status_code=400, detail="このメールアドレスは既に登録されています。")

    user.username = req.username
    user.email = req.email
    user.role = req.role
    user.paid_leave_days = req.paid_leave_days
    user.paid_leave_month = req.paid_leave_month
    user.is_active = req.is_active
    user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(user)
    return AdminUserResponse.model_validate(user)


def delete_worker(db: Session, user_id: int) -> None:
    user = db.query(User).filter(User.id == user_id, User.is_admin == False).first()
    if not user:
        raise HTTPException(status_code=404, detail="作業者が見つかりません。")
    db.delete(user)
    db.commit()


# ── 月次確定承認 ────────────────────────────────────

def list_monthly_approvals(db: Session, status_filter: Optional[str] = None) -> list[MonthlyApprovalItem]:
    q = db.query(MonthlyConfirmation, User).join(User, MonthlyConfirmation.user_id == User.id)
    if status_filter:
        q = q.filter(MonthlyConfirmation.approval_status == status_filter)
    rows = q.order_by(MonthlyConfirmation.confirmed_at.desc()).all()

    return [
        MonthlyApprovalItem(
            id=mc.id,
            user_id=mc.user_id,
            username=u.username,
            year=mc.year,
            month=mc.month,
            confirmed_at=mc.confirmed_at.strftime("%Y-%m-%d %H:%M"),
            approval_status=mc.approval_status or "PENDING",
            rejection_reason=mc.rejection_reason,
        )
        for mc, u in rows
    ]


def approve_monthly(db: Session, confirmation_id: int) -> MonthlyApprovalItem:
    mc = db.query(MonthlyConfirmation).filter(MonthlyConfirmation.id == confirmation_id).first()
    if not mc:
        raise HTTPException(status_code=404, detail="申請が見つかりません。")
    mc.approval_status = "APPROVED"
    mc.approved_at = datetime.now()
    mc.rejection_reason = None
    db.commit()
    db.refresh(mc)
    user = db.query(User).filter(User.id == mc.user_id).first()
    return MonthlyApprovalItem(
        id=mc.id, user_id=mc.user_id,
        username=user.username if user else "",
        year=mc.year, month=mc.month,
        confirmed_at=mc.confirmed_at.strftime("%Y-%m-%d %H:%M"),
        approval_status="APPROVED",
    )


def reject_monthly(db: Session, confirmation_id: int, rejection_reason: str) -> MonthlyApprovalItem:
    mc = db.query(MonthlyConfirmation).filter(MonthlyConfirmation.id == confirmation_id).first()
    if not mc:
        raise HTTPException(status_code=404, detail="申請が見つかりません。")
    mc.approval_status = "REJECTED"
    mc.rejection_reason = rejection_reason
    mc.approved_at = None
    db.commit()
    db.refresh(mc)
    user = db.query(User).filter(User.id == mc.user_id).first()
    return MonthlyApprovalItem(
        id=mc.id, user_id=mc.user_id,
        username=user.username if user else "",
        year=mc.year, month=mc.month,
        confirmed_at=mc.confirmed_at.strftime("%Y-%m-%d %H:%M"),
        approval_status="REJECTED",
        rejection_reason=rejection_reason,
    )


def get_monthly_records_for_approval(
    db: Session, confirmation_id: int
) -> list[AttendanceResponse]:
    mc = db.query(MonthlyConfirmation).filter(MonthlyConfirmation.id == confirmation_id).first()
    if not mc:
        raise HTTPException(status_code=404, detail="申請が見つかりません。")

    records = (
        db.query(AttendanceRecord)
        .filter(
            AttendanceRecord.user_id == mc.user_id,
            extract("year", AttendanceRecord.date) == mc.year,
            extract("month", AttendanceRecord.date) == mc.month,
        )
        .order_by(AttendanceRecord.date)
        .all()
    )
    return [_to_attendance_response(r) for r in records]


# ── 有休申請承認 ────────────────────────────────────

def list_leave_approvals(db: Session, status_filter: Optional[str] = None) -> list[PaidLeaveApprovalItem]:
    q = (
        db.query(AttendanceRecord, User)
        .join(User, AttendanceRecord.user_id == User.id)
        .filter(AttendanceRecord.paid_leave_approval_status.isnot(None))
    )
    if status_filter:
        q = q.filter(AttendanceRecord.paid_leave_approval_status == status_filter)
    rows = q.order_by(AttendanceRecord.date.desc()).all()

    return [
        PaidLeaveApprovalItem(
            id=ar.id,
            user_id=ar.user_id,
            username=u.username,
            date=ar.date,
            type=ar.type,
            type_label=TYPE_LABELS.get(ar.type, ar.type),
            paid_leave=bool(ar.paid_leave),
            half_paid_leave=bool(ar.half_paid_leave),
            paid_leave_approval_status=ar.paid_leave_approval_status or "PENDING",
            paid_leave_rejection_reason=ar.paid_leave_rejection_reason,
        )
        for ar, u in rows
    ]


def approve_leave(db: Session, record_id: int) -> PaidLeaveApprovalItem:
    ar = db.query(AttendanceRecord).filter(AttendanceRecord.id == record_id).first()
    if not ar:
        raise HTTPException(status_code=404, detail="勤怠記録が見つかりません。")
    ar.paid_leave_approval_status = "APPROVED"
    ar.paid_leave_rejection_reason = None
    db.commit()
    db.refresh(ar)
    user = db.query(User).filter(User.id == ar.user_id).first()
    return PaidLeaveApprovalItem(
        id=ar.id, user_id=ar.user_id,
        username=user.username if user else "",
        date=ar.date, type=ar.type,
        type_label=TYPE_LABELS.get(ar.type, ar.type),
        paid_leave=bool(ar.paid_leave), half_paid_leave=bool(ar.half_paid_leave),
        paid_leave_approval_status="APPROVED",
    )


def reject_leave(db: Session, record_id: int, rejection_reason: str) -> PaidLeaveApprovalItem:
    ar = db.query(AttendanceRecord).filter(AttendanceRecord.id == record_id).first()
    if not ar:
        raise HTTPException(status_code=404, detail="勤怠記録が見つかりません。")
    ar.paid_leave_approval_status = "REJECTED"
    ar.paid_leave_rejection_reason = rejection_reason
    db.commit()
    db.refresh(ar)
    user = db.query(User).filter(User.id == ar.user_id).first()
    return PaidLeaveApprovalItem(
        id=ar.id, user_id=ar.user_id,
        username=user.username if user else "",
        date=ar.date, type=ar.type,
        type_label=TYPE_LABELS.get(ar.type, ar.type),
        paid_leave=bool(ar.paid_leave), half_paid_leave=bool(ar.half_paid_leave),
        paid_leave_approval_status="REJECTED",
        paid_leave_rejection_reason=rejection_reason,
    )
