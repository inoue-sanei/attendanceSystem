from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Date, Text, Time, UniqueConstraint
from sqlalchemy.orm import relationship
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(100), unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    is_admin = Column(Boolean, default=False, nullable=False)
    role = Column(String(100), nullable=True)
    paid_leave_days = Column(Integer, default=20, nullable=False)
    paid_leave_month = Column(Integer, default=4, nullable=False)
    session_token = Column(String(64), nullable=True)
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"
    # 既存DB互換のため UniqueConstraint は migration で再作成する

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    date = Column(Date, nullable=False)
    type = Column(String, nullable=False)
    start_time = Column(Time, nullable=True)
    end_time = Column(Time, nullable=True)
    note = Column(String, nullable=True)
    paid_leave = Column(Boolean, nullable=False, default=False)
    half_paid_leave = Column(Boolean, nullable=False, default=False)
    work_location = Column(String, nullable=True)
    work_description = Column(Text, nullable=True)
    departure_station = Column(String, nullable=True)
    via_station = Column(String, nullable=True)
    arrival_station = Column(String, nullable=True)
    transport_cost = Column(Integer, nullable=True)
    break_start = Column(Time, nullable=True)
    break_end = Column(Time, nullable=True)
    reason = Column(Text, nullable=True)
    paid_leave_approval_status = Column(String(20), nullable=True)
    paid_leave_rejection_reason = Column(Text, nullable=True)

    user = relationship("User", backref="attendance_records")


class MonthlyConfirmation(Base):
    __tablename__ = "monthly_confirmations"
    # 既存DB互換のため UniqueConstraint は migration で再作成する

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    confirmed_at = Column(DateTime, nullable=False)
    approval_status = Column(String(20), nullable=True, default="PENDING")
    rejection_reason = Column(Text, nullable=True)
    approved_at = Column(DateTime, nullable=True)

    user = relationship("User", backref="monthly_confirmations")


class BulletinThread(Base):
    __tablename__ = "bulletin_threads"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    content = Column(Text, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, nullable=True)

    user = relationship("User", backref="threads")
    comments = relationship(
        "BulletinComment",
        backref="thread",
        cascade="all, delete-orphan",
        order_by="BulletinComment.created_at",
    )


class BulletinComment(Base):
    __tablename__ = "bulletin_comments"

    id = Column(Integer, primary_key=True, index=True)
    thread_id = Column(Integer, ForeignKey("bulletin_threads.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, nullable=True)

    user = relationship("User", backref="comments")


class LeaveReviewRequest(Base):
    """作業者が管理者に有給承認を催促する通知"""
    __tablename__ = "leave_review_requests"
    __table_args__ = (UniqueConstraint("user_id", "year", "month"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    is_read = Column(Boolean, default=False, nullable=False)

    user = relationship("User", backref="leave_review_requests")


class BulletinReaction(Base):
    __tablename__ = "bulletin_reactions"
    __table_args__ = (UniqueConstraint("target_type", "target_id", "user_id"),)

    id = Column(Integer, primary_key=True, index=True)
    target_type = Column(String(10), nullable=False)  # "thread" or "comment"
    target_id = Column(Integer, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", backref="reactions")
