from fastapi import APIRouter
from fastapi.responses import FileResponse
from pathlib import Path

router = APIRouter()

_TEMPLATE_PATH = Path(__file__).parent.parent / "templates" / "index.html"


@router.get("/")
def index():
    return FileResponse(_TEMPLATE_PATH, media_type="text/html")
