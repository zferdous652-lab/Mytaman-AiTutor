# MYTAMAN AI Tutor — PRD

## Original problem statement
User uploaded `MYTAMAN AI Tutor_concept_draft_v2.docx` and asked to "start building the website following the MVP." The document describes an AI-powered e-learning platform for Malaysian secondary curriculum (KSSM) with three roles (Admin / Parent / Student), a Tutor Pack tier system (Basic / Premium / X-Points), and a Model Router that manages multiple AI providers with failover, editable system prompts, and encrypted key storage.

## User choices (Feb 17, 2026)
- **MVP slice**: 3D-styled landing + Admin dashboard (Generate + Model Router) + Student view + Parent view
- **AI providers**: All three (OpenAI / Anthropic / Gemini) via Model Router, using Emergent Universal Key as fallback
- **Auth**: JWT-based custom auth with roles
- **Design**: Bold AI-themed dark neon/futuristic (Electric & Neon archetype from design agent)
- **Language**: EN + BM toggle from day 1

## User personas
- **Admin (MYTAMAN Staff)** — creates Tutor Packs, generates AI content, configures the Model Router, monitors ops.
- **Parent (Guardian)** — selects Tutor Packs for their child, monitors progress.
- **Student (Learner)** — enrolls into packs, consumes published summaries / quizzes / flashcards / notes / mind maps.

## Core requirements (static)
- Isolated dashboards per role (protected by JWT + role guard).
- AI content generation for: summary, quiz, flashcards, mind map, notes — bilingual EN / BM.
- Model Router: providers list (OpenAI GPT-5.4, Anthropic Claude Sonnet 4.6, Gemini 3 Flash), enable/disable, reorder, encrypted API keys, editable system prompts.
- Publishing workflow: admin generates → publishes → visible to enrolled students.
- Tutor Pack CRUD (Basic tier for MVP).
- Language toggle (EN/BM) persisted in localStorage.

## What's been implemented — v1 (Feb 17, 2026)
**Backend** (`/app/backend/`):
- `server.py` — FastAPI + lifespan seeding of demo users and 3 sample Tutor Packs (incl. KSSM Form 1 Sejarah).
- `auth.py` — Register, Login, `/me`, JWT (bcrypt hashed passwords), role dependency.
- `model_router.py` — Config storage in Mongo, Fernet-encrypted API keys, provider ordering, failover across OpenAI/Anthropic/Gemini using `emergentintegrations`, editable system prompts.
- `content.py` — AI generate, manual create, list (role-aware), publish, delete, stats.
- `packs.py` — CRUD + enroll + mine + seed.
- `db.py` — Shared Motor client + Fernet cipher helpers.

**Frontend** (`/app/frontend/src/`):
- Landing page with animated hero (CSS+framer-motion orb, ring system, particle field), role cards, features, about, contact — all bilingual.
- Login, Register (student/parent selfsignup), role-based routing.
- Admin dashboard: Overview (stats), Generate with AI, Manual content, Model Router settings, Tutor Packs, Students.
- Student dashboard: My Packs (with content grid + modal), Browse & Enroll.
- Parent dashboard: Overview + Pack selection.
- Global EN/BM language toggle with LangContext.
- Sonner toasts, Lucide icons, Unbounded + Outfit + JetBrains Mono fonts, Electric & Neon dark theme.

**Testing**: 25/25 backend tests, all critical frontend flows verified (100%).

## Prioritized backlog

### P0 (next)
- Localize hardcoded H1 headings on dashboard + auth pages (only sidebar/overlines are currently translated).
- Add `<html lang>` update when EN/BM toggle changes.

### P1
- Per-student progress tracking (roster on `/admin/students`, weakness detection, per-content completion state).
- AI token cost tracking (log cost per generation, expose to Admin Overview).
- Parent ↔ Student linking (assign child to parent).
- Mind map + quiz-taking UI (currently render raw JSON body).
- File upload for source materials (PDF/DOCX ingestion → text).

### P2 (from concept doc future tiers)
- Premium Tutor Pack: live Socratic AI chat, streaming tutor conversation.
- X-Points Tutor Pack: daily study planner, leaderboard, purchases (Stripe), video tutorials, mock exams.
- Analytics dashboard: daily ops stats, retention.
- Content moderation queue for AI outputs before publish.

## Next tasks
1. Localize dashboard H1s (P0).
2. Wire simple progress model + per-pack progress bars driven by real completion.
3. Add file-upload endpoint (backend) + drag-and-drop UI on Generate page.
