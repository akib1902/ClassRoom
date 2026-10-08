import type { StudyMaterial } from "@/types";
import { SAMPLE_FILES } from "./sample-files";

type Seed = {
  subjectId: number;
  title: string;
  description: string;
  /** index into SAMPLE_FILES — determines fileType, fileUrl and license */
  file: number;
  fileName: string;
  fileSize: number;
  createdAt: string;
};

/**
 * F10 seed materials — ~30 entries spread across all 12 subjects covering all
 * 7 supported types. Metadata is hand-authored; `fileUrl` points at a real
 * public sample file (see `sample-files.ts`) so Download serves real content.
 */
const SEEDS: Seed[] = [
  // CS101 — Introduction to Computer Science (ids 1–4)
  { subjectId: 1, title: "Course syllabus — Fall 2026", description: "Weekly topics, grading breakdown, and office hours for CS101.", file: 0, fileName: "cs101-syllabus-fall2026.pdf", fileSize: 1_240_000, createdAt: "2026-09-01" },
  { subjectId: 1, title: "Week 1 slides — computational thinking", description: "Decomposition, pattern recognition, and the problem-solving loop.", file: 3, fileName: "cs101-week01-slides.pptx", fileSize: 4_180_000, createdAt: "2026-09-03" },
  { subjectId: 1, title: "Lab 01 starter notes", description: "Setup instructions and the first exercises in plain text.", file: 6, fileName: "cs101-lab01-notes.txt", fileSize: 9_400, createdAt: "2026-09-05" },
  { subjectId: 1, title: "Program design diagram", description: "Reference flowchart for the assignment-1 design template.", file: 5, fileName: "cs101-program-design.png", fileSize: 78_000, createdAt: "2026-09-12" },
  // MATH210 — Linear Algebra (ids 5–6)
  { subjectId: 2, title: "Matrix operations cheat sheet", description: "One-page reference: transpose, inverse, rank, and elementary operations.", file: 0, fileName: "math210-cheat-sheet.pdf", fileSize: 860_000, createdAt: "2026-09-08" },
  { subjectId: 2, title: "Problem set 2 — linear systems", description: "Gaussian elimination drills with an answer-checking workbook.", file: 2, fileName: "math210-problem-set-02.xlsx", fileSize: 312_000, createdAt: "2026-09-15" },
  // ENG105 — Academic Writing (ids 7–8)
  { subjectId: 3, title: "Essay structure template", description: "Thesis, topic sentences, and paragraph scaffolding for the first essay.", file: 1, fileName: "eng105-essay-template.docx", fileSize: 64_000, createdAt: "2026-09-04" },
  { subjectId: 3, title: "Citation guide — MLA & APA", description: "Side-by-side examples of in-text citations and works-cited entries.", file: 0, fileName: "eng105-citation-guide.pdf", fileSize: 1_520_000, createdAt: "2026-09-10" },
  // CS201 — Data Structures and Algorithms (ids 9–11)
  { subjectId: 4, title: "Lecture 07 — graphs", description: "BFS, DFS, Dijkstra, and representation trade-offs (assignment 2 slides).", file: 3, fileName: "cs201-lecture07-graphs.pptx", fileSize: 5_240_000, createdAt: "2026-10-02" },
  { subjectId: 4, title: "Sorting algorithms comparison", description: "Benchmark workbook: quicksort, mergesort, heapsort on random inputs.", file: 2, fileName: "cs201-sorting-benchmarks.xlsx", fileSize: 448_000, createdAt: "2026-09-18" },
  { subjectId: 4, title: "Big-O walkthrough video", description: "10-minute worked analysis of common complexity classes.", file: 4, fileName: "cs201-bigo-walkthrough.mp4", fileSize: 2_310_000, createdAt: "2026-09-22" },
  // CS310 — Database Systems (ids 12–14)
  { subjectId: 5, title: "Normal forms reference", description: "1NF → BCNF with examples and a decision checklist.", file: 0, fileName: "cs310-normal-forms.pdf", fileSize: 1_080_000, createdAt: "2026-09-09" },
  { subjectId: 5, title: "SQL practice dataset", description: "Sample tables (customers, orders, items) with 50 practice queries.", file: 2, fileName: "cs310-sql-practice.xlsx", fileSize: 276_000, createdAt: "2026-09-16" },
  { subjectId: 5, title: "ER modeling slides", description: "Entities, relationships, cardinality, and mapping to tables.", file: 3, fileName: "cs310-er-modeling.pptx", fileSize: 3_640_000, createdAt: "2026-09-24" },
  // CS420 — Machine Learning (ids 15–17)
  { subjectId: 6, title: "Regression notebook summary", description: "Written walkthrough of the linear-regression lab notebook.", file: 1, fileName: "cs420-regression-summary.docx", fileSize: 92_000, createdAt: "2026-09-14" },
  { subjectId: 6, title: "Model evaluation diagram", description: "Confusion matrix and precision/recall trade-off illustration.", file: 5, fileName: "cs420-evaluation-diagram.png", fileSize: 142_000, createdAt: "2026-09-19" },
  { subjectId: 6, title: "Neural nets lecture recording", description: "Recorded lecture: backpropagation, activation functions, and tuning.", file: 4, fileName: "cs420-neural-nets-lecture.mp4", fileSize: 3_120_000, createdAt: "2026-09-27" },
  // MATH105 — Calculus II (ids 18–19)
  { subjectId: 7, title: "Integration techniques", description: "Substitution, parts, partial fractions, and improper integrals.", file: 0, fileName: "math105-integration-techniques.pdf", fileSize: 940_000, createdAt: "2026-09-07" },
  { subjectId: 7, title: "Formula sheet (allowed in quiz)", description: "The single sheet you may bring to the October quiz.", file: 6, fileName: "math105-formula-sheet.txt", fileSize: 6_800, createdAt: "2026-09-21" },
  // MATH320 — Probability and Statistics (ids 20–21)
  { subjectId: 8, title: "Distribution reference table", description: "Normal, binomial, Poisson, and t-distribution parameters and uses.", file: 0, fileName: "math320-distributions.pdf", fileSize: 1_160_000, createdAt: "2026-09-11" },
  { subjectId: 8, title: "Confidence intervals worksheet", description: "Practice problems with a worked solutions tab.", file: 2, fileName: "math320-confidence-intervals.xlsx", fileSize: 198_000, createdAt: "2026-09-23" },
  // MATH410 — Discrete Mathematics (ids 22–23)
  { subjectId: 9, title: "Proof writing guide", description: "Direct proof, contradiction, induction — with template paragraphs.", file: 1, fileName: "math410-proof-guide.docx", fileSize: 74_000, createdAt: "2026-09-13" },
  { subjectId: 9, title: "Graph theory diagrams", description: "Hand-drawn style figures for trees, cycles, and bipartite graphs.", file: 5, fileName: "math410-graph-theory.png", fileSize: 186_000, createdAt: "2026-09-26" },
  // ENG210 — World Literature (ids 24–25)
  { subjectId: 10, title: "Reading list — World Literature", description: "Semester reading order with page ranges and essay checkpoints.", file: 0, fileName: "eng210-reading-list.pdf", fileSize: 720_000, createdAt: "2026-09-06" },
  { subjectId: 10, title: "Comparative essay prompt", description: "Assignment 1 prompt with rubric and submission checklist.", file: 1, fileName: "eng210-comparative-prompt.docx", fileSize: 58_000, createdAt: "2026-09-20" },
  // ENG205 — Technical Communication (ids 26–27)
  { subjectId: 11, title: "Report template", description: "Headings, figure captions, and reference list styling for reports.", file: 1, fileName: "eng205-report-template.docx", fileSize: 68_000, createdAt: "2026-09-08" },
  { subjectId: 11, title: "Slides — technical proposals", description: "Structure of a 10-minute proposal talk with timing cues.", file: 3, fileName: "eng205-proposal-slides.pptx", fileSize: 2_980_000, createdAt: "2026-09-25" },
  // ENG315 — Creative Writing Workshop (ids 28–30)
  { subjectId: 12, title: "Workshop guidelines", description: "How to run a critique circle: roles, timing, and ground rules.", file: 0, fileName: "eng315-workshop-guidelines.pdf", fileSize: 640_000, createdAt: "2026-09-05" },
  { subjectId: 12, title: "Peer critique checklist", description: "What to look for when workshopping a peer's draft.", file: 6, fileName: "eng315-critique-checklist.txt", fileSize: 5_200, createdAt: "2026-09-17" },
  { subjectId: 12, title: "Author reading recording", description: "Recorded guest reading with Q&A (captions included).", file: 4, fileName: "eng315-author-reading.mp4", fileSize: 4_450_000, createdAt: "2026-10-01" },
];

export const mockMaterials: StudyMaterial[] = SEEDS.map((seed, index) => {
  const sample = SAMPLE_FILES[seed.file];
  return {
    id: index + 1,
    subjectId: seed.subjectId,
    title: seed.title,
    description: seed.description,
    fileName: seed.fileName,
    fileType: sample.type,
    fileSize: seed.fileSize,
    fileUrl: sample.url,
    license: sample.license,
    uploadedBy: "Prof. Demo",
    createdAt: seed.createdAt,
    updatedAt: seed.createdAt,
  };
});
