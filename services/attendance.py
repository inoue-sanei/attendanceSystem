from sqlalchemy.orm import Session
from sqlalchemy import extract
from models import AttendanceRecord, MonthlyConfirmation
from schemas import AttendanceRequest, AttendanceResponse, AttendanceType, TYPE_LABELS
from exceptions import AttendanceAlreadyExistsError, AttendanceNotFoundError, MonthAlreadyConfirmedError


def _assert_not_confirmed(db: Session, user_id: int, target_date) -> None:
    """確定済み（PENDING/APPROVED）月への変更を拒否する"""
    exists = db.query(MonthlyConfirmation).filter(
        MonthlyConfirmation.user_id == user_id,
        MonthlyConfirmation.year == target_date.year,
        MonthlyConfirmation.month == target_date.month,
        MonthlyConfirmation.approval_status.in_(["PENDING", "APPROVED"]),
    ).first()
    if exists:
        raise MonthAlreadyConfirmedError(
            f"{target_date.year}年{target_date.month}月は確定済みのため変更できません"
        )


def _to_csv(values: list[str] | None) -> str | None:
    return ",".join(v for v in values if v) if values else None


def _from_csv(value: str | None) -> list[str] | None:
    return value.split(",") if value else None


def _to_response(record: AttendanceRecord) -> AttendanceResponse:
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
        break_start=record.break_start,
        break_end=record.break_end,
        reason=record.reason,
        paid_leave_approval_status=record.paid_leave_approval_status,
        paid_leave_rejection_reason=record.paid_leave_rejection_reason,
    )


def get_monthly_attendance(db: Session, user_id: int, year: int, month: int) -> list[AttendanceResponse]:
    records = (
        db.query(AttendanceRecord)
        .filter(
            AttendanceRecord.user_id == user_id,
            extract("year", AttendanceRecord.date) == year,
            extract("month", AttendanceRecord.date) == month,
        )
        .order_by(AttendanceRecord.date)
        .all()
    )
    return [_to_response(r) for r in records]


def register(db: Session, user_id: int, request: AttendanceRequest) -> AttendanceResponse:
    _assert_not_confirmed(db, user_id, request.date)

    existing = db.query(AttendanceRecord).filter(
        AttendanceRecord.user_id == user_id,
        AttendanceRecord.date == request.date,
    ).first()
    if existing:
        raise AttendanceAlreadyExistsError("この日付の勤怠は既に登録されています")

    is_absent     = request.type.value == "ABSENT"
    is_late_early = request.type.value in ("LATE", "EARLY_LEAVE")
    needs_reason  = is_absent or is_late_early

    needs_approval = (is_absent and request.paid_leave) or (is_late_early and request.half_paid_leave)
    approval_status = "PENDING" if needs_approval else None

    record = AttendanceRecord(
        user_id=user_id,
        date=request.date,
        type=request.type.value,
        start_time=None if is_absent else request.start_time,
        end_time=None if is_absent else request.end_time,
        note=request.note,
        paid_leave=request.paid_leave if is_absent else False,
        half_paid_leave=request.half_paid_leave if is_late_early else False,
        work_location=None if is_absent else _to_csv(request.work_location),
        work_description=None if is_absent else request.work_description,
        departure_station=None if is_absent else request.departure_station,
        via_station=None if is_absent else _to_csv(request.via_station),
        arrival_station=None if is_absent else request.arrival_station,
        transport_cost=None if is_absent else request.transport_cost,
        break_start=None if is_absent else request.break_start,
        break_end=None if is_absent else request.break_end,
        reason=request.reason if needs_reason else None,
        paid_leave_approval_status=approval_status,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return _to_response(record)


def update(db: Session, user_id: int, attendance_id: int, request: AttendanceRequest) -> AttendanceResponse:
    record = db.query(AttendanceRecord).filter(
        AttendanceRecord.id == attendance_id,
        AttendanceRecord.user_id == user_id,
    ).first()
    if not record:
        raise AttendanceNotFoundError(f"勤怠記録が見つかりません: id={attendance_id}")

    _assert_not_confirmed(db, user_id, record.date)

    is_absent     = request.type.value == "ABSENT"
    is_late_early = request.type.value in ("LATE", "EARLY_LEAVE")
    needs_reason  = is_absent or is_late_early

    needs_approval = (is_absent and request.paid_leave) or (is_late_early and request.half_paid_leave)
    if needs_approval:
        if record.paid_leave_approval_status != "APPROVED":
            record.paid_leave_approval_status = "PENDING"
            record.paid_leave_rejection_reason = None
    elif not needs_approval:
        record.paid_leave_approval_status = None
        record.paid_leave_rejection_reason = None

    record.type             = request.type.value
    record.start_time       = None if is_absent else request.start_time
    record.end_time         = None if is_absent else request.end_time
    record.note             = request.note
    record.paid_leave       = request.paid_leave if is_absent else False
    record.half_paid_leave  = request.half_paid_leave if is_late_early else False
    record.work_location    = None if is_absent else _to_csv(request.work_location)
    record.work_description = None if is_absent else request.work_description
    record.departure_station = None if is_absent else request.departure_station
    record.via_station      = None if is_absent else _to_csv(request.via_station)
    record.arrival_station  = None if is_absent else request.arrival_station
    record.transport_cost = None if is_absent else request.transport_cost
    record.break_start    = None if is_absent else request.break_start
    record.break_end      = None if is_absent else request.break_end
    record.reason         = request.reason if needs_reason else None
    db.commit()
    db.refresh(record)
    return _to_response(record)


def delete(db: Session, user_id: int, attendance_id: int) -> None:
    record = db.query(AttendanceRecord).filter(
        AttendanceRecord.id == attendance_id,
        AttendanceRecord.user_id == user_id,
    ).first()
    if not record:
        raise AttendanceNotFoundError(f"勤怠記録が見つかりません: id={attendance_id}")

    _assert_not_confirmed(db, user_id, record.date)
    db.delete(record)
    db.commit()
