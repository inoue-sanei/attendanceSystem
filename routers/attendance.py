from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from database import get_db
from models import User
from schemas import AttendanceRequest, AttendanceResponse
from services import attendance as service
from services.auth import get_current_user

router = APIRouter(prefix="/api/attendance", tags=["attendance"])


@router.get("", response_model=list[AttendanceResponse])
def get_monthly(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.get_monthly_attendance(db, year, month)


@router.post("", response_model=AttendanceResponse, status_code=status.HTTP_201_CREATED)
def register(
    request: AttendanceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.register(db, request)


@router.put("/{attendance_id}", response_model=AttendanceResponse)
def update(
    attendance_id: int,
    request: AttendanceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.update(db, attendance_id, request)


@router.delete("/{attendance_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(
    attendance_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    service.delete(db, attendance_id)
