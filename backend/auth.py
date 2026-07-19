"""JWT auth with roles: admin / parent / student."""
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, Literal

import bcrypt
import jwt
from fastapi import APIRouter, HTTPException, Depends, Header, status
from pydantic import BaseModel, EmailStr, Field

from db import db

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGO = "HS256"
JWT_TTL_HOURS = 24 * 7

Role = Literal["admin", "parent", "student"]

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1)
    role: Role = "student"


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: Role


class AuthOut(BaseModel):
    token: str
    user: UserOut


def _hash(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def _verify(pw: str, hashed: str) -> bool:
    return bcrypt.checkpw(pw.encode(), hashed.encode())


def _sign(payload: dict) -> str:
    payload = {**payload, "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_TTL_HOURS)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def _decode(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])


async def get_current_user(authorization: Optional[str] = Header(default=None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1]
    try:
        payload = _decode(token)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload.get("sub")}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def require_role(*roles: Role):
    async def dep(user: dict = Depends(get_current_user)):
        if user.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Forbidden")
        return user
    return dep


@router.post("/register", response_model=AuthOut)
async def register(payload: RegisterIn):
    exists = await db.users.find_one({"email": payload.email})
    if exists:
        raise HTTPException(status_code=400, detail="Email already registered")
    doc = {
        "id": str(uuid.uuid4()),
        "email": payload.email,
        "name": payload.name,
        "role": payload.role,
        "password": _hash(payload.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    token = _sign({"sub": doc["id"], "role": doc["role"]})
    return AuthOut(token=token, user=UserOut(id=doc["id"], email=doc["email"], name=doc["name"], role=doc["role"]))


@router.post("/login", response_model=AuthOut)
async def login(payload: LoginIn):
    doc = await db.users.find_one({"email": payload.email})
    if not doc or not _verify(payload.password, doc["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = _sign({"sub": doc["id"], "role": doc["role"]})
    return AuthOut(token=token, user=UserOut(id=doc["id"], email=doc["email"], name=doc["name"], role=doc["role"]))


@router.get("/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return UserOut(**{k: user[k] for k in ("id", "email", "name", "role")})


async def seed_admin(target_db):
    """Seed a default admin + demo student/parent."""
    seeds = [
        {"email": "admin@mytaman.ai", "password": "Admin@12345", "name": "MYTAMAN Admin", "role": "admin"},
        {"email": "parent@mytaman.ai", "password": "Parent@12345", "name": "Demo Parent", "role": "parent"},
        {"email": "student@mytaman.ai", "password": "Student@12345", "name": "Demo Student", "role": "student"},
    ]
    for s in seeds:
        existing = await target_db.users.find_one({"email": s["email"]})
        if existing:
            continue
        await target_db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": s["email"],
            "name": s["name"],
            "role": s["role"],
            "password": _hash(s["password"]),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
