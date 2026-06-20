from datetime import datetime

from sqlalchemy.orm import Session
from sqlalchemy import func
from models import BulletinThread, BulletinComment, BulletinReaction, User


def _fmt_dt(dt) -> str:
    return dt.strftime("%Y-%m-%d %H:%M") if dt else ""


def _reaction_count(db: Session, target_type: str, target_id: int) -> int:
    return (
        db.query(func.count(BulletinReaction.id))
        .filter(
            BulletinReaction.target_type == target_type,
            BulletinReaction.target_id == target_id,
        )
        .scalar()
    ) or 0


def _user_reacted(db: Session, target_type: str, target_id: int, user_id: int) -> bool:
    return (
        db.query(BulletinReaction)
        .filter(
            BulletinReaction.target_type == target_type,
            BulletinReaction.target_id == target_id,
            BulletinReaction.user_id == user_id,
        )
        .first()
    ) is not None


def get_threads(db: Session, current_user_id: int, skip: int = 0, limit: int = 50) -> list[dict]:
    threads = (
        db.query(BulletinThread)
        .join(User, BulletinThread.user_id == User.id)
        .order_by(BulletinThread.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    result = []
    for t in threads:
        count = (
            db.query(func.count(BulletinComment.id))
            .filter(BulletinComment.thread_id == t.id)
            .scalar()
        )
        result.append({
            "id": t.id,
            "title": t.title,
            "content": t.content,
            "user_id": t.user_id,
            "username": t.user.username,
            "created_at": _fmt_dt(t.created_at),
            "updated_at": _fmt_dt(t.updated_at) if t.updated_at else None,
            "comments_count": count,
            "reaction_count": _reaction_count(db, "thread", t.id),
            "user_reacted": _user_reacted(db, "thread", t.id, current_user_id),
        })
    return result


def create_thread(db: Session, user_id: int, title: str, content: str) -> dict:
    thread = BulletinThread(user_id=user_id, title=title.strip(), content=content.strip())
    db.add(thread)
    db.commit()
    db.refresh(thread)
    return {
        "id": thread.id,
        "title": thread.title,
        "content": thread.content,
        "user_id": thread.user_id,
        "username": thread.user.username,
        "created_at": _fmt_dt(thread.created_at),
        "updated_at": None,
        "comments_count": 0,
        "reaction_count": 0,
        "user_reacted": False,
    }


def edit_thread(db: Session, thread_id: int, user_id: int, title: str, content: str) -> tuple:
    thread = db.query(BulletinThread).filter(BulletinThread.id == thread_id).first()
    if not thread:
        return None, "not_found"
    if thread.user_id != user_id:
        return None, "forbidden"
    thread.title = title.strip()
    thread.content = content.strip()
    thread.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(thread)
    return {
        "id": thread.id,
        "title": thread.title,
        "content": thread.content,
        "user_id": thread.user_id,
        "username": thread.user.username,
        "created_at": _fmt_dt(thread.created_at),
        "updated_at": _fmt_dt(thread.updated_at),
    }, None


def get_thread_detail(db: Session, thread_id: int, current_user_id: int) -> dict | None:
    thread = db.query(BulletinThread).filter(BulletinThread.id == thread_id).first()
    if not thread:
        return None
    comments = [
        {
            "id": c.id,
            "thread_id": c.thread_id,
            "user_id": c.user_id,
            "username": c.user.username,
            "content": c.content,
            "created_at": _fmt_dt(c.created_at),
            "updated_at": _fmt_dt(c.updated_at) if c.updated_at else None,
            "reaction_count": _reaction_count(db, "comment", c.id),
            "user_reacted": _user_reacted(db, "comment", c.id, current_user_id),
        }
        for c in thread.comments
    ]
    return {
        "id": thread.id,
        "title": thread.title,
        "content": thread.content,
        "user_id": thread.user_id,
        "username": thread.user.username,
        "created_at": _fmt_dt(thread.created_at),
        "updated_at": _fmt_dt(thread.updated_at) if thread.updated_at else None,
        "reaction_count": _reaction_count(db, "thread", thread.id),
        "user_reacted": _user_reacted(db, "thread", thread.id, current_user_id),
        "comments": comments,
    }


def add_comment(db: Session, thread_id: int, user_id: int, content: str) -> dict | None:
    thread = db.query(BulletinThread).filter(BulletinThread.id == thread_id).first()
    if not thread:
        return None
    comment = BulletinComment(thread_id=thread_id, user_id=user_id, content=content.strip())
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return {
        "id": comment.id,
        "thread_id": comment.thread_id,
        "user_id": comment.user_id,
        "username": comment.user.username,
        "content": comment.content,
        "created_at": _fmt_dt(comment.created_at),
        "updated_at": None,
        "reaction_count": 0,
        "user_reacted": False,
    }


def edit_comment(db: Session, comment_id: int, user_id: int, content: str) -> tuple:
    comment = db.query(BulletinComment).filter(BulletinComment.id == comment_id).first()
    if not comment:
        return None, "not_found"
    if comment.user_id != user_id:
        return None, "forbidden"
    comment.content = content.strip()
    comment.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(comment)
    return {
        "id": comment.id,
        "content": comment.content,
        "updated_at": _fmt_dt(comment.updated_at),
    }, None


def delete_thread(db: Session, thread_id: int, user_id: int) -> tuple[bool, str | None]:
    thread = db.query(BulletinThread).filter(BulletinThread.id == thread_id).first()
    if not thread:
        return False, "not_found"
    if thread.user_id != user_id:
        return False, "forbidden"
    db.delete(thread)
    db.commit()
    return True, None


def delete_comment(db: Session, comment_id: int, user_id: int) -> tuple[bool, str | None]:
    comment = db.query(BulletinComment).filter(BulletinComment.id == comment_id).first()
    if not comment:
        return False, "not_found"
    if comment.user_id != user_id:
        return False, "forbidden"
    db.delete(comment)
    db.commit()
    return True, None


def toggle_reaction(db: Session, target_type: str, target_id: int, user_id: int) -> dict:
    existing = (
        db.query(BulletinReaction)
        .filter(
            BulletinReaction.target_type == target_type,
            BulletinReaction.target_id == target_id,
            BulletinReaction.user_id == user_id,
        )
        .first()
    )
    if existing:
        db.delete(existing)
        db.commit()
        reacted = False
    else:
        reaction = BulletinReaction(target_type=target_type, target_id=target_id, user_id=user_id)
        db.add(reaction)
        db.commit()
        reacted = True

    count = _reaction_count(db, target_type, target_id)
    return {"reacted": reacted, "count": count}
