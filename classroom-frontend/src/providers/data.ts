import { API_URL } from "./constants";
import { getCurrentRole, getCurrentUserName } from "./auth";
import {
  deleteFile,
  getFile,
  isInitialized,
  loadCollection,
  markInitialized,
  putFile,
  saveCollection,
  type CollectionName,
} from "./local-db";
import { detectFileType, MAX_UPLOAD_BYTES } from "@/constants";
import { mockSubjects } from "@/mocks/subjects";
import { mockNotices } from "@/mocks/notices";
import { mockMaterials } from "@/mocks/materials";
import { mockSuggestions } from "@/mocks/suggestions";
import type { Notice, Subject, StudyMaterial, Suggestion } from "@/types";
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
 * In-memory mock provider (README §5.4 — fallback until the Express API in
 * `server/` lands). It mimics the json-server-style contract that
 * `@refinedev/simple-rest` will speak, so switching over is a config change.
 *
 * Resources: `subjects`, `notices` (F9), `materials` (F10), `suggestions`
 * (F11). Mutations enforce the PRD role matrix with 403s, and subject deletes
 * cascade to notices/materials/suggestions (§5.2 schema policy).
 *
 * Persistence: records + uploaded file blobs live in IndexedDB
 * (`src/providers/local-db.ts`), so data survives full page reloads. First
 * boot seeds the DB from `src/mocks/*`; afterwards the DB is the source of
 * truth. If IndexedDB is unavailable the provider silently stays in-memory.
 */

type Row = { id: number } & Record<string, unknown>;

const clone = <T>(rows: T[]): T[] => rows.map((row) => ({ ...row }));

let subjectStore: Subject[] = clone(mockSubjects);
let noticeStore: Notice[] = clone(mockNotices);
let materialStore: StudyMaterial[] = clone(mockMaterials);
let suggestionStore: Suggestion[] = clone(mockSuggestions);

/* ------------------------- local DB hydration -------------------------- */

const persist = async (name: CollectionName): Promise<void> => {
  const rows = rowsOf(name);
  if (rows) await saveCollection(name, rows);
};

const persistAll = async (): Promise<void> => {
  await Promise.all(COLLECTION_NAMES.map((name) => persist(name)));
};

let hydration: Promise<void> | null = null;

/**
 * Loads persisted rows once per page load. First run seeds the DB; later
 * runs replace the in-memory stores. Dead `blob:` URLs from a previous
 * session are rebuilt from the stored file blobs.
 */
const hydrate = (): Promise<void> => {
  hydration ??= (async () => {
    try {
      const initialized = await isInitialized();

      if (initialized) {
        const [subjects, notices, materials, suggestions] = await Promise.all([
          loadCollection<Subject>("subjects"),
          loadCollection<Notice>("notices"),
          loadCollection<StudyMaterial>("materials"),
          loadCollection<Suggestion>("suggestions"),
        ]);

        if (subjects) subjectStore = subjects;
        if (notices) noticeStore = notices;
        if (materials) materialStore = materials;
        if (suggestions) suggestionStore = suggestions;
      } else {
        await persistAll();
        await markInitialized();
      }

      // blob: URLs die with their session — regenerate from stored blobs.
      await Promise.all(
        materialStore.map(async (material) => {
          if (!material.fileUrl.startsWith("blob:")) return;
          const blob = await getFile(material.id);
          if (blob) material.fileUrl = URL.createObjectURL(blob);
        })
      );
    } catch {
      // IndexedDB unavailable/corrupt — keep the in-memory seeds.
    }
  })();

  return hydration;
};

const COLLECTION_NAMES: CollectionName[] = [
  "subjects",
  "notices",
  "materials",
  "suggestions",
];

const httpError = (
  statusCode: number,
  message: string,
  errors?: Record<string, string>
): HttpError => ({ statusCode, message, errors });

const notFound = (resource: string) =>
  httpError(404, `No ${resource.replace(/s$/, "")} found for the given id.`);

const unsupported = (resource: string) =>
  httpError(404, `Resource "${resource}" is not available yet.`);

const rowsOf = (resource: string): Row[] | null => {
  switch (resource) {
    case "subjects":
      return subjectStore as unknown as Row[];
    case "notices":
      return noticeStore as unknown as Row[];
    case "materials":
      return materialStore as unknown as Row[];
    case "suggestions":
      return suggestionStore as unknown as Row[];
    default:
      return null;
  }
};

/** PRD F9–F11 role matrix — insufficient role ⇒ 403. */
const requireRole = (allowed: string[], action: string): void => {
  const role = getCurrentRole();
  if (!allowed.includes(role)) {
    throw httpError(403, `Your role (${role}) is not allowed to ${action}.`);
  }
};

const nextId = (rows: Row[]): number =>
  Math.max(0, ...rows.map((row) => row.id)) + 1;

