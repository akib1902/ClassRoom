import type { Suggestion } from "@/types";

/**
 * F11 seed suggestions — admin-authored pre-exam guidance covering every list
 * state: far-future exams, exams within two weeks, and an expired one that
 * falls under the "Past exams" divider. `materialIds` reference seeded
 * materials from `src/mocks/materials.ts`.
 */
export const mockSuggestions: Suggestion[] = [
  {
    id: 1,
    subjectId: 4,
    title: "Midterm focus: graphs & sorting",
    body: "Prioritise BFS/DFS traversal, Dijkstra's relaxation loop, and the complexity table for the three sorting algorithms. Do the benchmark workbook before the exam — most questions mirror its structure.",
    examAt: "2026-10-20",
    materialIds: [9, 10, 11],
    createdBy: "Admin Office",
    createdAt: "2026-10-04",
    updatedAt: "2026-10-04",
  },
  {
    id: 2,
    subjectId: 3,
    title: "Essay checkpoint before midterms week",
    body: "Bring a printed draft of your argumentative essay to the session. Re-read the citation guide — incomplete works-cited entries lose points on the midterm portfolio too.",
    examAt: "2026-10-17",
    materialIds: [7, 8],
    createdBy: "Admin Office",
    createdAt: "2026-09-30",
    updatedAt: "2026-09-30",
  },
  {
    id: 3,
    subjectId: 7,
    title: "Quiz prep — integration techniques",
    body: "Work through every technique on the formula sheet at least twice: substitution, parts, partial fractions, and improper integrals. The quiz allows one handwritten A4 sheet.",
    examAt: "2026-10-14",
    materialIds: [18, 19],
    createdBy: "Admin Office",
    createdAt: "2026-10-02",
    updatedAt: "2026-10-02",
  },
  {
    id: 4,
    subjectId: 5,
    title: "SQL final — normalization & transactions",
    body: "Expect to normalize a 3NF schema and reason about isolation levels. The practice dataset's query list is the single best revision resource — aim to solve the first 30 unaided.",
    examAt: "2026-11-03",
    materialIds: [12, 13, 14],
    createdBy: "Admin Office",
    createdAt: "2026-10-05",
    updatedAt: "2026-10-05",
  },
  {
    id: 5,
    subjectId: 1,
    title: "Final review — core concepts",
    body: "Rebuild the problem-solving loop from week 1 on a blank page: decomposition, pattern recognition, abstraction, and algorithm design. Then redo lab 01 without the starter notes.",
    examAt: "2026-11-15",
    materialIds: [1, 2],
    createdBy: "Admin Office",
    createdAt: "2026-10-01",
    updatedAt: "2026-10-01",
  },
  {
    id: 6,
    subjectId: 8,
    title: "Midterm prep — distributions",
    body: "The midterm covers normal, binomial, and Poisson distributions plus interval construction. Drill the worksheet problems marked with a star; they match the exam difficulty.",
    examAt: "2026-09-20",
    materialIds: [20, 21],
    createdBy: "Admin Office",
    createdAt: "2026-09-12",
    updatedAt: "2026-09-12",
  },
];
