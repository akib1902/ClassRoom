import type { Notice } from "@/types";

/**
 * F9 seed notices — realistic campus announcements tied to the 12 seeded
 * subjects (2 pinned, some global, some subject-scoped). Merged into the
 * in-memory store by `src/providers/data.ts`; resets on full page reload.
 */
export const mockNotices: Notice[] = [
  {
    id: 1,
    title: "Midterm exam schedule published",
    body: "Midterm exams run October 19–24. Check your timetable in the course portal — rooms are assigned per subject and doors open 15 minutes early. Bring your student ID; no devices on desks during the sitting.",
    subjectId: null,
    pinned: true,
    createdBy: "Admin Office",
    createdAt: "2026-10-01",
    updatedAt: "2026-10-01",
  },
  {
    id: 2,
    title: "Add/drop deadline is October 10",
    body: "You can still add or drop subjects until October 10 at 23:59. After the deadline, changes require dean approval. Enrolment capacity is first-come-first-served — check the Seats column on the subjects list.",
    subjectId: null,
    pinned: true,
    createdBy: "Admin Office",
    createdAt: "2026-09-28",
    updatedAt: "2026-09-29",
  },
  {
    id: 3,
    title: "Library extended hours during finals",
    body: "The main library stays open until 02:00 from November 24 to December 12. Group study rooms can be booked in 2-hour slots; unbooked rooms are released after 10 minutes.",
    subjectId: null,
    pinned: false,
    createdBy: "Admin Office",
    createdAt: "2026-10-03",
    updatedAt: "2026-10-03",
  },
  {
    id: 4,
    title: "Campus Wi-Fi maintenance on October 12",
    body: "Network maintenance on October 12 between 01:00 and 04:00. Download any materials you need for Monday's sessions in advance — the portal will be unreachable during the window.",
    subjectId: null,
    pinned: false,
    createdBy: "IT Services",
    createdAt: "2026-10-05",
    updatedAt: "2026-10-05",
  },
  {
    id: 5,
    title: "CS101 lab rooms moved to Building B",
    body: "Starting this week, CS101 lab sessions run in Building B, room 204 instead of A-110. The Tuesday 14:00 slot is unchanged; the Thursday 10:00 slot moves by 30 minutes.",
    subjectId: 1,
    pinned: false,
    createdBy: "Prof. Demo",
    createdAt: "2026-09-30",
    updatedAt: "2026-09-30",
  },
  {
    id: 6,
    title: "CS201 assignment 2 released",
    body: "Assignment 2 (graph traversal + shortest paths) is due October 16, 23:59. The starter repository and sample test cases are in the Materials tab. Late submissions lose 10% per day.",
    subjectId: 4,
    pinned: false,
    createdBy: "Prof. Demo",
    createdAt: "2026-10-04",
    updatedAt: "2026-10-04",
  },
  {
    id: 7,
    title: "Calculus II review session recording posted",
    body: "Friday's review session covering integration by parts and partial fractions has been recorded. The recording and whiteboard notes are in the MATH105 Materials tab.",
    subjectId: 7,
    pinned: false,
    createdBy: "Prof. Demo",
    createdAt: "2026-09-25",
    updatedAt: "2026-09-25",
  },
  {
    id: 8,
    title: "ENG105 peer-review groups finalized",
    body: "Peer-review groups are posted on the course page. Read your partner's draft before Thursday's session and bring two printed copies — one for the swap, one for margin notes.",
    subjectId: 3,
    pinned: false,
    createdBy: "Prof. Demo",
    createdAt: "2026-09-22",
    updatedAt: "2026-09-22",
  },
];
