<div align="center">
  <h1>Classroom</h1>
  <p><b>Product Requirements Document (PRD) &amp; Implementation Plan</b></p>
  <p>A modern university classroom management system — subjects, students, enrollment, grades, attendance.</p>
</div>

---

## 1. Project Overview

**Classroom** is a full-stack web application for universities to manage the academic lifecycle of a course: defining subjects, enrolling students, recording grades, and tracking attendance — through a fast, accessible, visually polished interface.

**Target users**

| Role | Capabilities |
|------|-------------|
| Admin | Manage subjects, students, enrollment; view all dashboards |
| Instructor | Teach assigned subjects, enter grades, take attendance |
| Student | View own enrollment, grades, attendance record |

**Current status (frontend)**

| Area | State |
|------|-------|
| Subjects list | ✅ Live — name search, department filter, server-side pagination, row edit/delete actions |
| Data layer | ✅ In-memory mock provider in `src/providers/data.ts` (full subjects CRUD; resets on reload until Phase 1) |
| Subjects CRUD | ✅ Create/edit forms with F2 Zod validation (code pattern + uniqueness, name 2–120, department enum, description ≤ 500), delete confirmation, sonner toasts |
| Dashboard | ✅ Stat cards with animated count-up (live subject count) + Recharts trends (mock series until `/api/dashboard/*`) |
| Auth pages | ✅ `/login`, `/register`, `/forgot-password` wired through a mock `src/providers/auth.ts` (localStorage demo session; JWT + roles in Phase 2) |
| Notices / Materials / Suggestions | ⛔ Planned — F9–F11 (§3); schema, endpoints, and hybrid mock seeds designed in §5.2–§5.4 |
| Backend | ⛔ Not started — planned in §5 |

---

## 2. Tech Stack

### Frontend (current — verified against `package.json`)

| Layer | Technology |
|-------|-----------|
| Runtime | React 19.1, TypeScript 5.8 (strict), Vite 6 |
| Framework | Refine 5 (data provider, access control, routing, hooks) |
| Routing | React Router 7 |
| Tables | TanStack Table 8 via `@refinedev/react-table` (server-side pagination/filter/sort) |
| Styling | Tailwind CSS 4, shadcn/ui + Radix UI, `tw-animate-css` |
| Forms | react-hook-form 7 + Zod 3 + `@hookform/resolvers` |
| Charts | Recharts 2.15 |
| Icons | lucide-react |
| Toasts | sonner |
| Theming | next-themes (light / dark / system) |
| Command palette | `@refinedev/kbar` (⌘K) |
| Data provider (target) | `@refinedev/simple-rest` → REST API, with the mock provider as a dev fallback |
| Lint | ESLint 9 + `typescript-eslint` |

### Backend (planned — detail in §5)

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20+ |
| Framework | Express 4 |
| Database | SQLite via `better-sqlite3` (WAL mode) — zero external services, portable to PostgreSQL |
| Validation | Zod (shared request/response schemas) |
| Auth | JWT access token (15 min) + refresh token (7 d, httpOnly cookie), bcrypt cost ≥ 12 |
| Security | helmet, cors, `express-rate-limit` (auth: 10 req / 15 min / IP) |
| Testing | Jest + supertest |
| Process | `nodemon` in dev; single `server/` folder in this repo |

### Tooling

ESLint 9, Prettier, TypeScript strict type-check, `concurrently` for frontend + backend together.

---

## 3. Functional Requirements

### F1 — Authentication & Access Control
Register, login, logout, forgot/reset password (fills the three missing `App.tsx` pages), JWT sessions, protected routes, and role-based access (`admin` / `instructor` / `student`) enforced by Refine's access control provider.

**Acceptance criteria**
- Passwords hashed with bcrypt (cost ≥ 12); refresh tokens rotate on use and are revocable on logout.
- Unauthenticated users are redirected to `/login`; protected routes render nothing until the session resolves.
- Every mutating API endpoint rejects insufficient JWT roles with 403.
- Forgot-password issues a single-use, expiring reset token; responses never reveal whether an account exists.

