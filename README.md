# MYTAMAN AI Tutor

An AI-powered e-learning platform for the Malaysian secondary curriculum (KSSM), built around **Tutor Packs** — bundles of courses and chapters that carry AI-generated or manually authored study content (summaries, quizzes, flashcards, mind maps, and notes) to students, with progress visibility for parents.

## Roles

| Role    | Capabilities |
|---------|--------------|
| **Admin**   | Create/delete Tutor Packs, author content (manually or via AI generation), manage the Model Router, review and publish confirmed content, manage students. |
| **Parent**  | Browse and select Tutor Packs, monitor a child's enrolled packs. |
| **Student** | Enroll in Tutor Packs, consume published content bilingually (EN/BM). |

Auth is JWT-based with role guards on both API routes and frontend routes.

## Content model & authoring workflow

Content is organized as a Coursera-style hierarchy:

```
Tutor Pack → Course → Chapter → Content (Summary / Quiz / Flashcards / Mind Map / Notes)
```

Each content type has its own editor shape (quizzes support MCQ/True-False/Short-answer up to 40 questions, flashcards are front/back pairs, mind maps are image uploads, notes are a structured bullet list distinct from the plain-text summary editor).

Authoring follows a **draft → confirm → publish** lifecycle:

1. **Draft** — An admin fills in content across any number of chapters/types/languages in the Manual Content page, then clicks **Save content** once. Everything typed since the last save is bundled into a single numbered draft (`Draft 1`, `Draft 2`, …) stored per Tutor Pack. Drafts can be renamed, duplicated, or bulk-deleted (via a Mark → select → delete flow), and clicking a draft loads/previews it in place.
2. **Confirm** — Each draft's 3-dot action menu (Confirm / Deny / Rename / Duplicate / Delete) lets an admin mark a draft as ready. "Deny" reverts a confirmed draft back to draft status.
3. **Publish** — On the Tutor Packs page, clicking a pack card opens a review pop-up listing that pack's **confirmed** drafts with a summary of what each covers. The admin selects which confirmed drafts actually go live; publishing resolves the latest confirmed version per (chapter, content type, language) slot and pushes it to the student/parent-facing content feed.

AI-generated content (via the Model Router) can also be created and published through the same `contents` pipeline, as an alternative to manual authoring.

## Model Router

Admin-configurable multi-provider AI setup (OpenAI / Anthropic / Gemini) with:
- Enable/disable and reorder providers, with automatic failover
- Encrypted API key storage (Fernet)
- Editable per-provider system prompts
- Emergent Universal Key as a shared fallback

## Tech stack

**Backend** — FastAPI + Motor (async MongoDB driver), Pydantic v2 models, JWT auth (PyJWT + bcrypt), Fernet-encrypted secrets.

**Frontend** — React (CRACO build), Tailwind CSS, Radix UI primitives, Sonner toasts, Lucide icons. Dark "Electric & Neon" design system (`#00f0ff` cyan accent on `#0a0514`/`#120a1f` backgrounds), bilingual EN/BM throughout via a global language context.

**Infra** — Fully Dockerized (Mongo + FastAPI/Uvicorn backend + Nginx-served React frontend), see [`DEPLOY.md`](./DEPLOY.md) for VM deployment instructions.

## Repository layout

```
backend/
  server.py       # FastAPI app + startup seeding
  auth.py         # register/login/me, JWT, role guard
  model_router.py # AI provider config, encrypted keys, failover
  packs.py        # Tutor Pack CRUD, enroll, publish
  courses.py      # Course/Chapter CRUD with cascade deletes
  content.py      # AI generate + manual drafts + publish + stats
  db.py           # Shared Mongo client + Fernet cipher
frontend/
  src/pages/admin/     # Overview, Generate, Manual Content, Model Router, Tutor Packs, Students
  src/pages/student/   # My Packs, Browse & Enroll
  src/pages/parent/    # Overview, Pack selection
  src/context/         # Language context (EN/BM)
memory/PRD.md     # Product requirements & backlog
DEPLOY.md         # Azure VM Docker deployment guide
```

## Local development

Backend and frontend each run independently — see inline comments in `docker-compose.yml` for env vars (`JWT_SECRET`, `FERNET_KEY`, `MONGO_URL`, AI provider keys). For a full containerized deploy, follow [`DEPLOY.md`](./DEPLOY.md).

Seeded demo accounts (created on first backend boot):

| Role    | Email                 | Password        |
|---------|-----------------------|-----------------|
| Admin   | admin@mytaman.ai      | Admin@12345     |
| Parent  | parent@mytaman.ai     | Parent@12345    |
| Student | student@mytaman.ai    | Student@12345   |

## Roadmap

See [`memory/PRD.md`](./memory/PRD.md) for the full prioritized backlog — near-term items include per-student progress tracking, parent↔student linking, quiz-taking/mind-map UI, and source-material file upload (PDF/DOCX ingestion).
