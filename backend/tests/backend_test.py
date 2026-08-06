"""Lv99.ai — Backend regression tests (pytest)

Covers:
- Auth (register, login, /me, role gating)
- Packs (list, create by admin, enroll by student, mine)
- Content (manual + AI generate via Model Router, list, publish, stats)
- Model Router (config, patch provider, order, prompts)
"""
import json
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"

# Demo passwords are no longer hardcoded in the app -- they come from the environment or
# are generated at seed time -- so the suite reads them the same way. Point these at
# whatever the deployment under test actually uses.
ADMIN = {"email": "admin@mytaman.ai", "password": os.environ.get("TEST_ADMIN_PASSWORD", "")}
PARENT = {"email": "parent@mytaman.ai", "password": os.environ.get("TEST_PARENT_PASSWORD", "")}
STUDENT = {"email": "student@mytaman.ai", "password": os.environ.get("TEST_STUDENT_PASSWORD", "")}


# -------- helpers --------
def _login(email, password):
    if not password:
        pytest.skip(
            f"No password configured for {email}. Set TEST_ADMIN_PASSWORD / "
            "TEST_PARENT_PASSWORD / TEST_STUDENT_PASSWORD to the deployment's values."
        )
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def admin_token():
    return _login(**ADMIN)["token"]


@pytest.fixture(scope="module")
def parent_token():
    return _login(**PARENT)["token"]


@pytest.fixture(scope="module")
def student_token():
    return _login(**STUDENT)["token"]