const nowISO = (): string => new Date().toISOString();

const cleanText = (value: unknown): string => String(value ?? "").trim();

const checkLength = (
  value: unknown,
  field: string,
  min: number,
  max: number
): string => {
  const text = cleanText(value);
  if (text.length < min || text.length > max) {
    const message = `${field} must be ${min}–${max} characters.`;
    throw httpError(422, message, { [field.toLowerCase()]: message });
  }
  return text;
};

/** Normalizes null/undefined so `subjectId=null` filters match globals. */
const normalize = (value: unknown): string =>
  value === null || value === undefined ? "null" : String(value);

const matchesFilter = (row: Row, filter: CrudFilter): boolean => {
  if (!("field" in filter)) return true;

  // json-server-style full-text search across every field.
  if (filter.field === "q") {
    const needle = cleanText(filter.value).toLowerCase();
    if (!needle) return true;
    return Object.values(row).some((value) =>
      String(value ?? "").toLowerCase().includes(needle)
    );
  }

  const cell = row[filter.field];

  switch (filter.operator) {
    case "eq":
      return normalize(cell) === normalize(filter.value);
    case "ne":
      return normalize(cell) !== normalize(filter.value);
    case "contains":
      return String(cell ?? "")
        .toLowerCase()
        .includes(cleanText(filter.value).toLowerCase());
    case "startswith":
      return String(cell ?? "")
        .toLowerCase()
        .startsWith(cleanText(filter.value).toLowerCase());
    default:
      return true;
  }
};

const applySorters = (rows: Row[], sorters: CrudSort[] = []): Row[] => {
  if (sorters.length === 0) return rows;

  return [...rows].sort((a, b) => {
    for (const sorter of sorters) {
      const left = a[sorter.field];
      const right = b[sorter.field];

      if (left === right) continue;

      const comparison =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left ?? "").localeCompare(String(right ?? ""));

      return sorter.order === "desc" ? -comparison : comparison;
    }
    return 0;
  });
};

const findById = <T extends { id: number }>(
  store: T[],
  id: unknown
): { index: number; existing: T } => {
  const index = store.findIndex((row) => String(row.id) === String(id));
  return { index, existing: index === -1 ? (undefined as unknown as T) : store[index] };
};