### F2 — Subjects CRUD
Complete the existing list with create, edit, and delete. The list already provides name search, department filter (CS / Math / English), server-side pagination, and row display.

**Acceptance criteria**
- Create/edit forms validate: code (unique, `^[A-Z]{2,4}\d{3}$`), name (2–120 chars), department (enum), description (≤ 500 chars).
- Delete requires a confirmation dialog and cascades to dependent enrollments (FK `ON DELETE CASCADE`).
- Every mutation refetches the list; success/error toasts via sonner.

### F3 — Students
Student roster CRUD with CSV import (name, email, student number).

**Acceptance criteria**
- Email and student number are unique; import reports per-row errors without aborting the batch (partial-success summary).
- List supports search by name/email and pagination, mirroring the subjects UX.

### F4 — Enrollment
Enroll / unroll students into subjects with capacity limits.

**Acceptance criteria**
- Unique constraint on `(student_id, subject_id)` — duplicate enrollment returns 409 with a friendly toast.
- Enrolling beyond `max_seats` returns 422 with remaining-seats message.
- Subject detail lists enrolled students with one-click unroll (admin/instructor).

### F5 — Grades
Per-subject gradebook with weighted components (e.g. midterm 30 %, final 50 %, homework 20 %), letter-grade calculation, and bulk entry.

**Acceptance criteria**
- Component weights must sum to 100 (± 0.1) before a grading scheme can be saved.
- Bulk entry saves the whole table in one request; invalid cells highlighted inline.
- Letter scale configurable per subject (default 90/80/70/60); students see their computed final grade read-only.

### F6 — Attendance
Session-based marking (present / absent / late) with per-student summaries.

**Acceptance criteria**
- Creating a session for subject+date snapshots the current roster.
- One-click mark-all-present, per-student overrides; sessions immutable after 24 h (admin override only).
- Summary shows attendance rate (%) per student and per subject.

### F7 — Dashboard
Stat cards (subjects, students, enrollment rate, attendance rate) plus Recharts trends (enrollment over time, grade distribution, attendance over time), with role-aware widgets.

**Acceptance criteria**
- Metrics delivered by `/api/dashboard/stats` and `/api/dashboard/trends`; stat cards painted < 1.5 s.
- Charts responsive and themed (light/dark); skeleton loaders while loading.

### F8 — Global UX
⌘K command palette (kbar), breadcrumb navigation, toasts, theme toggle, collapsible responsive sidebar, and empty/error states with clear calls to action.

**Acceptance criteria**
- Command palette lists navigation + top actions and is fully keyboard-operable.
- Usable at 360 px width; sidebar collapses to icons/drawer.
- Visible focus states on every interactive element.

### F9 — Notice Board
A board for announcements, scoped either globally or to a single subject (classroom). Instructors and admins publish; every signed-in role reads; admins moderate through a dedicated management view.

**Acceptance criteria**
- Create notice is available to **admin + instructor** (students are read-only): title (3–120 chars), body (≤ 2000 chars), optional subject scope, optional pin flag.
- Board route `/notices` sorts pinned first, then newest; supports full-text search (`q`) and subject filter with server-side pagination (json-server contract).
- Admin management route `/notices/manage` lists all notices with inline edit and delete; delete requires a confirmation dialog, then refetch + sonner toast.
- A non-admin mutating request returns 403 with a friendly error toast; the board's empty state shows a CTA (“No notices yet — post the first one”).
- Notice lists render identically for all roles; only the create/edit/delete affordances differ by role (access control provider).

### F10 — Study Material Management
A file library per classroom (**classrooms are modeled as `subjects`**): upload, list, edit, and delete materials organized by subject for one-click access.

