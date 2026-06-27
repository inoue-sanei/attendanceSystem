from pydantic import BaseModel
from datetime import date, time, datetime
from enum import Enum
from typing import Optional


class AttendanceType(str, Enum):
    PRESENT = "PRESENT"
    ABSENT = "ABSENT"
    LATE = "LATE"
    EARLY_LEAVE = "EARLY_LEAVE"


TYPE_LABELS: dict[str, str] = {
    "PRESENT": "出勤",
    "ABSENT": "欠勤",
    "LATE": "遅刻",
    "EARLY_LEAVE": "早退",
}


class AttendanceRequest(BaseModel):
    date: date
    type: AttendanceType
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    note: Optional[str] = None
    paid_leave: bool = False
    half_paid_leave: bool = False
    work_location: Optional[list[str]] = None
    work_description: Optional[str] = None
    departure_station: Optional[str] = None
    via_station: Optional[list[str]] = None
    arrival_station: Optional[str] = None
    transport_cost: Optional[int] = None
    break_start: Optional[time] = None
    break_end: Optional[time] = None
    reason: Optional[str] = None


class AttendanceResponse(BaseModel):
    id: int
    date: date
    type: AttendanceType
    type_label: str
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    note: Optional[str] = None
    paid_leave: bool = False
    half_paid_leave: bool = False
    work_location: Optional[list[str]] = None
    work_description: Optional[str] = None
    departure_station: Optional[str] = None
    via_station: Optional[list[str]] = None
    arrival_station: Optional[str] = None
    transport_cost: Optional[int] = None
    break_start: Optional[time] = None
    break_end: Optional[time] = None
    reason: Optional[str] = None
    paid_leave_approval_status: Optional[str] = None
    paid_leave_rejection_reason: Optional[str] = None

    model_config = {"from_attributes": True}


class MonthConfirmationResponse(BaseModel):
    confirmed: bool
    year: int
    month: int
    approval_status: Optional[str] = None
    rejection_reason: Optional[str] = None


# ===== 認証関連スキーマ =====

class UserRegisterRequest(BaseModel):
    username: str
    email: str
    password: str


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    is_active: bool
    is_admin: bool = False
    role: Optional[str] = None

    model_config = {"from_attributes": True}


class UserRegisterResponse(BaseModel):
    id: int
    username: str
    email: str
    is_active: bool

    model_config = {"from_attributes": True}


class UserLoginRequest(BaseModel):
    email: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str


# ===== 掲示板スキーマ =====

class ThreadCreateRequest(BaseModel):
    title: str
    content: str


class ThreadEditRequest(BaseModel):
    title: str
    content: str


class CommentCreateRequest(BaseModel):
    content: str


class CommentEditRequest(BaseModel):
    content: str


class CommentResponse(BaseModel):
    id: int
    thread_id: int
    user_id: int
    username: str
    content: str
    created_at: str
    updated_at: Optional[str] = None
    reaction_count: int = 0
    user_reacted: bool = False

    model_config = {"from_attributes": True}


class ThreadResponse(BaseModel):
    id: int
    title: str
    content: str
    user_id: int
    username: str
    created_at: str
    updated_at: Optional[str] = None
    comments_count: int
    reaction_count: int = 0
    user_reacted: bool = False

    model_config = {"from_attributes": True}


class ThreadDetailResponse(BaseModel):
    id: int
    title: str
    content: str
    user_id: int
    username: str
    created_at: str
    updated_at: Optional[str] = None
    reaction_count: int = 0
    user_reacted: bool = False
    comments: list[CommentResponse]

    model_config = {"from_attributes": True}


# ===== マイページスキーマ =====

class MonthConfirmationStatus(BaseModel):
    year: int
    month: int
    approval_status: Optional[str] = None
    rejection_reason: Optional[str] = None


class PaidLeaveStatusItem(BaseModel):
    id: int
    date: date
    type_label: str
    approval_status: str
    rejection_reason: Optional[str] = None


class MypageResponse(BaseModel):
    username: str
    email: str
    paid_leave_days: int
    paid_leave_month: int
    year: int
    month: int
    attendance_count: int
    absence_count: int
    paid_leave_used: float
    paid_leave_remaining: float
    total_work_minutes: int
    overtime_minutes: int
    month_confirmations: list[MonthConfirmationStatus] = []
    paid_leave_statuses: list[PaidLeaveStatusItem] = []


# ===== 管理者スキーマ =====

class AdminUserCreateRequest(BaseModel):
    username: str
    email: str
    password: str
    role: Optional[str] = None
    paid_leave_days: int = 20
    paid_leave_month: int = 4


class AdminUserUpdateRequest(BaseModel):
    username: str
    email: str
    role: Optional[str] = None
    paid_leave_days: int = 20
    paid_leave_month: int = 4
    is_active: bool = True


class AdminUserResponse(BaseModel):
    id: int
    username: str
    email: str
    role: Optional[str] = None
    is_active: bool
    is_admin: bool
    paid_leave_days: int
    paid_leave_month: int

    model_config = {"from_attributes": True}


class MonthlyApprovalItem(BaseModel):
    id: int
    user_id: int
    username: str
    year: int
    month: int
    confirmed_at: str
    approval_status: str
    rejection_reason: Optional[str] = None


class PaidLeaveApprovalItem(BaseModel):
    id: int
    user_id: int
    username: str
    date: date
    type: str
    type_label: str
    paid_leave: bool
    half_paid_leave: bool
    paid_leave_approval_status: str
    paid_leave_rejection_reason: Optional[str] = None


class ApprovalActionRequest(BaseModel):
    rejection_reason: Optional[str] = None


class LeaveReviewRequestItem(BaseModel):
    id: int
    user_id: int
    username: str
    year: int
    month: int
    created_at: str


class AdminDashboardResponse(BaseModel):
    user_count: int
    pending_monthly_count: int
    pending_leave_count: int
    leave_review_request_count: int = 0