export const dataProvider: DataProvider = {
  getList: async <TData extends BaseRecord = BaseRecord>({
    resource,
    filters = [],
    sorters = [],
    pagination,
  }: GetListParams): Promise<GetListResponse<TData>> => {
    await hydrate();
    const rows = rowsOf(resource);
    if (!rows) return { data: [] as TData[], total: 0 };

    const filtered = rows.filter((row) =>
      filters.every((filter) => matchesFilter(row, filter))
    );
    const sorted = applySorters(filtered, sorters);

    const total = sorted.length;
    const current = pagination?.currentPage ?? 1;
    const pageSize = pagination?.pageSize ?? total;
    const paged = sorted.slice((current - 1) * pageSize, current * pageSize);

    return { data: paged as unknown as TData[], total };
  },

  getOne: async <TData extends BaseRecord = BaseRecord>({
    resource,
    id,
  }: GetOneParams): Promise<{ data: TData }> => {
    await hydrate();
    const rows = rowsOf(resource);
    if (!rows) throw unsupported(resource);

    const existing = rows.find((row) => String(row.id) === String(id));
    if (!existing) throw notFound(resource);

    return { data: { ...existing } as unknown as TData };
  },

  create: async <TData extends BaseRecord = BaseRecord, TVariables = object>({
    resource,
    variables,
  }: CreateParams<TVariables>): Promise<{ data: TData }> => {
    await hydrate();
    const timestamp = nowISO();

    switch (resource) {
      case "subjects": {
        requireRole(["admin"], "create subjects");

        const input = variables as Partial<Subject>;

        if (subjectStore.some((row) => row.code === input.code)) {
          throw httpError(409, "A subject with this code already exists.", {
            code: "This code is already in use.",
          });
        }

        const subject: Subject = {
          id: nextId(subjectStore as unknown as Row[]),
          code: input.code ?? "",
          name: input.name ?? "",
          department: input.department ?? "CS",
          description: input.description ?? "",
          createdAt: timestamp.slice(0, 10),
        };

        subjectStore = [subject, ...subjectStore];
        await persist("subjects");
        return { data: { ...subject } as unknown as TData };
      }

      case "notices": {
        requireRole(["admin", "instructor"], "create notices");

        const input = variables as Partial<Notice>;
        const notice: Notice = {
          id: nextId(noticeStore as unknown as Row[]),
          title: checkLength(input.title, "Title", 3, 120),
          body: checkLength(input.body, "Body", 1, 2000),
          subjectId: input.subjectId ?? null,
          pinned: Boolean(input.pinned),
          createdBy: getCurrentUserName(),
          createdAt: timestamp,
          updatedAt: timestamp,
        };

        noticeStore = [notice, ...noticeStore];
        await persist("notices");
        return { data: { ...notice } as unknown as TData };
      }

      case "materials": {
        requireRole(["admin", "instructor"], "upload materials");

        // `file` is the raw upload (not part of StudyMaterial) — stored in
        // IndexedDB so the download link survives reloads.
        const input = variables as Partial<StudyMaterial> & { file?: File };
        const file = input.file instanceof File ? input.file : undefined;
        const fileName = cleanText(input.fileName);
        const fileType = detectFileType(fileName);

        if (!fileType) {
          throw httpError(
            415,
            `Unsupported file type for "${fileName}". Allowed: PDF, DOCX, XLSX, PPTX, video, PNG/JPG, TXT/MD.`
          );
        }

        const fileSize = Number(input.fileSize ?? 0);
        if (fileSize > MAX_UPLOAD_BYTES) {
          throw httpError(413, "File is too large — the limit is 50 MB.");
        }

        const subjectId = Number(input.subjectId);
        if (!subjectStore.some((row) => row.id === subjectId)) {
          throw httpError(422, "Pick a valid subject for this material.");
        }

        const material: StudyMaterial = {
          id: nextId(materialStore as unknown as Row[]),
          subjectId,
          title: checkLength(input.title, "Title", 2, 120),
          description: cleanText(input.description).slice(0, 500),
          fileName,
          fileType,
          fileSize,
          fileUrl: cleanText(input.fileUrl),
          license: input.license ?? null,
          uploadedBy: getCurrentUserName(),
          createdAt: timestamp,
          updatedAt: timestamp,
        };

        materialStore = [material, ...materialStore];
        await Promise.all([
          persist("materials"),
          file ? putFile(material.id, file) : Promise.resolve(),
        ]);
        return { data: { ...material } as unknown as TData };
      }

      case "suggestions": {
        requireRole(["admin"], "create suggestions");

        const input = variables as Partial<Suggestion>;
        const subjectId = Number(input.subjectId);
        if (!subjectStore.some((row) => row.id === subjectId)) {
          throw httpError(422, "Pick a valid subject for this suggestion.");
        }

        const suggestion: Suggestion = {
          id: nextId(suggestionStore as unknown as Row[]),
          subjectId,
          title: checkLength(input.title, "Title", 3, 120),
          body: checkLength(input.body, "Body", 1, 2000),
          examAt: input.examAt ? cleanText(input.examAt) : null,
          materialIds: (input.materialIds ?? [])
            .map(Number)
            .filter((materialId) =>
              materialStore.some(
                (row) => row.id === materialId && row.subjectId === subjectId
              )
            ),
          createdBy: getCurrentUserName(),
          createdAt: timestamp,
          updatedAt: timestamp,
        };

        suggestionStore = [suggestion, ...suggestionStore];
        await persist("suggestions");
        return { data: { ...suggestion } as unknown as TData };
      }

      default:
        throw unsupported(resource);
    }
  },

  update: async <TData extends BaseRecord = BaseRecord, TVariables = object>({
    resource,
    id,
    variables,
  }: UpdateParams<TVariables>): Promise<{ data: TData }> => {
    await hydrate();
    const timestamp = nowISO();

    switch (resource) {
      case "subjects": {
        requireRole(["admin"], "edit subjects");

        const { index, existing } = findById(subjectStore, id);
        if (index === -1) throw notFound(resource);

        const input = variables as Partial<Subject>;

        if (
          input.code &&
          subjectStore.some((row) => String(row.id) !== String(id) && row.code === input.code)
        ) {
          throw httpError(409, "A subject with this code already exists.", {
            code: "This code is already in use.",
          });
        }

        const updated: Subject = { ...existing, ...input, id: existing.id };
        subjectStore = subjectStore.map((row, rowIndex) =>
          rowIndex === index ? updated : row
        );
        await persist("subjects");
        return { data: { ...updated } as unknown as TData };
      }

      case "notices": {
        requireRole(["admin"], "edit notices");

        const { index, existing } = findById(noticeStore, id);
        if (index === -1) throw notFound(resource);

        const input = variables as Partial<Notice>;
        const updated: Notice = { ...existing };

        if ("title" in input) updated.title = checkLength(input.title, "Title", 3, 120);
        if ("body" in input) updated.body = checkLength(input.body, "Body", 1, 2000);
        if ("subjectId" in input) updated.subjectId = input.subjectId ?? null;
        if ("pinned" in input) updated.pinned = Boolean(input.pinned);
        updated.updatedAt = timestamp;

        noticeStore = noticeStore.map((row, rowIndex) =>
          rowIndex === index ? updated : row
        );
        await persist("notices");
        return { data: { ...updated } as unknown as TData };
      }

      case "materials": {
        requireRole(["admin", "instructor"], "edit materials");

        const { index, existing } = findById(materialStore, id);
        if (index === -1) throw notFound(resource);

        const input = variables as Partial<StudyMaterial>;
        const updated: StudyMaterial = { ...existing };

        // Metadata only — the stored file itself is never touched (F10).
        if ("title" in input) updated.title = checkLength(input.title, "Title", 2, 120);
        if ("description" in input) updated.description = cleanText(input.description).slice(0, 500);
        if ("subjectId" in input) {
          const subjectId = Number(input.subjectId);
          if (!subjectStore.some((row) => row.id === subjectId)) {
            throw httpError(422, "Pick a valid subject for this material.");
          }
          updated.subjectId = subjectId;
        }
        updated.updatedAt = timestamp;

        materialStore = materialStore.map((row, rowIndex) =>
          rowIndex === index ? updated : row
        );
        await persist("materials");
        return { data: { ...updated } as unknown as TData };
      }

      case "suggestions": {
        requireRole(["admin"], "edit suggestions");

        const { index, existing } = findById(suggestionStore, id);
        if (index === -1) throw notFound(resource);

        const input = variables as Partial<Suggestion>;
        const updated: Suggestion = { ...existing };

        if ("title" in input) updated.title = checkLength(input.title, "Title", 3, 120);
        if ("body" in input) updated.body = checkLength(input.body, "Body", 1, 2000);
        if ("examAt" in input) updated.examAt = input.examAt ? cleanText(input.examAt) : null;
        if ("subjectId" in input) {
          const subjectId = Number(input.subjectId);
          if (!subjectStore.some((row) => row.id === subjectId)) {
            throw httpError(422, "Pick a valid subject for this suggestion.");
          }
          updated.subjectId = subjectId;
        }
        if ("materialIds" in input) {
          updated.materialIds = (input.materialIds ?? [])
            .map(Number)
            .filter((materialId) =>
              materialStore.some(
                (row) => row.id === materialId && row.subjectId === updated.subjectId
              )
            );
        }
        updated.updatedAt = timestamp;

        suggestionStore = suggestionStore.map((row, rowIndex) =>
          rowIndex === index ? updated : row
        );
        await persist("suggestions");
        return { data: { ...updated } as unknown as TData };
      }

      default:
        throw unsupported(resource);
    }
  },

  deleteOne: async <TData extends BaseRecord = BaseRecord, TVariables = object>({
    resource,
    id,
  }: DeleteOneParams<TVariables>): Promise<{ data: TData }> => {
    await hydrate();
    switch (resource) {
      case "subjects": {
        requireRole(["admin"], "delete subjects");

        const { index } = findById(subjectStore, id);
        if (index === -1) throw notFound(resource);

        const subjectId = subjectStore[index].id;
        subjectStore = subjectStore.filter((row) => row.id !== subjectId);
        // §5.2 cascade: notices, materials and suggestions follow the subject.
        const cascadedMaterials = materialStore.filter(
          (row) => row.subjectId === subjectId
        );
        noticeStore = noticeStore.filter((row) => row.subjectId !== subjectId);
        materialStore = materialStore.filter((row) => row.subjectId !== subjectId);
        suggestionStore = suggestionStore.filter((row) => row.subjectId !== subjectId);
        await Promise.all([
          persistAll(),
          ...cascadedMaterials.map((row) => deleteFile(row.id)),
        ]);
        break;
      }

      case "notices": {
        requireRole(["admin"], "delete notices");
        const { index } = findById(noticeStore, id);
        if (index === -1) throw notFound(resource);
        noticeStore = noticeStore.filter((row) => row.id !== noticeStore[index].id);
        await persist("notices");
        break;
      }

      case "materials": {
        requireRole(["admin", "instructor"], "delete materials");
        const { index } = findById(materialStore, id);
        if (index === -1) throw notFound(resource);
        const materialId = materialStore[index].id;
        materialStore = materialStore.filter((row) => row.id !== materialId);
        // Unlink from any suggestion that pointed at this material.
        suggestionStore = suggestionStore.map((row) => ({
          ...row,
          materialIds: row.materialIds.filter((materialId2) => materialId2 !== materialId),
        }));
        await Promise.all([persist("materials"), persist("suggestions"), deleteFile(materialId)]);
        break;
      }

      case "suggestions": {
        requireRole(["admin"], "delete suggestions");
        const { index } = findById(suggestionStore, id);
        if (index === -1) throw notFound(resource);
        suggestionStore = suggestionStore.filter((row) => row.id !== suggestionStore[index].id);
        await persist("suggestions");
        break;
      }

      default:
        throw unsupported(resource);
    }

    return { data: { id } as unknown as TData };
  },

  getApiUrl: () => API_URL,
};