def _h(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- Health ----------
class TestHealth:
    def test_root(self):
        r = requests.get(f"{API}/", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert "Lv99.ai" in data["message"]


# ---------- Auth ----------
class TestAuth:
    def test_login_admin(self):
        data = _login(**ADMIN)
        assert data["user"]["role"] == "admin"
        assert data["user"]["email"] == ADMIN["email"]
        assert isinstance(data["token"], str) and len(data["token"]) > 10

    def test_login_student(self):
        data = _login(**STUDENT)
        assert data["user"]["role"] == "student"

    def test_login_parent(self):
        data = _login(**PARENT)
        assert data["user"]["role"] == "parent"

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": "admin@mytaman.ai", "password": "wrong"}, timeout=10)
        assert r.status_code == 401

    def test_me_requires_auth(self):
        r = requests.get(f"{API}/auth/me", timeout=10)
        assert r.status_code == 401

    def test_me_ok(self, admin_token):
        r = requests.get(f"{API}/auth/me", headers=_h(admin_token), timeout=10)
        assert r.status_code == 200
        assert r.json()["role"] == "admin"

    def test_register_new_student(self):
        email = f"TEST_stu_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(
            f"{API}/auth/register",
            json={"email": email, "password": "Test@12345", "name": "TEST Student", "role": "student"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["user"]["email"] == email
        assert j["user"]["role"] == "student"
        # login again works
        r2 = requests.post(f"{API}/auth/login", json={"email": email, "password": "Test@12345"}, timeout=10)
        assert r2.status_code == 200

    def test_register_duplicate(self):
        r = requests.post(
            f"{API}/auth/register",
            json={"email": ADMIN["email"], "password": "x123456", "name": "dup", "role": "student"},
            timeout=10,
        )
        assert r.status_code == 400


# ---------- Role gating ----------
class TestRoleGating:
    def test_student_cannot_access_router_config(self, student_token):
        r = requests.get(f"{API}/router/config", headers=_h(student_token), timeout=10)
        assert r.status_code == 403

    def test_parent_cannot_access_stats(self, parent_token):
        r = requests.get(f"{API}/content/stats", headers=_h(parent_token), timeout=10)
        assert r.status_code == 403

    def test_student_cannot_generate(self, student_token):
        r = requests.post(
            f"{API}/content/generate",
            headers=_h(student_token),
            json={
                "pack_id": "any",
                "title": "Nope",
                "content_type": "summary",
                "source_text": "hello world hello world",
                "language": "en",
            },
            timeout=10,
        )
        assert r.status_code == 403


# ---------- Packs ----------
class TestPacks:
    def test_list_seed_packs(self, admin_token):
        r = requests.get(f"{API}/packs/list", headers=_h(admin_token), timeout=10)
        assert r.status_code == 200
        packs = r.json()
        assert isinstance(packs, list)
        assert len(packs) >= 3
        titles = [p["title"] for p in packs]
        assert any("Sejarah" in t for t in titles)

    def test_admin_can_create_pack(self, admin_token):
        payload = {
            "title": "TEST_Pack_" + uuid.uuid4().hex[:6],
            "description": "TEST pack created by automated tests",
            "subject": "Science",
            "grade": "Form 3",
            "language": "en",
        }
        r = requests.post(f"{API}/packs/create", headers=_h(admin_token), json=payload, timeout=10)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["id"]
        assert j["title"] == payload["title"]
        # GET back verifies persistence
        rl = requests.get(f"{API}/packs/list", headers=_h(admin_token), timeout=10)
        assert any(p["id"] == j["id"] for p in rl.json())

    def test_student_cannot_create_pack(self, student_token):
        r = requests.post(
            f"{API}/packs/create",
            headers=_h(student_token),
            json={"title": "x", "description": "y", "subject": "s", "grade": "g"},
            timeout=10,
        )
        assert r.status_code == 403

    def test_student_enroll_and_mine(self, admin_token, student_token):
        packs = requests.get(f"{API}/packs/list", headers=_h(admin_token), timeout=10).json()
        pack_id = packs[0]["id"]
        r = requests.post(
            f"{API}/packs/enroll", headers=_h(student_token), json={"pack_id": pack_id}, timeout=10
        )
        assert r.status_code == 200
        rm = requests.get(f"{API}/packs/mine", headers=_h(student_token), timeout=10)
        assert rm.status_code == 200
        mine = rm.json()
        assert any(p["id"] == pack_id for p in mine)


# ---------- Content ----------
class TestContent:
    _created_id = None

    def test_stats(self, admin_token):
        r = requests.get(f"{API}/content/stats", headers=_h(admin_token), timeout=10)
        assert r.status_code == 200
        j = r.json()
        for key in ("total_content", "published_content", "students", "parents", "packs"):
            assert key in j

    def test_manual_create_then_publish(self, admin_token):
        packs = requests.get(f"{API}/packs/list", headers=_h(admin_token), timeout=10).json()
        pack_id = packs[0]["id"]
        r = requests.post(
            f"{API}/content/manual",
            headers=_h(admin_token),
            json={
                "pack_id": pack_id,
                "title": "TEST_Manual_" + uuid.uuid4().hex[:6],
                "content_type": "notes",
                "body": "TEST body content for manual entry.",
                "language": "en",
            },
            timeout=10,
        )
        assert r.status_code == 200, r.text
        cid = r.json()["id"]
        assert r.json()["published"] is False
        # publish
        rp = requests.post(f"{API}/content/{cid}/publish", headers=_h(admin_token), timeout=10)
        assert rp.status_code == 200
        # verify list_content shows it published
        rl = requests.get(
            f"{API}/content/list", headers=_h(admin_token), params={"pack_id": pack_id}, timeout=10
        )
        assert rl.status_code == 200
        docs = rl.json()
        found = [d for d in docs if d["id"] == cid]
        assert found and found[0]["published"] is True
        TestContent._created_id = cid

    def test_student_sees_only_published(self, admin_token, student_token):
        packs = requests.get(f"{API}/packs/list", headers=_h(admin_token), timeout=10).json()
        pack_id = packs[0]["id"]
        rl = requests.get(
            f"{API}/content/list",
            headers=_h(student_token),
            params={"pack_id": pack_id},
            timeout=10,
        )
        assert rl.status_code == 200
        for d in rl.json():
            assert d["published"] is True

    @pytest.mark.timeout(90)
    def test_ai_generate_summary(self, admin_token):
        packs = requests.get(f"{API}/packs/list", headers=_h(admin_token), timeout=10).json()
        pack_id = packs[0]["id"]
        payload = {
            "pack_id": pack_id,
            "title": "TEST_AI_" + uuid.uuid4().hex[:6],
            "content_type": "summary",
            "source_text": (
                "The industrial revolution was a period of major industrialization that took place "
                "during the late 1700s and early 1800s in Britain and later spread to other parts of "
                "the world, transforming economies from agrarian to industrial."
            ),
            "language": "en",
        }
        r = requests.post(f"{API}/content/generate", headers=_h(admin_token), json=payload, timeout=90)
        assert r.status_code == 200, f"AI generate failed: {r.status_code} {r.text}"
        j = r.json()
        assert j["provider"] in ("openai", "anthropic", "gemini"), f"Unexpected provider: {j.get('provider')}"
        assert isinstance(j["body"], str) and len(j["body"]) > 20
        assert j["published"] is False


# ---------- Router ----------
class TestRouter:
    def test_get_config(self, admin_token):
        r = requests.get(f"{API}/router/config", headers=_h(admin_token), timeout=10)
        assert r.status_code == 200
        j = r.json()
        provs = {p["provider"]: p for p in j["providers"]}
        assert set(provs.keys()) == {"openai", "anthropic", "gemini"}
        # has_key is now per-provider: a provider is "ready" only with a key of its own,
        # saved in the panel or set as its own env var. There is no shared fallback key
        # making every provider look configured, so this asserts the source is honest
        # rather than asserting every provider is ready.
        for p in j["providers"]:
            assert p["key_source"] in {"ui", "env", "none"}
            assert p["has_key"] is (p["key_source"] != "none")

    def test_patch_provider_toggle(self, admin_token):
        # disable then re-enable openai
        r1 = requests.patch(
            f"{API}/router/providers/openai",
            headers=_h(admin_token),
            json={"enabled": False},
            timeout=10,
        )
        assert r1.status_code == 200
        cfg = requests.get(f"{API}/router/config", headers=_h(admin_token), timeout=10).json()
        openai_cfg = [p for p in cfg["providers"] if p["provider"] == "openai"][0]
        assert openai_cfg["enabled"] is False

        r2 = requests.patch(
            f"{API}/router/providers/openai",
            headers=_h(admin_token),
            json={"enabled": True},
            timeout=10,
        )
        assert r2.status_code == 200

    def test_update_order(self, admin_token):
        new_order = ["anthropic", "openai", "gemini"]
        r = requests.post(
            f"{API}/router/order", headers=_h(admin_token), json={"order": new_order}, timeout=10
        )
        assert r.status_code == 200
        cfg = requests.get(f"{API}/router/config", headers=_h(admin_token), timeout=10).json()
        got = [p["provider"] for p in sorted(cfg["providers"], key=lambda x: x["order"])]
        assert got == new_order
        # restore
        requests.post(
            f"{API}/router/order",
            headers=_h(admin_token),
            json={"order": ["openai", "anthropic", "gemini"]},
            timeout=10,
        )

    def test_update_prompts(self, admin_token):
        r = requests.put(
            f"{API}/router/prompts",
            headers=_h(admin_token),
            json={"prompts": {"chapter_summary": "TEST PROMPT — please summarize."}},
            timeout=10,
        )
        assert r.status_code == 200
        cfg = requests.get(f"{API}/router/config", headers=_h(admin_token), timeout=10).json()
        assert "TEST PROMPT" in cfg["prompts"]["chapter_summary"]

    def test_save_provider_api_key(self, admin_token):
        # A UI-saved key now takes priority over env vars (see _resolve_key), so this fake
        # key WOULD be used for real calls -- this test only checks has_key, not usage.
        r = requests.patch(
            f"{API}/router/providers/gemini",
            headers=_h(admin_token),
            json={"api_key": "sk-test-fake-key"},
            timeout=10,
        )
        assert r.status_code == 200
        cfg = requests.get(f"{API}/router/config", headers=_h(admin_token), timeout=10).json()
        g = [p for p in cfg["providers"] if p["provider"] == "gemini"][0]
        assert g["has_key"] is True
        # cleanup — remove the key
        requests.patch(
            f"{API}/router/providers/gemini",
            headers=_h(admin_token),
            json={"api_key": ""},
            timeout=10,
        )


# ---------- Socratic Learning ----------
class TestSocratic:
    """Socratic Learning is gated two ways: role (admin-only settings/oversight) and
    enrolment (a student only gets a tutor on a pack they are enrolled in). Tiers are
    gone, so every pack exposes the tutor; enrolment is what remains, and it is enforced
    server-side, so it is tested here rather than trusted to the UI.

    The conversation endpoints themselves are not exercised -- every turn is a live,
    billable model call through the Model Router, which this suite deliberately avoids.
    """

    def test_settings_admin_only(self, student_token, parent_token):
        for tok in (student_token, parent_token):
            r = requests.get(f"{API}/socratic/settings", headers=_h(tok), timeout=10)
            assert r.status_code == 403

    def test_admin_oversight_is_admin_only(self, student_token):
        for path in ("/socratic/admin/sessions", "/socratic/admin/stats"):
            r = requests.get(f"{API}{path}", headers=_h(student_token), timeout=10)
            assert r.status_code == 403

    def test_get_settings_defaults(self, admin_token):
        r = requests.get(f"{API}/socratic/settings", headers=_h(admin_token), timeout=10)
        assert r.status_code == 200, r.text
        s = r.json()
        assert set(s) >= {"enabled", "max_turns_per_session", "daily_message_cap", "allow_quiz_answers"}
        # Tiers are gone: the settings payload must not reintroduce a pack-level gate.
        assert "tiers" not in s
        # The tutor must never hand over a quiz answer unless an admin deliberately opts in.
        assert s["allow_quiz_answers"] is False

    def test_update_settings_roundtrip(self, admin_token):
        original = requests.get(f"{API}/socratic/settings", headers=_h(admin_token), timeout=10).json()
        r = requests.put(
            f"{API}/socratic/settings",
            headers=_h(admin_token),
            json={"max_turns_per_session": 12, "daily_message_cap": 34},
            timeout=10,
        )
        assert r.status_code == 200, r.text
        assert r.json()["max_turns_per_session"] == 12
        assert r.json()["daily_message_cap"] == 34
        # unspecified fields are left alone
        assert r.json()["enabled"] == original["enabled"]
        requests.put(
            f"{API}/socratic/settings",
            headers=_h(admin_token),
            json={
                "max_turns_per_session": original["max_turns_per_session"],
                "daily_message_cap": original["daily_message_cap"],
            },
            timeout=10,
        )

    def test_update_settings_rejects_out_of_range(self, admin_token):
        r = requests.put(
            f"{API}/socratic/settings", headers=_h(admin_token),
            json={"daily_message_cap": 0}, timeout=10,
        )
        assert r.status_code == 422

    def test_session_requires_auth(self):
        r = requests.post(f"{API}/socratic/session", json={"content_id": "whatever"}, timeout=10)
        assert r.status_code == 401

    def test_session_on_unknown_content(self, student_token):
        r = requests.post(
            f"{API}/socratic/session",
            headers=_h(student_token),
            json={"content_id": f"missing-{uuid.uuid4().hex}"},
            timeout=10,
        )
        assert r.status_code == 404

    def test_unenrolled_pack_is_refused(self, admin_token, student_token):
        """With tiers gone, enrolment is the only pack-level boundary left -- a student
        must be refused by the API, not merely not shown the panel."""
        mine = requests.get(f"{API}/packs/mine", headers=_h(student_token), timeout=10).json()
        enrolled_ids = {p["id"] for p in mine}
        contents = requests.get(f"{API}/content/list", headers=_h(admin_token), timeout=15).json()
        target = next(
            (c for c in contents if c.get("published") and c.get("pack_id") not in enrolled_ids),
            None,
        )
        if target is None:
            pytest.skip("no published content on an unenrolled pack to test the enrolment gate against")

        r = requests.post(
            f"{API}/socratic/session",
            headers=_h(student_token),
            json={"content_id": target["id"]},
            timeout=10,
        )
        assert r.status_code == 403
        assert "enrolled" in r.json()["detail"].lower()

        e = requests.get(
            f"{API}/socratic/eligibility?content_id={target['id']}",
            headers=_h(student_token), timeout=10,
        )
        assert e.status_code == 200
        assert e.json()["available"] is False

    def test_socratic_prompt_is_editable_in_router(self, admin_token):
        """The tutor prompt has to show up in the Model Router editor -- that panel is the
        only place an admin can tune the tutor's behaviour."""
        cfg = requests.get(f"{API}/router/config", headers=_h(admin_token), timeout=10).json()
        assert "socratic_tutor" in cfg["prompts"]
        assert "JSON" in cfg["prompts"]["socratic_tutor"]


# ---------- Account Manager ----------
class TestAccounts:
    """Admin-side password and access control. The security properties worth testing are
    negative ones: no password hash escapes the API, no plaintext password reaches the
    audit trail, and the last admin cannot be locked out."""

    def test_list_is_admin_only(self, student_token, parent_token):
        for tok in (student_token, parent_token):
            r = requests.get(f"{API}/accounts/list", headers=_h(tok), timeout=10)
            assert r.status_code == 403

    def test_list_never_returns_password_hashes(self, admin_token):
        r = requests.get(f"{API}/accounts/list", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        rows = r.json()
        assert rows, "expected at least the seeded accounts"
        for row in rows:
            assert "password" not in row
            assert set(row) >= {"id", "name", "role", "login", "login_type", "active"}

    def test_role_filter(self, admin_token):
        r = requests.get(f"{API}/accounts/list?role=student", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        assert all(a["role"] == "student" for a in r.json())

    def test_generated_password_works_and_is_returned_once(self, admin_token):
        """The generated password must actually authenticate -- otherwise the admin hands
        out a credential that doesn't work -- and must not be readable afterwards."""
        students = requests.get(
            f"{API}/accounts/list?role=student", headers=_h(admin_token), timeout=15
        ).json()
        target = next((s for s in students if s["login_type"] == "username"), None)
        if target is None:
            pytest.skip("no student account to reset")

        r = requests.post(
            f"{API}/accounts/{target['id']}/password",
            headers=_h(admin_token), json={"generate": True, "require_change": False}, timeout=15,
        )
        assert r.status_code == 200, r.text
        pw = r.json()["generated_password"]
        assert pw and len(pw) >= 12

        login = requests.post(
            f"{API}/auth/login", json={"identifier": target["login"], "password": pw}, timeout=15
        )
        assert login.status_code == 200, login.text

        # The plaintext must not survive anywhere readable.
        audit = requests.get(f"{API}/accounts/audit?limit=25", headers=_h(admin_token), timeout=10).json()
        assert pw not in json.dumps(audit)
        listing = requests.get(f"{API}/accounts/list?role=student", headers=_h(admin_token), timeout=15).json()
        assert pw not in json.dumps(listing)

    def test_password_must_meet_minimum_length(self, admin_token):
        me = requests.get(f"{API}/auth/me", headers=_h(admin_token), timeout=10).json()
        r = requests.post(
            f"{API}/accounts/{me['id']}/password",
            headers=_h(admin_token), json={"new_password": "short"}, timeout=10,
        )
        assert r.status_code == 422

    def test_cannot_supply_both_password_and_generate(self, admin_token):
        me = requests.get(f"{API}/auth/me", headers=_h(admin_token), timeout=10).json()
        r = requests.post(
            f"{API}/accounts/{me['id']}/password",
            headers=_h(admin_token),
            json={"new_password": "longenough123", "generate": True}, timeout=10,
        )
        assert r.status_code == 422

    def test_cannot_remove_self(self, admin_token):
        me = requests.get(f"{API}/auth/me", headers=_h(admin_token), timeout=10).json()
        r = requests.delete(f"{API}/accounts/{me['id']}", headers=_h(admin_token), timeout=10)
        assert r.status_code == 400
        assert "own account" in r.json()["detail"]

    def test_cannot_block_self(self, admin_token):
        """Block deletes as well, so the self-guard has to cover it too -- otherwise the
        last admin could delete themselves and blocklist the address on the way out."""
        me = requests.get(f"{API}/auth/me", headers=_h(admin_token), timeout=10).json()
        r = requests.post(
            f"{API}/accounts/{me['id']}/block", headers=_h(admin_token), json={}, timeout=10
        )
        assert r.status_code == 400

    def test_block_and_unblock_an_identifier(self, admin_token):
        """A blocked address must be refused at registration, and registrable again once
        the block is lifted."""
        email = f"blocktest-{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(
            f"{API}/accounts/blocked/add",
            headers=_h(admin_token), json={"identifier": email, "reason": "automated test"},
            timeout=10,
        )
        assert r.status_code == 200, r.text
        block_id = r.json()["id"]

        try:
            reg = requests.post(
                f"{API}/auth/register",
                json={"email": email, "password": "TestPass123", "name": "Blocked Tester"},
                timeout=10,
            )
            assert reg.status_code == 403, reg.text

            listing = requests.get(f"{API}/accounts/blocked/list", headers=_h(admin_token), timeout=10)
            assert any(b["identifier"] == email for b in listing.json())
        finally:
            un = requests.delete(f"{API}/accounts/blocked/{block_id}", headers=_h(admin_token), timeout=10)
            assert un.status_code == 200, un.text

        # Registrable again once unblocked.
        reg2 = requests.post(
            f"{API}/auth/register",
            json={"email": email, "password": "TestPass123", "name": "Blocked Tester"},
            timeout=10,
        )
        assert reg2.status_code == 200, reg2.text
        me = requests.get(
            f"{API}/auth/me", headers=_h(reg2.json()["token"]), timeout=10
        ).json()
        # Clean up the account this test created.
        requests.delete(f"{API}/accounts/{me['id']}", headers=_h(admin_token), timeout=10)

    def test_blocking_the_same_address_twice_is_idempotent(self, admin_token):
        email = f"dupe-{uuid.uuid4().hex[:8]}@example.com"
        a = requests.post(f"{API}/accounts/blocked/add", headers=_h(admin_token),
                          json={"identifier": email}, timeout=10)
        b = requests.post(f"{API}/accounts/blocked/add", headers=_h(admin_token),
                          json={"identifier": email}, timeout=10)
        assert a.status_code == 200 and b.status_code == 200
        assert a.json()["id"] == b.json()["id"]
        requests.delete(f"{API}/accounts/blocked/{a.json()['id']}", headers=_h(admin_token), timeout=10)

    def test_remove_purges_the_account_and_its_data(self, admin_token):
        """Create a throwaway parent, delete it, and confirm it is gone from the API --
        Remove is a real deletion, not a flag."""
        email = f"purge-{uuid.uuid4().hex[:8]}@example.com"
        reg = requests.post(
            f"{API}/auth/register",
            json={"email": email, "password": "TestPass123", "name": "Purge Tester"},
            timeout=10,
        )
        assert reg.status_code == 200, reg.text
        token = reg.json()["token"]
        uid = requests.get(f"{API}/auth/me", headers=_h(token), timeout=10).json()["id"]

        r = requests.delete(f"{API}/accounts/{uid}", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["deleted_users"] == 1
        assert r.json()["removed"]["users"] == 1

        listing = requests.get(f"{API}/accounts/list", headers=_h(admin_token), timeout=15).json()
        assert all(a["id"] != uid for a in listing)
        # The old session must stop working immediately.
        assert requests.get(f"{API}/auth/me", headers=_h(token), timeout=10).status_code == 401
        # Remove does not blocklist: the address is free to register again.
        again = requests.post(
            f"{API}/auth/register",
            json={"email": email, "password": "TestPass123", "name": "Purge Tester"},
            timeout=10,
        )
        assert again.status_code == 200, again.text
        uid2 = requests.get(f"{API}/auth/me", headers=_h(again.json()["token"]), timeout=10).json()["id"]
        requests.delete(f"{API}/accounts/{uid2}", headers=_h(admin_token), timeout=15)

    def test_roster_reports_guardian_state(self, admin_token):
        """The roster is the only surface where a guardian-less learner is visible, so it
        has to carry the guardian fields."""
        r = requests.get(f"{API}/students/roster", headers=_h(admin_token), timeout=20)
        assert r.status_code == 200, r.text
        rows = r.json()
        if not rows:
            pytest.skip("no students on the roster")
        for row in rows:
            assert set(row) >= {"parent_name", "guardian_removed", "former_parent_name", "active"}
            # A learner with a live guardian is never simultaneously flagged as having
            # lost one.
            if row["parent_name"]:
                assert row["guardian_removed"] is False

    def test_notifications_are_scoped_to_the_caller(self, student_token, parent_token):
        """A notice is per user; one account must not be able to read or dismiss
        another's."""
        r = requests.get(f"{API}/notifications/list", headers=_h(student_token), timeout=10)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)
        # A random id must 404 rather than mark anything read.
        bogus = requests.post(
            f"{API}/notifications/{uuid.uuid4()}/read", headers=_h(parent_token), timeout=10
        )
        assert bogus.status_code == 404

    def test_removing_a_parent_keeps_children_and_prompts_reconnect(self, admin_token):
        """The default is orphan-and-notify, not cascade: the learner keeps their account
        and is asked to invite a new guardian."""
        email = f"guardian-{uuid.uuid4().hex[:8]}@example.com"
        reg = requests.post(
            f"{API}/auth/register",
            json={"email": email, "password": "TestPass123", "name": "Temp Guardian"},
            timeout=10,
        )
        assert reg.status_code == 200, reg.text
        ptoken = reg.json()["token"]
        pid = requests.get(f"{API}/auth/me", headers=_h(ptoken), timeout=10).json()["id"]

        username = f"tempkid{uuid.uuid4().hex[:6]}"
        child = requests.post(
            f"{API}/parents/children",
            headers=_h(ptoken),
            json={
                "name": "Temp Kid", "username": username, "password": "KidPass123",
                "grade": "Form 1", "birth_year": 2012,
                "relationship": "guardian", "language": "en",
            },
            timeout=10,
        )
        if child.status_code != 200:
            pytest.skip(f"could not create a test child: {child.status_code} {child.text}")
        child_id = child.json().get("id")

        r = requests.delete(f"{API}/accounts/{pid}", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["deleted_users"] == 1, "the child must not be deleted by default"
        assert r.json()["orphaned_children"] == 1

        accounts = requests.get(f"{API}/accounts/list?role=student", headers=_h(admin_token), timeout=15).json()
        assert any(a["id"] == child_id for a in accounts), "child should still exist"

        # The child can sign in and is told to reconnect.
        login = requests.post(
            f"{API}/auth/login", json={"identifier": username, "password": "KidPass123"}, timeout=10
        )
        assert login.status_code == 200, login.text
        ctoken = login.json()["token"]
        status = requests.get(f"{API}/auth/link-status", headers=_h(ctoken), timeout=10).json()
        assert status["linked"] is False
        assert status["guardian_removed"] is True

        notes = requests.get(f"{API}/notifications/list", headers=_h(ctoken), timeout=10).json()
        assert any(n["kind"] == "guardian_removed" for n in notes)

        requests.delete(f"{API}/accounts/{child_id}", headers=_h(admin_token), timeout=15)

    def test_cannot_deactivate_self(self, admin_token):
        me = requests.get(f"{API}/auth/me", headers=_h(admin_token), timeout=10).json()
        r = requests.post(
            f"{API}/accounts/{me['id']}/active",
            headers=_h(admin_token), json={"active": False}, timeout=10,
        )
        assert r.status_code == 400
        assert "own account" in r.json()["detail"]
