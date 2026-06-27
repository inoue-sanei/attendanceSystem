from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional

from database import get_db
from models import User
from schemas import (
    AdminUserCreateRequest, AdminUserUpdateRequest, AdminUserResponse,
    MonthlyApprovalItem, PaidLeaveApprovalItem, ApprovalActionRequest,
    AdminDashboardResponse, AttendanceResponse, LeaveReviewRequestItem,
)
from services import admin as service
from services.auth import get_current_user

router = APIRouter(prefix="/api/admin", tags=["admin"])


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="管理者権限が必要です。")
    return current_user


# ── ダッシュボード ──────────────────────────────────

@router.get("/dashboard", response_model=AdminDashboardResponse)
def dashboard(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    return service.get_dashboard(db)


# ── ユーザー管理 ────────────────────────────────────

@router.get("/users", response_model=list[AdminUserResponse])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    return service.list_workers(db)


@router.post("/users", response_model=AdminUserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    request: AdminUserCreateRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    return service.create_worker(db, request)


@router.put("/users/{user_id}", response_model=AdminUserResponse)
def update_user(
    user_id: int,
    request: AdminUserUpdateRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    return service.update_worker(db, user_id, request)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    service.delete_worker(db, user_id)


# ── 月次確定承認 ────────────────────────────────────

@router.get("/approvals/monthly", response_model=list[MonthlyApprovalItem])
def list_monthly_approvals(
    approval_status: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    return service.list_monthly_approvals(db, approval_status)


@router.get("/approvals/monthly/{confirmation_id}/records", response_model=list[AttendanceResponse])
def monthly_approval_records(
    confirmation_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    return service.get_monthly_records_for_approval(db, confirmation_id)


@router.post("/approvals/monthly/{confirmation_id}/approve", response_model=MonthlyApprovalItem)
def approve_monthly(
    confirmation_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    return service.approve_monthly(db, confirmation_id)


@router.post("/approvals/monthly/{confirmation_id}/reject", response_model=MonthlyApprovalItem)
def reject_monthly(
    confirmation_id: int,
    request: ApprovalActionRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    if not request.rejection_reason:
        raise HTTPException(status_code=400, detail="否認理由を入力してください。")
    return service.reject_monthly(db, confirmation_id, request.rejection_reason)


# ── 有休申請承認 ────────────────────────────────────

@router.get("/approvals/leave", response_model=list[PaidLeaveApprovalItem])
def list_leave_approvals(
    approval_status: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    return service.list_leave_approvals(db, approval_status)


@router.post("/approvals/leave/{record_id}/approve", response_model=PaidLeaveApprovalItem)
def approve_leave(
    record_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    return service.approve_leave(db, record_id)


@router.post("/approvals/leave/{record_id}/reject", response_model=PaidLeaveApprovalItem)
def reject_leave(
    record_id: int,
    request: ApprovalActionRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    if not request.rejection_reason:
        raise HTTPException(status_code=400, detail="否認理由を入力してください。")
    return service.reject_leave(db, record_id, request.rejection_reason)


# ── 有給承認依頼通知 ────────────────────────────────

@router.get("/leave-review-requests", response_model=list[LeaveReviewRequestItem])
def list_leave_review_requests(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """未読の有給承認催促通知一覧を返す"""
    return service.get_leave_review_requests(db)


@router.post("/leave-review-requests/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_leave_review_read(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """有給承認催促通知をすべて既読にする"""
    service.mark_leave_review_requests_read(db)
