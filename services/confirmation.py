from datetime import datetime
from sqlalchemy.orm import Session
from models import MonthlyConfirmation
from schemas import MonthConfirmationResponse
from exceptions import MonthAlreadyConfirmedError


def get_confirmation(db: Session, year: int, month: int) -> MonthConfirmationResponse:
    exists = db.query(MonthlyConfirmation).filter(
        MonthlyConfirmation.year == year,
        MonthlyConfirmation.month == month,
    ).first()
    return MonthConfirmationResponse(confirmed=exists is not None, year=year, month=month)


def confirm_month(db: Session, year: int, month: int) -> MonthConfirmationResponse:
    exists = db.query(MonthlyConfirmation).filter(
        MonthlyConfirmation.year == year,
        MonthlyConfirmation.month == month,
    ).first()
    if exists:
        raise MonthAlreadyConfirmedError(f"{year}年{month}月は既に確定済みです")

    record = MonthlyConfirmation(year=year, month=month, confirmed_at=datetime.now())
    db.add(record)
    db.commit()
    return MonthConfirmationResponse(confirmed=True, year=year, month=month)