**Acceptance criteria**
- Subject detail gains a **Materials** tab: file picker + drag-and-drop upload, list grouped under the subject heading, search by title, and type filter chips (All / PDF / DOCX / Excel / PPT / Video / Image / Text).
- Supported types are inferred from extension and stored as one of 7 types: `.pdf` → pdf; `.doc/.docx` → docx; `.xls/.xlsx` → xlsx; `.ppt/.pptx` → pptx; `.mp4/.webm/.mov` → video; `.png/.jpg/.jpeg` → image; `.txt/.md` → text.
- Validation is never silent: unsupported extension → 415 error toast; file > 50 MB → 413 error toast; server re-checks extension + MIME (frontend checks are UX only).
- Upload records title, description, subject, detected type, and file size. **Edit changes metadata only** (the stored file is untouched); **delete removes the row and its stored file**, behind a confirmation dialog + toast.
- Permissions: admin + instructor may upload/edit/delete; students and instructors may list, preview, and download.
- Materials are reachable in one click (dashboard → subject → Materials); list is paginated; empty state has an upload CTA.

### F11 — Suggestions (pre-exam study guidance)
A **Suggestions tab inside each subject's study-material area** (chosen over a separate top-level section) where the admin posts guidance before exams, linking students to the right materials.

**Acceptance criteria**
- Admin creates a suggestion: title (3–120 chars), body (≤ 2000 chars), target subject, optional exam date, optional multi-select of materials from that subject's library.
- Suggestions render above the material list, sorted by nearest upcoming exam date first, then newest; filters for subject and “upcoming only”; expired suggestions collapse under a “Past exams” divider.
- Linked materials click through to that subject's Materials tab; students and instructors are read-only (mutations → 403).
- Admin edit/delete follows the F9/F10 pattern: confirmation dialog, refetch, sonner toast.

---

## 4. Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| Performance | API p95 < 200 ms; first contentful paint < 1.5 s; all list queries paginated (never full-table); route-level code splitting |
| Security | bcrypt ≥ 12; JWT expiry + refresh rotation; httpOnly cookies; helmet; rate-limited auth; Zod-validated request bodies; parameterized SQL only |
| Accessibility | WCAG 2.1 AA — keyboard navigation, ARIA labels, visible focus, contrast ≥ 4.5:1 |
| Responsive | 360 px → 1440 px, no horizontal scroll except data tables |
| Reliability | SQLite WAL mode; daily file backup; graceful error toasts; API errors return `{ statusCode, message, errors? }` |
| Uploads | Allowlisted extensions only (pdf/docx/xlsx/pptx/video/image/text), 50 MB cap, server-side MIME check; files stored in `server/uploads/` and served only through an authenticated download endpoint |
| Testing | Unit (Zod schemas, grade math), API (supertest), component (Vitest + React Testing Library) |
| Quality gates | ESLint + Prettier + `tsc --noEmit` pass in CI before merge |
| Internationalization | ISO 8601 dates; consistent error codes; design ready for future i18n (no hard-coded user-facing strings) |

---

## 5. Backend Design

### 5.1 Architecture

```
server/
├── src/
│   ├── app.js              # Express app (middleware, routes)
│   ├── db.js               # better-sqlite3 connection + migrations
│   ├── middleware/         # auth (JWT), roles, validate (Zod), errors
│   ├── routes/             # auth, subjects, students, enrollments, grades, attendance, notices, materials, suggestions, dashboard
│   ├── services/           # business rules (capacity, weights, attendance rate)
│   └── repositories/       # parameterized SQL access
├── uploads/                # material files (F10); removed with their DB row
├── tests/                  # Jest + supertest
└── package.json
```

Layering: **routes → services → repositories**. All SQL parameterized; request bodies Zod-validated; errors funneled to one handler returning `{ statusCode, message, errors? }`.

### 5.2 Data model (SQLite)

