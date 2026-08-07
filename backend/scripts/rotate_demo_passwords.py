#!/usr/bin/env python3
"""Rotate the three seeded demo accounts to fresh, randomly generated passwords.

Seeding only ever creates accounts, so it cannot rotate a deployment that already has
these users -- their old passwords sit in the database until something replaces them.
That is what this script is for.

    docker compose exec backend python scripts/rotate_demo_passwords.py

The new passwords are printed ONCE, to stdout. They are stored only as bcrypt hashes,
so nothing here can recover them afterwards: if the output scrolls away, run the script
again for another rotation. Each account is flagged must_change_password, so whoever
signs in next has to set their own.

  --accounts a,b,c   rotate only these logins (default: all three demo accounts)
  --show-only        list what would be rotated, without changing anything
"""
import argparse
import asyncio
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from accounts import generate_password  # noqa: E402
from auth import _hash  # noqa: E402
from db import db  # noqa: E402

DEMO_LOGINS = ["admin@mytaman.ai", "parent@mytaman.ai", "demostudent"]


async def rotate(logins, show_only: bool) -> int:
    now = datetime.now(timezone.utc).isoformat()
    rotated = []
    missing = []

    for login in logins:
        doc = await db.users.find_one(
            {"$or": [{"email": login.lower()}, {"username": login.lower()}]},
            {"_id": 0, "id": 1, "name": 1, "role": 1, "email": 1, "username": 1},
        )
        if not doc:
            missing.append(login)
            continue

        # In show-only mode nothing is generated: printing a password that was never
        # written would be a credential that looks real and does not work.
        new_password = None if show_only else generate_password()
        if not show_only:
            await db.users.update_one(
                {"id": doc["id"]},
                {"$set": {
                    "password": _hash(new_password),
                    "must_change_password": True,
                    "password_changed_at": now,
                    "password_changed_by": "rotate_demo_passwords.py",
                }},
            )
        rotated.append((login, doc.get("role", "?"), new_password))

    if missing:
        print(f"Not found (skipped): {', '.join(missing)}\n", file=sys.stderr)

    if not rotated:
        print("Nothing rotated.", file=sys.stderr)
        return 1

    verb = "Would rotate" if show_only else "Rotated"
    tail = "" if show_only else " Copy these now — they are not recoverable."
    print(f"\n{verb} {len(rotated)} account(s).{tail}\n")
    width = max(len(login) for login, _, _ in rotated)
    for login, role, pw in rotated:
        print(f"  {login.ljust(width)}  {role.ljust(7)}  {pw or '(not generated — dry run)'}")
    if not show_only:
        print("\nEach account must set its own password at next sign-in.\n")
    else:
        print("\nDry run: nothing was written. Re-run without --show-only to rotate.\n")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--accounts", default=",".join(DEMO_LOGINS),
                    help="comma-separated logins to rotate")
    ap.add_argument("--show-only", action="store_true",
                    help="list the accounts without changing them")
    args = ap.parse_args()
    logins = [a.strip() for a in args.accounts.split(",") if a.strip()]
    return asyncio.run(rotate(logins, args.show_only))


if __name__ == "__main__":
    raise SystemExit(main())
