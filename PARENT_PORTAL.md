# Parent Portal — build plan

This branch (`phase6/parent_module`) is dedicated to building a real Parent portal.
Everything below reflects what was actually observed in the codebase as of this
branch's creation — not aspirational spec, the real current gap.

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