```sql
users           (id PK, name, email UNIQUE, password_hash, role CHECK(role IN ('admin','instructor','student')),
                 reset_token, reset_token_exp, created_at)
subjects        (id PK, code UNIQUE, name, department, description, max_seats DEFAULT 30,
                 instructor_id FK→users, weights_json, created_at)
students        (id PK, name, email UNIQUE, student_number UNIQUE, user_id FK→users NULL, created_at)
enrollments     (id PK, student_id FK→students, subject_id FK→subjects, enrolled_at,
                 UNIQUE(student_id, subject_id))
grades          (id PK, enrollment_id FK→enrollments, component, score REAL, graded_by FK→users, created_at)
attendance_sessions (id PK, subject_id FK→subjects, date, created_by FK→users, UNIQUE(subject_id, date))
attendance_records  (id PK, session_id FK→attendance_sessions, student_id FK→students,
                 status CHECK(status IN ('present','absent','late')), UNIQUE(session_id, student_id))
notices         (id PK, title, body, subject_id FK→subjects NULL, pinned INTEGER DEFAULT 0,
                 created_by FK→users, created_at, updated_at)
study_materials (id PK, subject_id FK→subjects, title, description,
                 file_name, file_type CHECK(file_type IN ('pdf','docx','xlsx','pptx','video','image','text')),
                 file_size INTEGER, file_url, uploaded_by FK→users, created_at, updated_at)
suggestions     (id PK, subject_id FK→subjects, title, body, exam_at NULL,
                 created_by FK→users, created_at, updated_at)
suggestion_materials (suggestion_id FK→suggestions, material_id FK→study_materials,
                 PRIMARY KEY (suggestion_id, material_id))
```

Indexes: `subjects(department)`, `enrollments(subject_id)`, `enrollments(student_id)`, `grades(enrollment_id)`, `attendance_records(session_id)`, `notices(created_at)`, `notices(subject_id)`, `study_materials(subject_id)`, `study_materials(file_type)`, `suggestions(subject_id)`, `suggestions(exam_at)`.
Schema policy: enrollments/attendance/notices/materials/suggestions cascade on subject deletion (`suggestion_materials` cascades with its suggestion); users referenced by grades/sessions/notices are archived, not deleted; deleting a material also unlinks it from suggestions and removes its file from `server/uploads/`. All SQL parameterized.

### 5.3 REST API

Base URL: `/api`. Auth: `Authorization: Bearer <access token>` except auth routes. List endpoints share the **json-server-style contract expected by `@refinedev/simple-rest`**: `_start`, `_end`, `_sort`/`_order` (comma-separated), filters `field=value` (eq), `field_ne`, `field_gte`, `field_lte`, `field_like` (contains), full-text `q`; response `{ data, total }`.

