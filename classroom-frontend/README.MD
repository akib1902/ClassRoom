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

---

## 4. Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| Performance | API p95 < 200 ms; first contentful paint < 1.5 s; all list queries paginated (never full-table); route-level code splitting |
| Security | bcrypt ≥ 12; JWT expiry + refresh rotation; httpOnly cookies; helmet; rate-limited auth; Zod-validated request bodies; parameterized SQL only |
| Accessibility | WCAG 2.1 AA — keyboard navigation, ARIA labels, visible focus, contrast ≥ 4.5:1 |
| Responsive | 360 px → 1440 px, no horizontal scroll except data tables |
| Reliability | SQLite WAL mode; daily file backup; graceful error toasts; API errors return `{ statusCode, message, errors? }` |
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
│   ├── routes/             # auth, subjects, students, enrollments, grades, attendance, dashboard
│   ├── services/           # business rules (capacity, weights, attendance rate)
│   └── repositories/       # parameterized SQL access
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
```

Indexes: `subjects(department)`, `enrollments(subject_id)`, `enrollments(student_id)`, `grades(enrollment_id)`, `attendance_records(session_id)`.
Schema policy: enrollments/attendance cascade on subject deletion; users referenced by grades/sessions are archived, not deleted.

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
| GET | `/api/dashboard/stats` | any | Stat cards |
| GET | `/api/dashboard/trends` | any | Chart series |

### 5.4 Switch-over plan

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
│   ├── mocks/            # seed/mock subject + dashboard data
│   └── types/            # shared TS types
├── server/               # Express + SQLite API (Phase 1)
├── index.html
└── package.json
```

### Learn more
- [Refine docs](https://refine.dev/docs) — [data providers](https://refine.dev/docs/core/providers/data-provider/#overview), [routing](https://refine.dev/docs/core/providers/router-provider/)
- [shadcn/ui](https://ui.shadcn.com) · [Tailwind CSS](https://tailwindcss.com)

**License:** MIT
