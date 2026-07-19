"""Courses and Chapters — the module/section hierarchy inside a Tutor Pack.

Hierarchy: Pack -> Course (e.g. History, Mathematics) -> Chapter (e.g. Bab 1) -> Content.
"""
import uuid
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from db import db
from auth import require_role, get_current_user

router = APIRouter(tags=["courses"])


# ---------- Courses ----------

class CourseIn(BaseModel):
    pack_id: str
    title: str = Field(min_length=1)


class CourseRename(BaseModel):
    title: str = Field(min_length=1)


class CourseOut(BaseModel):
    id: str
    pack_id: str
    title: str
    created_at: str


@router.post("/courses/create", response_model=CourseOut)
async def create_course(payload: CourseIn, _: dict = Depends(require_role("admin"))):
    doc = {
        "id": str(uuid.uuid4()),
        "pack_id": payload.pack_id,
        "title": payload.title,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.courses.insert_one(doc)
    return CourseOut(**doc)


@router.get("/courses/list", response_model=List[CourseOut])
async def list_courses(pack_id: str, _: dict = Depends(get_current_user)):
    docs = await db.courses.find({"pack_id": pack_id}, {"_id": 0}).sort("created_at", 1).to_list(200)
    return [CourseOut(**d) for d in docs]


@router.patch("/courses/{course_id}", response_model=CourseOut)
async def rename_course(course_id: str, payload: CourseRename, _: dict = Depends(require_role("admin"))):
    res = await db.courses.find_one_and_update(
        {"id": course_id}, {"$set": {"title": payload.title}}, return_document=True, projection={"_id": 0}
    )
    if not res:
        raise HTTPException(status_code=404, detail="Course not found")
    return CourseOut(**res)


@router.delete("/courses/{course_id}")
async def delete_course(course_id: str, _: dict = Depends(require_role("admin"))):
    res = await db.courses.delete_one({"id": course_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Course not found")
    chapters = await db.chapters.find({"course_id": course_id}, {"_id": 0, "id": 1}).to_list(1000)
    chapter_ids = [c["id"] for c in chapters]
    await db.chapters.delete_many({"course_id": course_id})
    if chapter_ids:
        await db.contents.delete_many({"chapter_id": {"$in": chapter_ids}})
    return {"ok": True}


# ---------- Chapters ----------

class ChapterIn(BaseModel):
    course_id: str
    title: str = Field(min_length=1)


class ChapterRename(BaseModel):
    title: str = Field(min_length=1)


class ChapterOut(BaseModel):
    id: str
    course_id: str
    title: str
    created_at: str


@router.post("/chapters/create", response_model=ChapterOut)
async def create_chapter(payload: ChapterIn, _: dict = Depends(require_role("admin"))):
    doc = {
        "id": str(uuid.uuid4()),
        "course_id": payload.course_id,
        "title": payload.title,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.chapters.insert_one(doc)
    return ChapterOut(**doc)


@router.get("/chapters/list", response_model=List[ChapterOut])
async def list_chapters(course_id: str, _: dict = Depends(get_current_user)):
    docs = await db.chapters.find({"course_id": course_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return [ChapterOut(**d) for d in docs]


@router.patch("/chapters/{chapter_id}", response_model=ChapterOut)
async def rename_chapter(chapter_id: str, payload: ChapterRename, _: dict = Depends(require_role("admin"))):
    res = await db.chapters.find_one_and_update(
        {"id": chapter_id}, {"$set": {"title": payload.title}}, return_document=True, projection={"_id": 0}
    )
    if not res:
        raise HTTPException(status_code=404, detail="Chapter not found")
    return ChapterOut(**res)


@router.delete("/chapters/{chapter_id}")
async def delete_chapter(chapter_id: str, _: dict = Depends(require_role("admin"))):
    res = await db.chapters.delete_one({"id": chapter_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Chapter not found")
    await db.contents.delete_many({"chapter_id": chapter_id})
    return {"ok": True}
