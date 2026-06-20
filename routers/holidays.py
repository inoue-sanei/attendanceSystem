import calendar as cal_module
from datetime import date

import jpholiday
from fastapi import APIRouter, Depends

from models import User
from services.auth import get_current_user

router = APIRouter(prefix="/api/holidays", tags=["holidays"])


@router.get("")
def get_holidays(
    year: int,
    month: int,
    current_user: User = Depends(get_current_user),
):
    """指定年月の祝日一覧を返す"""
    _, days = cal_module.monthrange(year, month)
    result = []
    for day in range(1, days + 1):
        d = date(year, month, day)
        name = jpholiday.is_holiday_name(d)
        if name:
            result.append({"date": d.isoformat(), "name": name})
    return result
