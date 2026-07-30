# Parent Portal — build plan

This branch (`phase6/parent_module`) is dedicated to building a real Parent portal.
Everything below reflects what was actually observed in the codebase as of this
branch's creation — not aspirational spec, the real current gap.

## Status: implemented

The open questions below were resolved as follows (no user sign-off obtained before
building — flagged here so the decisions can be revisited):

1. **Linking**: parent creates the child account directly from the parent portal
   (`POST /parents/children`), which sets `parent_id` on the new student's user doc.
   No separate child self-signup path for a linked child.
2. **One child or many**: data model supports many (`parent_id` on the student doc,
   queried per parent), and the frontend has a child switcher that only renders when
   a parent has more than one child — but the only way to add a child today is the
   create-child flow above, so in practice it's usually one.
3. **Enrollment**: parent-initiated, via `POST /parents/children/{student_id}/enroll`.
4. **Student without a parent**: untouched — `/auth/register` still lets a student
   self-register with no `parent_id` at all.

Backend: `backend/parents.py` (new router) — `POST/GET /parents/children`,
`GET /parents/children/{student_id}/packs` (real completed/total/percent + quiz
average per pack, reusing `progress`/`quiz_results` the same way `content.py`'s
`/content/progress` does), `POST /parents/children/{student_id}/enroll`. Every
child-scoped route re-verifies `parent_id` server-side before touching that
student's data.

Frontend: `frontend/src/pages/parent/Parent.jsx` rebuilt — real per-pack progress
bars (no more hardcoded 25%), an "Add a child" form when the parent has none yet,
a child switcher for multi-child parents, and `ParentPacks` now enrolls the
selected child instead of the parent's own account.

### Follow-up round (after merge to main)

- **`DELETE /parents/children/{student_id}`**: unlinks a child (unsets `parent_id`
  on the student doc rather than deleting the account, so enrollments/progress
  survive an accidental click). No re-link flow exists yet if a parent wants the
  child back — that's a real gap, see below.
- **Fixed a real bug**: `ParentHome` and `ParentPacks` each ran their own
  `useChildren()` and independently defaulted to `children[0]`, so picking a
  non-default child on Overview silently reset back to the first child on Tutor
  Packs. Selection is now persisted in `localStorage` and shared across both pages.
- **"Manage children"** list added to `ParentHome` with the remove action above.

### Round 3: students can no longer exist without a parent

The linking gap above is now closed structurally rather than by adding a repair flow.
Public self-registration creates a **parent** and nothing else, so a student account
only comes into existence one of two ways:

1. **Parent creates it** in the portal — `POST /parents/children`, with a student ID
   (no email: many 13-year-olds don't have one, and reusing the parent's collides).
2. **Student asks, parent approves** — `POST /auth/register-student` writes a
   `pending_registrations` record and emails the nominated parent a one-time link.
   No `users` document exists until the parent approves at
   `POST /parents/child-requests/{token}/approve`. The link lands on `/approve-child`,
   which walks a parent with no account through creating one first (email locked to
   the address the child nominated), then shows them exactly what their child
   submitted plus the remaining fields to confirm.

Because `parent_id` is set at creation on both paths, "unparented student" stops being
a reachable state. Consequently **removing a child now deactivates the account**
(`active: false`) instead of clearing `parent_id`, which would orphan an account that
can no longer be re-created without a parent.

Supporting changes:

- Login takes a **student ID or an email** — one form, role comes from the account.
- `/auth/register` no longer accepts a `role`, which also closed a real
  privilege-escalation hole: the old shape let anyone `POST {"role": "admin"}` and
  mint themselves an admin account.
- Password minimum raised 6 → 8. Parent-set passwords carry `must_change_password`
  so the child picks their own on first sign-in; a password the child chose
  themselves does not, since they already know it.
- The child's chosen password is Fernet-encrypted on the pending record (the parent
  is shown it and may replace it), then bcrypt-hashed onto the real account, and the
  pending record is destroyed. The reversible copy never touches a user document.
