import { API_URL } from "./constants";
import { mockSubjects } from "@/mocks/subjects";
import type { BaseRecord, CreateParams, DataProvider, GetListParams, GetListResponse, GetOneParams, UpdateParams,
DeleteOneParams } from "@refinedev/core";



export const dataProvider: DataProvider = {

  getList: async <TData extends BaseRecord = BaseRecord>({
    resource,
    filters = [],
    pagination,
  }: GetListParams): Promise<GetListResponse<TData>> => {
    if (resource === "subjects") {
      let subjects = [...mockSubjects];

      for (const filter of filters) {
        if (!("field" in filter)) continue;
        subjects = subjects.filter((subject) => {
          const cell = subject[filter.field as keyof typeof subject];
          switch (filter.operator) {
            case "eq":
              return cell === filter.value;
            case "contains":
              return String(cell).toLowerCase().includes(String(filter.value).toLowerCase());
            case "startswith":
              return String(cell).toLowerCase().startsWith(String(filter.value).toLowerCase());
            default:
              return true;
          }
        });
      }

      const total = subjects.length;
      const current = pagination?.currentPage ?? 1;
      const pageSize = pagination?.pageSize ?? total;
      const paged = subjects.slice((current - 1) * pageSize, current * pageSize);

      return { data: paged as unknown as TData[], total };
    }

    return {
      data: [] as TData[],
      total: 0,
    };
  },
  getOne: async () => {throw new Error("Method not implemented.");},
  create: async () => {throw new Error("Method not implemented.");},
  update: async () => {throw new Error("Method not implemented.");},
  deleteOne: async () => {throw new Error("Method not implemented.");},


  getApiUrl: () => '',
}