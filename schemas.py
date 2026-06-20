from pydantic import BaseModel
from datetime import date, time
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
    reason: Optional[str] = None

    model_config = {"from_attributes": True}


class MonthConfirmationResponse(BaseModel):
    confirmed: bool
    year: int
    month: int


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
