import type { Department } from "@/constants";

export type Subject = {
    id: number;
    name: string;
    code: string;
    description: string;
    department: Department;
    createdAt: string;
}

/** F9 — a notice is either global (`subjectId: null`) or scoped to one subject. */
export type Notice = {
    id: number;
    title: string;
    body: string;
    subjectId: number | null;
    pinned: boolean;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
}

/** The 7 stored material types (F10) — derived from the file extension. */
export type MaterialFileType =
    | "pdf"
    | "docx"
    | "xlsx"
    | "pptx"
    | "video"
    | "image"
    | "text";

/** F10 — a study material belonging to one subject (classroom). */
export type StudyMaterial = {
    id: number;
    subjectId: number;
    title: string;
    description: string;
    fileName: string;
    fileType: MaterialFileType;
    fileSize: number;
    fileUrl: string;
    license: string | null;
    uploadedBy: string;
    createdAt: string;
    updatedAt: string;
}

/** F11 — an admin-authored pre-exam suggestion linked to materials. */
export type Suggestion = {
    id: number;
    subjectId: number;
    title: string;
    body: string;
    examAt: string | null;
    materialIds: number[];
    createdBy: string;
    createdAt: string;
    updatedAt: string;
}