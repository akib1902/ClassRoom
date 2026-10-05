import { API_URL } from "./constants";
import { mockSubjects } from "@/mocks/subjects";
import type { Subject } from "@/types";
import type {
  BaseRecord,
  CreateParams,
  CrudFilter,
  CrudSort,
  DataProvider,
  DeleteOneParams,
  GetListParams,
  GetListResponse,
  GetOneParams,
  HttpError,
  UpdateParams,
} from "@refinedev/core";

/**
 * In-memory mock provider (README §5.4.3 — fallback until the Express API in
 * `server/` lands in Phase 1). It mimics the json-server-style contract that
 * `@refinedev/simple-rest` will speak, so switching over is a config change.
 */
let subjectStore: Subject[] = mockSubjects.map((subject) => ({ ...subject }));

const httpError = (
  statusCode: number,
  message: string,
  errors?: Record<string, string>
): HttpError => ({ statusCode, message, errors });

const matchesFilter = (row: Subject, filter: CrudFilter): boolean => {
  if (!("field" in filter)) return true;

  const cell = row[filter.field as keyof Subject];

  switch (filter.operator) {
    case "eq":
      return cell === filter.value;
    case "ne":
      return cell !== filter.value;
    case "contains":
      return String(cell ?? "")
        .toLowerCase()
        .includes(String(filter.value ?? "").toLowerCase());
    case "startswith":
      return String(cell ?? "")
        .toLowerCase()
        .startsWith(String(filter.value ?? "").toLowerCase());
    default:
      return true;
  }
};

const applySorters = (rows: Subject[], sorters: CrudSort[] = []): Subject[] => {
  if (sorters.length === 0) return rows;

  return [...rows].sort((a, b) => {
    for (const sorter of sorters) {
      const left = a[sorter.field as keyof Subject];
      const right = b[sorter.field as keyof Subject];

      if (left === right) continue;

      const comparison =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left).localeCompare(String(right));

      return sorter.order === "desc" ? -comparison : comparison;
    }
    return 0;
  });
};

const notFound = (resource: string) =>
  httpError(404, `No ${resource.replace(/s$/, "")} found for the given id.`);

export const dataProvider: DataProvider = {
  getList: async <TData extends BaseRecord = BaseRecord>({
    resource,
    filters = [],
    sorters = [],
    pagination,
  }: GetListParams): Promise<GetListResponse<TData>> => {
    if (resource !== "subjects") {
      return { data: [] as TData[], total: 0 };
    }

    let subjects = subjectStore.filter((subject) =>
      filters.every((filter) => matchesFilter(subject, filter))
    );
    subjects = applySorters(subjects, sorters);

    const total = subjects.length;
    const current = pagination?.currentPage ?? 1;
    const pageSize = pagination?.pageSize ?? total;
    const paged = subjects.slice((current - 1) * pageSize, current * pageSize);

    return { data: paged as unknown as TData[], total };
  },

  getOne: async <TData extends BaseRecord = BaseRecord>({
    resource,
    id,
  }: GetOneParams): Promise<{ data: TData }> => {
    if (resource !== "subjects") throw notFound(resource);

    const subject = subjectStore.find((row) => row.id === Number(id));
    if (!subject) throw notFound(resource);

    return { data: { ...subject } as unknown as TData };
  },

  create: async <TData extends BaseRecord = BaseRecord, TVariables = object>({
    resource,
    variables,
  }: CreateParams<TVariables>): Promise<{ data: TData }> => {
    if (resource !== "subjects") {
      throw httpError(404, `Resource "${resource}" is not available yet.`);
    }

    const input = variables as Partial<Subject>;

    if (subjectStore.some((row) => row.code === input.code)) {
      throw httpError(409, "A subject with this code already exists.", {
        code: "This code is already in use.",
      });
    }

    const subject: Subject = {
      id: Math.max(0, ...subjectStore.map((row) => row.id)) + 1,
      code: input.code ?? "",
      name: input.name ?? "",
      department: input.department ?? "CS",
      description: input.description ?? "",
      createdAt: new Date().toISOString().slice(0, 10),
    };

    subjectStore = [subject, ...subjectStore];

    return { data: { ...subject } as unknown as TData };
  },

  update: async <TData extends BaseRecord = BaseRecord, TVariables = object>({
    resource,
    id,
    variables,
  }: UpdateParams<TVariables>): Promise<{ data: TData }> => {
    if (resource !== "subjects") {
      throw httpError(404, `Resource "${resource}" is not available yet.`);
    }

    const index = subjectStore.findIndex((row) => row.id === Number(id));
    if (index === -1) throw notFound(resource);

    const input = variables as Partial<Subject>;

    if (
      input.code &&
      subjectStore.some((row) => row.id !== Number(id) && row.code === input.code)
    ) {
      throw httpError(409, "A subject with this code already exists.", {
        code: "This code is already in use.",
      });
    }

    const updated: Subject = { ...subjectStore[index], ...input, id: Number(id) };
    subjectStore = subjectStore.map((row, rowIndex) =>
      rowIndex === index ? updated : row
    );

    return { data: { ...updated } as unknown as TData };
  },

  deleteOne: async <TData extends BaseRecord = BaseRecord, TVariables = object>({
    resource,
    id,
  }: DeleteOneParams<TVariables>): Promise<{ data: TData }> => {
    if (resource !== "subjects") {
      throw httpError(404, `Resource "${resource}" is not available yet.`);
    }

    const existing = subjectStore.find((row) => row.id === Number(id));
    if (!existing) throw notFound(resource);

    subjectStore = subjectStore.filter((row) => row.id !== Number(id));

    return { data: { id } as unknown as TData };
  },

  getApiUrl: () => API_URL,
};
