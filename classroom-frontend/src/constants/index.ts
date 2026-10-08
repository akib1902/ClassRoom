export const DEPARTMENTS = ["CS", "Math", "English"] as const;

export type Department = (typeof DEPARTMENTS)[number];

export const DEPARTMENTS_OPTIONS = DEPARTMENTS.map((dept) => ({
  value: dept,
  label: dept,
}));

/* ------------------------------------------------------------------ */
/* F10 — study material file types                                     */
/* ------------------------------------------------------------------ */

export const FILE_TYPES = [
  "pdf",
  "docx",
  "xlsx",
  "pptx",
  "video",
  "image",
  "text",
] as const;

export type FileType = (typeof FILE_TYPES)[number];

/** Chip labels exactly as listed in PRD F10. */
export const FILE_TYPE_LABELS: Record<FileType, string> = {
  pdf: "PDF",
  docx: "DOCX",
  xlsx: "Excel",
  pptx: "PPT",
  video: "Video",
  image: "Image",
  text: "Text",
};

/** Allowlist — an extension outside this map is rejected with 415. */
export const FILE_EXTENSIONS: Record<FileType, string[]> = {
  pdf: [".pdf"],
  docx: [".doc", ".docx"],
  xlsx: [".xls", ".xlsx"],
  pptx: [".ppt", ".pptx"],
  video: [".mp4", ".webm", ".mov"],
  image: [".png", ".jpg", ".jpeg"],
  text: [".txt", ".md"],
};

export const ACCEPT_FILE = Object.values(FILE_EXTENSIONS).join(",");

/** PRD F10 / §4 — uploads above this size are rejected with 413. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Returns the stored type for a file name, or null when unsupported (415). */
export const detectFileType = (fileName: string): FileType | null => {
  const lower = fileName.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot === -1) return null;
  const ext = lower.slice(dot);
  const hit = Object.entries(FILE_EXTENSIONS).find(([, exts]) =>
    exts.includes(ext)
  );
  return hit ? (hit[0] as FileType) : null;
};

export const formatFileSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024))
  );
  const value = bytes / 1024 ** index;
  const rounded = index === 0 || value >= 10 ? Math.round(value) : value.toFixed(1);
  return `${rounded} ${units[index]}`;
};

/**
 * "Oct 20, 2026" — parses `YYYY-MM-DD` seeds as local dates so the day never
 * shifts across time zones.
 */
export const formatDate = (value: string): string => {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

/** Whole days from today until a `YYYY-MM-DD` date (negative = past). */
export const daysUntil = (value: string): number => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return 0;
  const target = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
};

/** Today as `YYYY-MM-DD` for upcoming/past comparisons (F11). */
export const todayISO = (): string => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};
