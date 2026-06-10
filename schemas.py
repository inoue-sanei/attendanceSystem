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