- Approval links are stored as sha256, single-use, expire in 72h, and both student-ID
  reservation and per-parent-email send rate are capped so the endpoint can't be used
  to spam a stranger's inbox.
- `email_service.py` sends via SMTP env config, and logs the message to the console
  when unconfigured — **SMTP is not set up yet**; set `SMTP_HOST`/`SMTP_PORT`/
  `SMTP_USER`/`SMTP_PASSWORD`/`SMTP_FROM` and `APP_BASE_URL` to switch it on.

Verified with a 36-check backend pass over an in-memory Mongo and a full browser walk
of the real UI (student signup → emailed link → parent registration → approval →
student sign-in → duplicate-ID rejection).

### Round 4: student access is independent; parent linking is an invitation

Round 3's approval gate is removed. A student registers on their own and gets immediate
access — their account is real and usable the moment they submit the form. Parent
linking became additive rather than a precondition:

- `POST /auth/register-student` creates the student and returns an auth token, so the
  signup form logs them straight into the portal.
- It also records the parent's address on the student doc and sends that address an
  **invitation** (`send_parent_invite_email`) — friendly, benefit-led, with a
  *Create Parent Account* call to action. It never asks anyone to approve anything.
- `POST /parents/child-invites/{token}/accept` links an **existing** student to the
  parent by setting `parent_id`. Declining discards the invitation and changes nothing
  about the student's access.
- The `pending_registrations` collection is replaced by `parent_invites`, keyed to a
  real `student_id`. Invitations last 30 days (an invitation, not a security
  challenge), are superseded when a new one is issued, and are single-use.
- **The reversible copy of the student's password is gone entirely.** The student owns
  their credential; a parent accepting an invitation is linking to an account that
  already exists, so they never see or set it. This removed the one place plaintext
  could be recovered.
- Students see a banner across the portal while unlinked, with *Resend email to parent*
  and *Use a different email* (a mistyped address would otherwise be unrecoverable).
  It removes itself as soon as `GET /auth/link-status` reports `linked`.
- Resends are rate-limited (5-minute cooldown, 5/day per parent address); correcting
  the address bypasses the cooldown, since that's a fix rather than a retry.

Verified with 42 backend checks and a full browser walk: immediate access, the banner
appearing/persisting/disappearing, resend with a corrected address, the invitation
landing page, parent registration with a locked email, accepting, and the student's
password still working afterwards. The walk also asserts the parent is never shown a
password and that no "approve" wording survives on the invitation page.

### Known gaps still open (not implemented)

- **Parents who weren't emailed see nothing about pending requests** — by design; the
  approval panel is reachable only via the tokened link. If a parent loses the email,
  the child re-submits after the 72h expiry.
- **Legacy self-registered students** (any created before this round) still have no
  `parent_id` and no way to acquire one — there's no admin-assisted linking endpoint
  yet. The demo seed now creates a properly linked parent/child pair.
- **No parent email verification** — the parent's address is the consent anchor but
  isn't confirmed before they can approve a child.
- **One parent per child, still**: `parent_id` is a single field, so the two-guardian
  case from decision 2 above is still unsupported. Would need the
  `parent_child_links` collection this doc originally proposed.
- **No content-type breakdown for a child**: `GET /parents/children/{id}/packs` is
  pack-level only (completed/total/percent/quiz average), matching what
  `/students/roster` already exposes to admins — neither has a per-content-type
  (summary vs quiz vs flashcard) view.
- **No view of a child's actual submitted answers** — quiz_results only stores
  score/total per attempt, not per-question answers, so there's nothing to surface
  even if a UI were built for it.
- **No admin↔parent or parent↔student messaging/notifications** anywhere in the app.
- **No cap or rate limit** on how many children a parent can create.

## Current state (what exists today)

`frontend/src/pages/parent/Parent.jsx` is a placeholder, not a real parent
experience:

- **`ParentHome`** calls `GET /packs/mine` — the same endpoint the *student*
  portal uses for its own enrollments. There is no concept of "my child" at
  all; a parent account only ever sees packs enrolled under its own user id.
