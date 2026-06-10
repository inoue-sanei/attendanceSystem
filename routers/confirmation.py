from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from database import get_db
from schemas import MonthConfirmationResponse
from services import confirmation as service

router = APIRouter(prefix="/api/confirmation", tags=["confirmation"])


@router.get("", response_model=MonthConfirmationResponse)
def get_confirmation(year: int, month: int, db: Session = Depends(get_db)):
    return service.get_confirmation(db, year, month)


@router.post("", response_model=MonthConfirmationResponse, status_code=status.HTTP_201_CREATED)
def confirm_month(year: int, month: int, db: Session = Depends(get_db)):
    return service.confirm_month(db, year, month)
