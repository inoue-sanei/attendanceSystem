from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse

router = APIRouter()

_TEMPLATES = Path(__file__).parent.parent / "templates"


@router.get("/")
def index():
    return FileResponse(_TEMPLATES / "index.html", media_type="text/html")


@router.get("/login")
def login_page():
    return FileResponse(_TEMPLATES / "login.html", media_type="text/html")


@router.get("/daily")
def daily_page():
    return FileResponse(_TEMPLATES / "daily.html", media_type="text/html")


@router.get("/settings")
def settings_page():
    return FileResponse(_TEMPLATES / "settings.html", media_type="text/html")


@router.get("/mypage")
def mypage_page():
    return FileResponse(_TEMPLATES / "mypage.html", media_type="text/html")


@router.get("/password")
def password_page():
    return FileResponse(_TEMPLATES / "password.html", media_type="text/html")


@router.get("/board")
def board_page():
    return FileResponse(_TEMPLATES / "board.html", media_type="text/html")


@router.get("/board/thread/{thread_id}")
def board_thread_page(thread_id: int):
    return FileResponse(_TEMPLATES / "board_thread.html", media_type="text/html")
