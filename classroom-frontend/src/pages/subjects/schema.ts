import { z } from "zod";
import { DEPARTMENTS } from "@/constants";

/**
 * F2 validation rules from the PRD:
 * - code: unique, `^[A-Z]{2,4}\d{3}$`
 * - name: 2–120 chars
 * - department: enum
 * - description: ≤ 500 chars
 */
const baseSubjectSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .regex(
      /^[A-Z]{2,4}\d{3}$/,
      "Use 2–4 uppercase letters followed by 3 digits (e.g. CS101)"
    ),
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(120, "Name must be 120 characters or fewer"),
  department: z.enum(DEPARTMENTS, {
    errorMap: () => ({ message: "Pick a department" }),
  }),
  description: z
    .string()
    .trim()
    .max(500, "Description must be 500 characters or fewer"),
});

export type SubjectInput = z.infer<typeof baseSubjectSchema>;

/**
 * Uniqueness of `code` is checked against the codes already in use, excluding
 * the record currently being edited (if any).
 */
export const subjectFormSchema = (
  takenCodes: string[] = [],
  ownCode?: string
): z.ZodType<SubjectInput> =>
  baseSubjectSchema.refine(
    (values) =>
      values.code === ownCode || !takenCodes.includes(values.code),
    { path: ["code"], message: "This code is already in use" }
  );

/**
 * Completion ratio (0..1) for the progressive form-fill indicator:
 * one point each for a valid code, a valid name, a department and a
 * description.
 */
export const subjectProgress = (values: Partial<SubjectInput>): number => {
  const checks = [
    /^[A-Z]{2,4}\d{3}$/.test(values.code?.trim() ?? ""),
    (values.name?.trim().length ?? 0) >= 2,
    !!values.department,
    (values.description?.trim().length ?? 0) > 0,
  ];

  return checks.filter(Boolean).length / checks.length;
};
