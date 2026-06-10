from sqlalchemy import Boolean, Column, DateTime, Integer, String, Date, Text, Time, UniqueConstraint
from database import Base


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"
    __table_args__ = (UniqueConstraint("date", name="uq_attendance_date"),)

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False)
    type = Column(String, nullable=False)
    start_time = Column(Time, nullable=True)
    end_time = Column(Time, nullable=True)
    note = Column(String, nullable=True)
    paid_leave = Column(Boolean, nullable=False, default=False)
    # 遅刻/早退時の有給（半休）消化
    half_paid_leave = Column(Boolean, nullable=False, default=False)
    # カンマ区切りで複数選択値を格納（例: "現場,在宅"）
    work_location = Column(String, nullable=True)
    work_description = Column(Text, nullable=True)
    # 交通情報（via_stationはカンマ区切りで複数格納）
    departure_station = Column(String, nullable=True)
    via_station = Column(String, nullable=True)
    arrival_station = Column(String, nullable=True)
    transport_cost = Column(Integer, nullable=True)
    # 欠勤・遅刻・早退の理由
    reason = Column(Text, nullable=True)


class MonthlyConfirmation(Base):
    """月次確定テーブル — 確定後はその月の勤怠を変更不可にする"""
    __tablename__ = "monthly_confirmations"
    __table_args__ = (UniqueConstraint("year", "month", name="uq_confirmation_year_month"),)

    id = Column(Integer, primary_key=True, index=True)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    confirmed_at = Column(DateTime, nullable=False)
