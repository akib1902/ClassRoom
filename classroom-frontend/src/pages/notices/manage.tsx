import { useMemo } from "react";
import { Link } from "react-router";
import { useList, usePermissions } from "@refinedev/core";
import { useTable } from "@refinedev/react-table";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Pin, Trash2 } from "lucide-react";

import { ListView } from "@/components/refine-ui/views/list-view";
import { Breadcrumb } from "@/components/refine-ui/layout/breadcrumb";
import { DataTable } from "@/components/refine-ui/data-table/data-table";
import { EditButton } from "@/components/refine-ui/buttons/edit";
import { DeleteButton } from "@/components/refine-ui/buttons/delete";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/constants";
import type { Notice, Subject } from "@/types";

const NoticesManage = () => {
  const { data: role } = usePermissions<string>({});

  const { result: subjectResult } = useList<Subject>({
    resource: "subjects",
    pagination: { pageSize: 1000 },
  });

  const subjectName = useMemo(() => {
    const map = new Map(
      subjectResult.data.map((subject) => [subject.id, subject])
    );
    return (id: number | null) =>
      id == null ? "All subjects" : (map.get(id)?.name ?? `Subject #${id}`);
  }, [subjectResult]);

  const table = useTable<Notice>({
    columns: useMemo<ColumnDef<Notice>[]>(() => [
      {
        id: "title",
        accessorKey: "title",
        size: 260,
        header: () => <p className="column-title ml-2">Title</p>,
        cell: ({ row }) => (
          <div className="flex items-center gap-2 ml-2">
            {row.original.pinned && (
              <Pin className="h-3.5 w-3.5 text-primary shrink-0" aria-label="Pinned" />
            )}
            <span className="text-foreground line-clamp-1">{row.original.title}</span>
          </div>
        ),
      },
      {
        id: "scope",
        accessorKey: "subjectId",
        size: 170,
        header: () => <p className="column-title ml-2">Scope</p>,
        cell: ({ getValue }) => (
          <Badge variant="outline">{subjectName((getValue() as number | null) ?? null)}</Badge>
        ),
      },
      {
        id: "createdBy",
        accessorKey: "createdBy",
        size: 130,
        header: () => <p className="column-title ml-2">Author</p>,
        cell: ({ getValue }) => <span className="ml-2">{getValue<string>()}</span>,
      },
      {
        id: "updatedAt",
        accessorKey: "updatedAt",
        size: 140,
        header: () => <p className="column-title ml-2">Updated</p>,
        cell: ({ getValue }) => (
          <span className="ml-2 tabular-nums">{formatDate(getValue<string>())}</span>
        ),
      },
      {
        id: "actions",
        size: 90,
        enableColumnFilter: false,
        enableSorting: false,
        header: () => <p className="column-title ml-2">Actions</p>,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <EditButton
              resource="notices"
              recordItemId={row.original.id}
              size="icon"
              variant="ghost"
              title="Edit notice"
            >
              <Pencil className="h-4 w-4" />
            </EditButton>
            <DeleteButton
              resource="notices"
              recordItemId={row.original.id}
              size="icon"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              title="Delete notice"
            >
              <Trash2 className="h-4 w-4" />
            </DeleteButton>
          </div>
        ),
      },
    ], [subjectName]),
    refineCoreProps: {
      resource: "notices",
      pagination: { pageSize: 10, mode: "server" },
      filters: { permanent: [] },
      sorters: {},
    },
  });

  if (role !== undefined && role !== "admin") {
    return (
      <ListView>
        <Breadcrumb />
        <h1>Manage notices</h1>
        <div className="rounded-md border bg-card p-10 text-center flex flex-col items-center gap-3">
          <p className="font-semibold">Admins only</p>
          <p className="text-sm text-muted-foreground max-w-md">
            Editing and deleting notices is limited to administrators. You can
            still read and create notices from the board.
          </p>
          <Button variant="outline" asChild>
            <Link to="/notices">Back to the notice board</Link>
          </Button>
        </div>
      </ListView>
    );
  }

  return (
    <ListView>
      <Breadcrumb />
      <h1>Manage notices</h1>
      <div className="intro-row">
        <p>edit or remove any notice — deletes ask for confirmation</p>
      </div>
      <DataTable table={table} />
    </ListView>
  );
};

export default NoticesManage;
