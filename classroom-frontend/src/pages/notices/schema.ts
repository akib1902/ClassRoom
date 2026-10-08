import { z } from "zod";

/**
 * F9 validation rules from the PRD:
 * - title: 3–120 chars
 * - body: 1–2000 chars
 * - subject scope: optional (`"global"` or a subject id)
 * - pin flag
 */
const baseNoticeSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Title must be at least 3 characters")
    .max(120, "Title must be 120 characters or fewer"),
  body: z
    .string()
    .trim()
    .min(1, "Body is required")
    .max(2000, "Body must be 2000 characters or fewer"),
  /** Form value: "global" | "<subject id>"; the record stores number | null. */
  subjectId: z.union([z.string(), z.number(), z.null()]),
  pinned: z.boolean(),
});

export type NoticeInput = z.infer<typeof baseNoticeSchema>;

export const noticeFormSchema: z.ZodType<NoticeInput> = baseNoticeSchema;

/** `"global"` / `""` / `null` ⇒ global notice (record `subjectId: null`). */
export const toSubjectId = (
  value: NoticeInput["subjectId"]
): number | null => {
  if (value === null || value === "" || value === "global") return null;
  const id = Number(value);
  return Number.isFinite(id) ? id : null;
};

/** Completion ratio (0..1) for the progressive form-fill indicator. */
export const noticeProgress = (values: Partial<NoticeInput>): number => {
  const checks = [
    (values.title?.trim().length ?? 0) >= 3,
    (values.body?.trim().length ?? 0) >= 20,
    values.subjectId !== undefined && values.subjectId !== "",
  ];

  return checks.filter(Boolean).length / checks.length;
};
