"""JWT auth with roles: admin / parent / student."""
import logging
import os
import secrets
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, Literal

import bcrypt
import jwt
from fastapi import APIRouter, HTTPException, Depends, Header, status
from pydantic import BaseModel, EmailStr, Field

from db import db

log = logging.getLogger("auth")

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGO = "HS256"
JWT_TTL_HOURS = 24 * 7

Role = Literal["admin", "parent", "student"]

router = APIRouter(prefix="/auth", tags=["auth"])


# Public self-registration creates a PARENT and nothing else. Students are minors and
# only ever come into existence through a guardian -- either created directly in the
# parent portal, or self-requested and then approved by a parent (see registrations.py).
# Admins are seeded, never registered. Note this is also what stops a caller from
# POSTing {"role": "admin"} to mint themselves an admin account.
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    name: str = Field(min_length=1)


class LoginIn(BaseModel):
    password: str
    # Parents sign in with an email, students with a username -- one form, either value.
    identifier: Optional[str] = None
    email: Optional[str] = None  # legacy alias: older clients post {email, password}

    def login_id(self) -> str:
        return (self.identifier or self.email or "").strip()


class UserOut(BaseModel):
    id: str
    name: str
    role: Role
    # Students have a username and no email; parents/admins the reverse.
    email: Optional[str] = None
    username: Optional[str] = None
    grade: Optional[str] = None
    must_change_password: bool = False


def user_out(doc: dict) -> UserOut:
    return UserOut(
        id=doc["id"],
        name=doc["name"],
        role=doc["role"],
        email=doc.get("email"),
        username=doc.get("username"),
        grade=doc.get("grade"),
        must_change_password=bool(doc.get("must_change_password")),
    )


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
    # A deactivated child keeps its account and history but can't be used to sign in --
    # accounts created before this field existed are active by default.
    if user.get("active") is False:
        raise HTTPException(status_code=403, detail="This account has been deactivated")
    return user


def require_role(*roles: Role):
    async def dep(user: dict = Depends(get_current_user)):
        if user.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Forbidden")
        return user
    return dep


@router.post("/register", response_model=AuthOut)
async def register(payload: RegisterIn):
    """Creates a parent account. This is the only public registration path -- a student
    account is never created here (see the RegisterIn note above)."""
    email = payload.email.lower()
    exists = await db.users.find_one({"email": email})
    if exists:
        raise HTTPException(status_code=400, detail="Email already registered")
    doc = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": payload.name,
        "role": "parent",
        "password": _hash(payload.password),
        "active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    token = _sign({"sub": doc["id"], "role": doc["role"]})
    return AuthOut(token=token, user=user_out(doc))


@router.post("/login", response_model=AuthOut)
async def login(payload: LoginIn):
    ident = payload.login_id()
    if not ident:
        raise HTTPException(status_code=422, detail="Enter your email or student ID")
    # Emails are stored lowercased going forward, but accounts predating that may carry
    # mixed case, so try the raw value too. Usernames are always stored lowercased.
    doc = await db.users.find_one({
        "$or": [{"email": ident}, {"email": ident.lower()}, {"username": ident.lower()}]
    })
    if not doc or not _verify(payload.password, doc["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if doc.get("active") is False:
        raise HTTPException(status_code=403, detail="This account has been deactivated")
    token = _sign({"sub": doc["id"], "role": doc["role"]})
    return AuthOut(token=token, user=user_out(doc))


@router.get("/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return user_out(user)


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


@router.post("/change-password")
async def change_password(payload: ChangePasswordIn, user: dict = Depends(get_current_user)):
    """Lets a student replace the password their parent set for them -- clearing the
    must_change_password flag the parent-approval flow sets. Also available to parents."""
    doc = await db.users.find_one({"id": user["id"]})
    if not doc or not _verify(payload.current_password, doc["password"]):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password": _hash(payload.new_password), "must_change_password": False}},
    )
    return {"ok": True}


def _seed_password(env_var: str) -> tuple:
    """The password for a seeded demo account, and whether it had to be generated.

    Read from the environment so no working credential lives in this repository. With
    the variable unset a random one is generated and logged once at creation -- an
    unguessable password an operator has to go and find beats a documented one that
    every deployment shares.
    """
    from_env = os.environ.get(env_var, "").strip()
    if from_env:
        return from_env, False
    return secrets.token_urlsafe(12), True


async def seed_admin(target_db):
    """Seed a default admin + a demo parent with one linked demo child.

    The demo student is seeded the way the app now requires every student to exist:
    a username instead of an email, and a parent_id linking it to the demo parent.

    Seeding only ever CREATES. It never rewrites the password of an account that already
    exists, so an operator who changes a password in the Account Manager does not find it
    reset by the next `docker compose up`. To rotate an existing deployment's demo
    credentials, run `backend/scripts/rotate_demo_passwords.py`.
    """
    now = datetime.now(timezone.utc).isoformat()
    admin_pw, admin_gen = _seed_password("SEED_ADMIN_PASSWORD")
    parent_pw, parent_gen = _seed_password("SEED_PARENT_PASSWORD")
    for s in [
        {"email": "admin@mytaman.ai", "password": admin_pw, "generated": admin_gen,
         "name": "Lv99.ai Admin", "role": "admin"},
        {"email": "parent@mytaman.ai", "password": parent_pw, "generated": parent_gen,
         "name": "Demo Parent", "role": "parent"},
    ]:
        if await target_db.users.find_one({"email": s["email"]}):
            continue
        await target_db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": s["email"],
            "name": s["name"],
            "role": s["role"],
            "password": _hash(s["password"]),
            "active": True,
            "created_at": now,
        })
        if s["generated"]:
            # Logged once, at creation. The operator reads it from `docker compose logs
            # backend` and changes it in the Account Manager; it is never logged again.
            log.warning(
                "Seeded %s account %s with a GENERATED password: %s -- change it in the "
                "Admin portal's Account Manager.", s["role"], s["email"], s["password"],
            )

    parent = await target_db.users.find_one({"email": "parent@mytaman.ai"}, {"_id": 0, "id": 1})
    student_pw, student_gen = _seed_password("SEED_STUDENT_PASSWORD")
    if parent and not await target_db.users.find_one({"username": "demostudent"}):
        await target_db.users.insert_one({
            "id": str(uuid.uuid4()),
            "username": "demostudent",
            "name": "Demo Student",
            "role": "student",
            "parent_id": parent["id"],
            "grade": "Form 1",
            "birth_year": 2012,
            "password": _hash(student_pw),
            "must_change_password": False,
            "active": True,
            "created_at": now,
        })
        if student_gen:
            log.warning(
                "Seeded student account demostudent with a GENERATED password: %s -- "
                "change it in the Admin portal's Account Manager.", student_pw,
            )
