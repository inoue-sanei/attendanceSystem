from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models import User
from schemas import ThreadCreateRequest, ThreadEditRequest, CommentCreateRequest, CommentEditRequest
from services.auth import get_current_user
from services import board as board_svc

router = APIRouter(prefix="/api/board", tags=["board"])


@router.get("/threads")
def list_threads(
    skip: int = 0,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return board_svc.get_threads(db, current_user_id=current_user.id, skip=skip, limit=limit)


@router.post("/threads", status_code=status.HTTP_201_CREATED)
def create_thread(
    request: ThreadCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not request.title.strip():
        raise HTTPException(status_code=400, detail="タイトルを入力してください。")
    if not request.content.strip():
        raise HTTPException(status_code=400, detail="本文を入力してください。")
    return board_svc.create_thread(db, current_user.id, request.title, request.content)


@router.get("/threads/{thread_id}")
def get_thread(
    thread_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    detail = board_svc.get_thread_detail(db, thread_id, current_user_id=current_user.id)
    if detail is None:
        raise HTTPException(status_code=404, detail="スレッドが見つかりません。")
    return detail


@router.put("/threads/{thread_id}")
def update_thread(
    thread_id: int,
    request: ThreadEditRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not request.title.strip():
        raise HTTPException(status_code=400, detail="タイトルを入力してください。")
    if not request.content.strip():
        raise HTTPException(status_code=400, detail="本文を入力してください。")
    result, reason = board_svc.edit_thread(db, thread_id, current_user.id, request.title, request.content)
    if result is None:
        code = 404 if reason == "not_found" else 403
        msg = "スレッドが見つかりません。" if reason == "not_found" else "編集する権限がありません。"
        raise HTTPException(status_code=code, detail=msg)
    return result


@router.post("/threads/{thread_id}/comments", status_code=status.HTTP_201_CREATED)
def add_comment(
    thread_id: int,
    request: CommentCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not request.content.strip():
        raise HTTPException(status_code=400, detail="コメントを入力してください。")
    comment = board_svc.add_comment(db, thread_id, current_user.id, request.content)
    if comment is None:
        raise HTTPException(status_code=404, detail="スレッドが見つかりません。")
    return comment


@router.put("/comments/{comment_id}")
def update_comment(
    comment_id: int,
    request: CommentEditRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not request.content.strip():
        raise HTTPException(status_code=400, detail="内容を入力してください。")
    result, reason = board_svc.edit_comment(db, comment_id, current_user.id, request.content)
    if result is None:
        code = 404 if reason == "not_found" else 403
        msg = "コメントが見つかりません。" if reason == "not_found" else "編集する権限がありません。"
        raise HTTPException(status_code=code, detail=msg)
    return result


@router.delete("/threads/{thread_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_thread(
    thread_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ok, reason = board_svc.delete_thread(db, thread_id, current_user.id)
    if not ok:
        code = 404 if reason == "not_found" else 403
        msg = "スレッドが見つかりません。" if reason == "not_found" else "削除する権限がありません。"
        raise HTTPException(status_code=code, detail=msg)


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(
    comment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ok, reason = board_svc.delete_comment(db, comment_id, current_user.id)
    if not ok:
        code = 404 if reason == "not_found" else 403
        msg = "コメントが見つかりません。" if reason == "not_found" else "削除する権限がありません。"
        raise HTTPException(status_code=code, detail=msg)


@router.post("/threads/{thread_id}/react")
def react_to_thread(
    thread_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return board_svc.toggle_reaction(db, "thread", thread_id, current_user.id)


@router.post("/comments/{comment_id}/react")
def react_to_comment(
    comment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return board_svc.toggle_reaction(db, "comment", comment_id, current_user.id)