| Method | Path | Role | Purpose |
|--------|------|------|---------|
| POST | `/api/auth/register` | public | Create account |
| POST | `/api/auth/login` | public | Get access + refresh tokens |
| POST | `/api/auth/refresh` | cookie | Rotate refresh token, new access token |
| POST | `/api/auth/logout` | any | Revoke refresh token |
| POST | `/api/auth/forgot-password` | public | Issue single-use reset token |
| POST | `/api/auth/reset-password` | public | Consume token, set new password |
| GET | `/api/auth/me` | any | Current user profile + role |
| GET | `/api/subjects` | any | List (search/filter/sort/paginate) |
| GET | `/api/subjects/:id` | any | Detail + enrolled students |
| POST | `/api/subjects` | admin | Create |
| PATCH | `/api/subjects/:id` | admin | Update |
| DELETE | `/api/subjects/:id` | admin | Delete (cascade enrollments) |
| GET | `/api/students` | admin, instructor | List |
| GET | `/api/students/:id` | admin, instructor | Detail + enrollment/grades/attendance |
| POST | `/api/students` | admin | Create |
| PATCH | `/api/students/:id` | admin | Update |
| DELETE | `/api/students/:id` | admin | Delete |
| POST | `/api/students/import` | admin | CSV import (partial success) |
| GET | `/api/enrollments` | any | List (filter `subject_id`, `student_id`) |
| POST | `/api/enrollments` | admin, instructor | Enroll (409 duplicate, 422 capacity) |
| DELETE | `/api/enrollments/:id` | admin, instructor | Unroll |
| GET | `/api/grades` | any | List (filter `enrollment_id`, `subject_id`) |
| POST | `/api/grades` | instructor | Single grade |
| POST | `/api/grades/bulk` | instructor | Bulk gradebook save |
| PATCH | `/api/grades/:id` | instructor | Amend grade |
| GET | `/api/attendance/sessions` | any | List (filter `subject_id`, `date`) |
| POST | `/api/attendance/sessions` | instructor | Create session + roster snapshot |
| POST | `/api/attendance/sessions/:id/records` | instructor | Mark students |
| GET | `/api/attendance/summary` | any | Rates per student/subject |
| GET | `/api/notices` | any | List (`q`, `subject_id`, `pinned`) — json-server contract |
| POST | `/api/notices` | admin, instructor | Create notice |
| PATCH | `/api/notices/:id` | admin | Update |
| DELETE | `/api/notices/:id` | admin | Delete (management view) |
| GET | `/api/subjects/:id/materials` | any | List (`file_type`, `q`) |
| POST | `/api/subjects/:id/materials` | admin, instructor | Multipart upload (415 bad type, 413 too large) |
| PATCH | `/api/materials/:id` | admin, instructor | Edit metadata only |
| DELETE | `/api/materials/:id` | admin, instructor | Delete row + stored file, unlink from suggestions |
| GET | `/api/materials/:id/download` | any | Stream file (authenticated) |
| GET | `/api/suggestions` | any | List (`subject_id`, `upcoming`) |
| POST | `/api/suggestions` | admin | Create (before exams) |
| PATCH | `/api/suggestions/:id` | admin | Update |
| DELETE | `/api/suggestions/:id` | admin | Delete |
| GET | `/api/dashboard/stats` | any | Stat cards |
| GET | `/api/dashboard/trends` | any | Chart series |

### 5.4 Mock data & seed strategy (F9–F11)

Hybrid seeding — **hand-authored metadata + real public sample files** — used by the frontend mock provider now and by `server/seed.js` in Phase 1, so both start from identical data.

- **Metadata** lives in `src/mocks/notices.ts`, `src/mocks/materials.ts`, `src/mocks/suggestions.ts`: realistic content tied to the existing 12 subjects and the CS / Math / English departments (e.g. “Midterm review session — CS301”, `lecture-07-graphs.pptx`, “Review chapters 3–4 before the final”), following the seed pattern in `src/mocks/subjects.ts`. In-memory: changes persist across in-app navigation and reset on a full page reload (consistent with the current provider).
- **File URLs** point at real, stable public sample files so Preview/Download genuinely works. All URLs verified reachable (HTTP 200/206) on 2026-10-06:

| Type | Sample source | License / attribution |
|------|---------------|------------------------|
| pdf | `https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf` | W3C test asset — free to use |
| docx | `https://filesamples.com/samples/document/docx/sample1.docx` | Sample files for testing (filesamples.com terms) |
| xlsx | `https://filesamples.com/samples/document/xlsx/sample1.xlsx` | Sample files for testing (filesamples.com terms) |
| pptx | `https://raw.githubusercontent.com/apache/poi/trunk/poi-examples/src/main/java/org/apache/poi/examples/xslf/pie-chart-template.pptx` | Apache-2.0 — Apache POI examples |
| video | `https://mdn.github.io/shared-assets/videos/flower.mp4` | CC0 — MDN shared assets |
| image | `https://mdn.github.io/shared-assets/images/diagrams/http/messages/http-1-connection.png` | CC0 — MDN shared assets |
| text | `https://www.gutenberg.org/files/1342/1342-0.txt` | Public domain — Project Gutenberg |

- The license/attribution strings ship with the seeds in `src/mocks/sample-files.ts` (header comment + `license` field) and are shown in the material file-info row where required — nothing is scraped from third-party sites at runtime.
- Seed volume: ~8 notices (2 pinned), ~30 materials spread across all 12 subjects covering all 7 types, ~6 suggestions with near/far/past exam dates so every list state (upcoming, past divider, empty subject) is exercised.

### 5.5 Switch-over plan

