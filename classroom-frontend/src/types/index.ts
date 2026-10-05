import type { Department } from "@/constants";

export type Subject = {
    id: number;
    name: string;
    code: string;
    description: string;
    department: Department;
    createdAt: string;
}