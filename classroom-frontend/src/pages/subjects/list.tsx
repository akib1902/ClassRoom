import { ListView } from "@/components/refine-ui/views/list-view.tsx";
import { Breadcrumb } from "@/components/refine-ui/layout/breadcrumb.tsx";
import { useState, useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEPARTMENTS_OPTIONS } from "@/constants";
import { CreateButton } from "@/components/refine-ui/buttons/create";
import { DataTable } from "@/components/refine-ui/data-table/data-table";
import { useTable } from "@refinedev/react-table";
import { ColumnDef } from "@tanstack/react-table";
import { Subject } from "@/types/index.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EditButton } from "@/components/refine-ui/buttons/edit";
import { DeleteButton } from "@/components/refine-ui/buttons/delete";
import { Pencil, Search, Trash2, FolderOpen } from "lucide-react";
import { Link } from "react-router";
import { usePermissions } from "@refinedev/core";

const SubjectsList = () => {
  const { data: role } = usePermissions<string>({});
  const canManage = role === "admin";
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("all"); 
  const departmentFilter = selectedDepartment === "all" ? [] : [
    {field: 'department', operator: 'eq' as const, value: selectedDepartment}
  ];
  const searchFilters = searchQuery ? [
    {field: 'name', operator: 'contains' as const, value: searchQuery}
  ] : [];

  const subjectTable = useTable<Subject>({
    columns: useMemo<ColumnDef<Subject>[]>(() => [
      {
        id: "code",
        accessorKey: "code",
        size: 100,
        header: () => <p className="column-title ml-2">Code</p>,
        cell: ({ getValue }) => (
          <Badge variant="secondary" className="font-mono">
            {getValue<string>()}
          </Badge>
        ),
      },
      {
        id: "name",
        accessorKey: "name",
        size: 200,
        header: () => <p className="column-title ml-2">Name</p>,
        cell: ({getValue}) => <span className="text-foreground">{getValue<string>()}</span>,
        filterFn: 'includesString'
      },
      {
        id: "department",
        accessorKey: "department",
        size: 150,
        header: () => <p className="column-title ml-2">Department</p>,
        cell: ({getValue}) => <Badge variant="outline">{getValue<string>()}</Badge>
      },
      {
        id: "description",
        accessorKey: "description",
        size: 300,
        header: () => <p className="column-title ml-2">Description</p>,
        cell: ({getValue}) => <span className="truncate line-clamp-2">{getValue<string>()}</span>
      },
      {
        id: "actions",
        size: 130,
        enableColumnFilter: false,
        enableSorting: false,
        header: () => <p className="column-title ml-2">Actions</p>,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              title="Materials & suggestions"
              asChild
            >
              <Link to={`/subjects/show/${row.original.id}`}>
                <FolderOpen className="h-4 w-4" />
              </Link>
            </Button>
            {canManage && (
              <>
                <EditButton
                  resource="subjects"
                  recordItemId={row.original.id}
                  size="icon"
                  variant="ghost"
                  title="Edit subject"
                >
                  <Pencil className="h-4 w-4" />
                </EditButton>
                <DeleteButton
                  resource="subjects"
                  recordItemId={row.original.id}
                  size="icon"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  title="Delete subject"
                >
                  <Trash2 className="h-4 w-4" />
                </DeleteButton>
              </>
            )}
          </div>
        ),
      }
    ], [canManage]),
    refineCoreProps: {
      resource: "subjects",
      pagination: {pageSize: 10, mode: "server"},
      filters: {
        permanent: [...departmentFilter, ...searchFilters] 
      },
      sorters: {},
      }
    }
  );
  return (
    <ListView>
      <Breadcrumb />
      <h1>Subjects List</h1>
      <div className="intro-row">
        <p>quick access to essential matrics and tools</p>
        <div className="actions-row">
          <div className="search-field">
            <Search className="search-icon" aria-hidden="true" />
            <input type="text" placeholder="Search name..." aria-label="Search subjects by name" className="pl-10 w-full" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
              <SelectTrigger>
                <SelectValue placeholder="filter by department"/>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {DEPARTMENTS_OPTIONS.map((dept) => (
                  <SelectItem key={dept.value} value={dept.value}>
                    {dept.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canManage && <CreateButton/>}
          </div>
        </div>
      </div>
      <DataTable table={subjectTable} />
    </ListView>
  );
}
export default SubjectsList;