1. Build Express API in `server/` with `npm run server`; seed script recreates the 12 mock subjects.
2. Point `@refinedev/simple-rest` at `VITE_API_URL` (already in `.env`) in `src/App.tsx`.
3. Keep mock provider as fallback via `VITE_USE_MOCKS=true` so the UI runs with zero backend.
4. Remove mock-only code once API integration tests pass.

---

## 6. Frontend Design Direction — modern &amp; attractive

- **Design tokens**: semantic CSS variables (shadcn) — consistent brand palette; light + dark via `next-themes`, choice persisted.
- **Typography**: single geometric sans (Inter / Geist), clear scale (12/14/16/20/24/30); tabular numerals for grades, scores, attendance rates.
- **Surfaces**: card dashboard with subtle borders, soft shadows, hover lift; frosted-glass sticky header (`backdrop-blur`); 8 px spacing grid.
- **Motion**: `tw-animate-css` transitions (150–200 ms), optimistic mutations with toasts, skeleton loaders on every async view, animated count-up stat cards.
- **Layout**: collapsible sidebar (icons at narrow widths), sticky table headers, horizontally scrollable tables as fallback (fixes current Code/Department clipping).
- **Empty/error states**: illustrated, with a primary CTA.
- **Accessibility-first polish**: visible focus rings, `prefers-reduced-motion` respected, contrast-checked palette.

---

## 7. Delivery Roadmap

| Phase | Scope | Outcome |
|-------|-------|---------|
| **0 — Cleanup** | Fix 3 missing `App.tsx` page imports; fix `Badge` import in `list.tsx` (lucide → shadcn); `String` → `string` in `src/types/index.ts` | `tsc --noEmit` green; Code/Department render as text badges |
| **1 — Backend core** | Express + SQLite schema + subjects/students endpoints + seeds; data provider switch (mock behind env flag) | Real data flows to the subjects list |
| **2 — Auth** | JWT flows, 3 auth pages, protected routes, roles | Login → role-aware app |
| **3 — Subjects CRUD + Students/Enrollment** | Create/edit/delete forms, roster, CSV import, capacity rules | F2–F4 complete |
| **4 — Grades + Attendance** | Gradebook UI, bulk entry, attendance sessions + summaries | F5–F6 complete |
| **5 — Dashboard + polish** | Stat cards, Recharts trends, ⌘K palette, design-system pass | F7–F8 complete |
| **6 — Hardening** | Jest/supertest + Vitest suites, CI (lint/typecheck/test), README screenshots | Release candidate |
| **7 — Notices, materials, suggestions** | F9–F11 routes + tabs + forms, upload validation (415/413), admin management views, hybrid mock seeds (§5.4), role-gated affordances | Notice board, per-classroom material library, and pre-exam suggestions live on mocks |

---

## 8. Getting Started

### Prerequisites
Node.js 20+, npm 10+.

### Install &amp; run (frontend)

```bash
npm install
npm run dev        # Refine dev server (Vite)
npm run build      # tsc --noEmit + refine build
npm run start      # production server
```

### Backend (from Phase 1)

```bash
npm run server     # Express API on :4000  (planned script)
npm run dev:all    # frontend + backend together (planned script)
```

### Environment variables

| Variable | Where | Purpose | Default |
|----------|-------|---------|---------|
| `VITE_API_URL` | `.env` (exists) | REST API base URL for the data provider | `http://localhost:4000/api` |
| `VITE_USE_MOCKS` | `.env` (planned) | Use the in-memory mock provider | `true` until Phase 1 |
| `PORT` | `server/.env` (planned) | API port | `4000` |
| `JWT_SECRET` | `server/.env` (planned) | Access-token signing key | — (required) |
| `DATABASE_PATH` | `server/.env` (planned) | SQLite file location | `server/classroom.db` |

### Project structure

