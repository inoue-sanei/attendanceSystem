from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from database import get_db
from models import User
from schemas import MonthConfirmationResponse
from services import confirmation as service
from services.auth import get_current_user

router = APIRouter(prefix="/api/confirmation", tags=["confirmation"])


@router.get("", response_model=MonthConfirmationResponse)
def get_confirmation(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.get_confirmation(db, current_user.id, year, month)


@router.post("", response_model=MonthConfirmationResponse, status_code=status.HTTP_201_CREATED)
def confirm_month(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return service.confirm_month(db, current_user.id, year, month)


@router.post("/request-leave-review", status_code=status.HTTP_204_NO_CONTENT)
def request_leave_review(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """管理者に有給承認の催促通知を送る"""
    service.request_leave_review(db, current_user.id, year, month)
