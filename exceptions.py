class AttendanceAlreadyExistsError(Exception):
    """同じ日付の勤怠が既に登録されている"""


class AttendanceNotFoundError(Exception):
    """指定 ID の勤怠記録が存在しない"""


class MonthAlreadyConfirmedError(Exception):
    """月次確定済みのため変更不可"""
