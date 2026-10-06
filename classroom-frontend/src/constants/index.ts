export const DEPARTMENTS = ["CS", "Math", "English"] as const;

export type Department = (typeof DEPARTMENTS)[number];

export const DEPARTMENTS_OPTIONS = DEPARTMENTS.map((dept) => ({
  value: dept,
  label: dept,
}));