```
├── src/                  # React frontend (Refine)
│   ├── pages/            # dashboard, subjects (list/create/edit), auth pages (login/register/forgot-password)
│   ├── components/       # refine-ui (app shell) + ui (shadcn kit)
│   ├── providers/        # data provider (mock → REST) + mock auth provider, constants
│   ├── mocks/            # seed/mock data: subjects, dashboard, notices, materials, suggestions
│   └── types/            # shared TS types
├── server/               # Express + SQLite API (Phase 1)
├── index.html
└── package.json
```

### Learn more
- [Refine docs](https://refine.dev/docs) — [data providers](https://refine.dev/docs/core/providers/data-provider/#overview), [routing](https://refine.dev/docs/core/providers/router-provider/)
- [shadcn/ui](https://ui.shadcn.com) · [Tailwind CSS](https://tailwindcss.com)

---

## 9. How to Use This Application

### 9.1 Start it

```bash
npm install
npm run dev        # → http://localhost:5173  (Refine Devtools on :5001)
```

Open http://localhost:5173 — the mock auth reports an authenticated demo session, so you go straight to the dashboard. To see the auth screens, navigate to `/login`, `/register`, or `/forgot-password` directly (they are never forced on you in demo mode).

### 9.2 Sign in

1. On `/login`, enter **any** email + password (both fields are simply required) — the mock auth provider (`src/providers/auth.ts`) accepts any credentials, stores a demo session in localStorage, and greets you with a toast.
2. New here? `/register` creates an account; `/forgot-password` walks the recovery flow (mocked).
3. Sign out from the avatar menu in the header (top-right) — it clears the demo session and returns you to `/login`. (From Phase 2 this becomes real JWT auth with admin / instructor / student roles.)

### 9.3 Daily flows (working today)

| # | What you want to do | How |
|---|---------------------|-----|
| 1 | See the overview | `/` — 4 animated stat cards (subject count is live) + 4 Recharts trends |
| 2 | Find a subject | Sidebar **Subjects** → search by name, filter by department, paginate — all server-side on the mock provider |
| 3 | Create a subject | **New subject** → code must match `^[A-Z]{2,4}\d{3}$` and be unique (e.g. `CS301`), name 2–120 chars, department required, description ≤ 500 — validation is inline; a duplicate code returns a 409 toast |
| 4 | Fix or remove a subject | Row actions → **Edit** (prefilled form, same rules) or **Delete** (confirmation dialog, then toast) |
| 5 | Switch theme | Header toggle: light / dark / system — persisted across reloads |
| 6 | Jump anywhere | `⌘K` / `Ctrl+K` opens the command palette; arrow keys + Enter, fully keyboard-operable |
| 7 | Check small screens | Resize to 360 px — the sidebar collapses and nothing overflows horizontally |

### 9.4 Things to know

- **Mock data resets on reload.** Subjects, dashboard series, and (from Phase 7) notices/materials/suggestions live in memory in `src/providers/data.ts` — edits persist while you navigate the app, but a full page refresh restores the seed. Real persistence arrives with the backend (§5).
- **Auth is mock-only today**: `check()` always reports an authenticated demo session, so no route is gated; any credentials sign in, and the register form only checks that both passwords match (HTML `required`, no policy yet). Real password policy — bcrypt hashing, reset tokens, role claims — lands with F1 in Phase 2.
- **Errors are visible**: failed mutations show sonner toasts (duplicate code, 404 on a missing record) rather than failing silently.

### 9.5 Planned flows (F9–F11, Phase 7)

Once Phase 7 lands, the same walkthrough extends to:

1. **Notice board** — post an announcement (admin/instructor) at `/notices`; admins manage everything at `/notices/manage` (edit/delete with confirmation).
2. **Study materials** — open a subject → **Materials** tab → upload a PDF/DOCX/Excel/PPT/video/PNG/text file (50 MB cap), search and filter by type, edit metadata, delete.
3. **Suggestions** — admin publishes pre-exam guidance on the subject's **Suggestions** tab and links it to materials; students see them ordered by nearest exam date right above the file list.

---

**License:** MIT

*Sample mock files (§5.4) are used under the licenses listed in the §5.4 table; attribution ships with the seed data.*