- The progress bar rendered per pack is **hardcoded**: `className="h-full w-1/4 ..."`
  — literally always 25%, never computed from real data.
- **`ParentPacks`** lets the parent enroll *themselves* in a pack via
  `POST /packs/enroll`, exactly like a student would — there's no "enroll my
  child" action.
- There is no `parent_id`, `child_id`, or any linking field anywhere in
  `backend/*.py` or the Mongo schema. Confirmed via repo-wide grep — nothing
  ties a parent user to a student user.
- The seeded demo accounts (`admin@mytaman.ai`, `parent@mytaman.ai`,
  `student@mytaman.ai`) are three independent, unlinked users.

## What needs to be decided before building

These are open design questions — pick answers before writing code, since they
change the data model:

1. **How does a parent get linked to a child?**
   - Option A: parent invites/links a child by the child's email (child must
     already have a student account).
   - Option B: parent creates the child account directly from the parent
     portal (parent enters child's name/email/password).
   - Option C: admin does the linking manually (fits the "MYTAMAN Staff"
     admin persona from the PRD, but adds admin workload).
2. **One child or many per parent?** The PRD says "their child" (singular) but
   real households often have multiple kids — decide now, it changes whether
   the parent UI needs a child-switcher.
3. **Who enrolls the child in a Tutor Pack — the parent, or the child?** The
   original PRD says "Parent... selects Tutor Packs for their child," implying
   parent-initiated enrollment, not the child self-enrolling. This is a real
   product decision, not just plumbing.
4. **Can a student account exist without a linked parent?** (Almost certainly
   yes — self-registered students shouldn't require a parent.) Confirm parent
   linking is opt-in / additive, not a hard requirement of the student role.

## Backend work

- **Data model**: add a `parent_child_links` collection (`{id, parent_id,
  student_id, created_at}`) rather than a single `parent_id` field on the user
  doc — this supports multiple children per parent (and multiple parents per
  child, e.g. two guardians) without a schema migration later if that's ever
  needed. Simpler alternative if the "one child, one parent" decision above is
  taken: a single `parent_id` field directly on the student's user doc.
- **New endpoints** (`backend/parents.py`, new router, registered in
  `server.py` the same way `students.py` was):
  - Whatever the linking mechanism from the decision above needs (invite by
    email, create-child, or nothing if admin-managed).
  - `GET /parents/children` — list the linked student(s) for the current
    parent.
  - `GET /parents/children/{student_id}/packs` — that child's enrolled packs
    with **real** progress, reusing the same aggregation logic already built
    in `backend/students.py`'s `/students/roster` (per-pack completed/total
    count, quiz average, last active) but scoped to one student instead of
    every student.
  - Authorization: every one of these must verify the requesting parent is
    actually linked to the requested `student_id` — a parent must never be
    able to query another family's child by guessing an id.
  - If parent-initiated enrollment is the chosen model (question 3 above):
    `POST /parents/children/{student_id}/enroll` instead of letting the parent
    call the existing `POST /packs/enroll` (which enrolls the *caller*, not a
    named child).

## Frontend work

- Replace the fake `w-1/4` progress bar with the real per-child, per-pack
  completion % from the new endpoint.
- If multi-child is in scope: a child switcher/selector at the top of the
  parent dashboard.
- Rebuild `ParentPacks` to browse and enroll **on behalf of** a selected child
  (if that's the chosen enrollment model), not enroll the parent's own account.
- A per-child detail view mirroring the admin Students roster's expandable
  row (per-pack completion, quiz average, last active) — that component/logic
  in `frontend/src/pages/admin/Students.jsx` is a reasonable template to adapt
  for a single-child, parent-facing version.
- Whatever UI the chosen linking mechanism needs (an "Add a child" flow).

## Explicitly out of scope for this branch

- Anything from the Premium/X-Points tiers (Socratic AI chat, leaderboards,
  Stripe) — unrelated to the parent-visibility gap this branch exists to close.
- Admin-side changes beyond what's needed to support parent linking (e.g. no
  need to touch Tutor Pack authoring/publishing flows).
