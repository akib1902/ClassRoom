import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useList, usePermissions } from "@refinedev/core";
import { Pin, Search, Settings2 } from "lucide-react";

import { ListView } from "@/components/refine-ui/views/list-view";
import { Breadcrumb } from "@/components/refine-ui/layout/breadcrumb";
import { CreateButton } from "@/components/refine-ui/buttons/create";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate } from "@/constants";
import type { Notice, Subject } from "@/types";

const PAGE_SIZE = 6;

const NoticesList = () => {
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [scope, setScope] = useState("all");

  const { data: role } = usePermissions<string>({});
  const canCreate = role === "admin" || role === "instructor";
  const isAdmin = role === "admin";

  const { result: subjectResult } = useList<Subject>({
    resource: "subjects",
    pagination: { pageSize: 1000 },
  });
  const subjects = subjectResult.data;
  const subjectName = useMemo(() => {
    const map = new Map(subjects.map((subject) => [subject.id, subject]));
    return (id: number | null) =>
      id == null ? "All subjects" : (map.get(id)?.code ?? `Subject #${id}`);
  }, [subjects]);

  const scopeFilters =
    scope === "all"
      ? []
      : scope === "global"
        ? [
            {
              field: "subjectId",
              operator: "eq" as const,
              value: "null",
            },
          ]
        : [
            {
              field: "subjectId",
              operator: "eq" as const,
              value: Number(scope),
            },
          ];

  const searchFilters = searchQuery
    ? [{ field: "q", operator: "contains" as const, value: searchQuery }]
    : [];

  useEffect(() => {
    setPage(1);
  }, [searchQuery, scope]);

  const { query, result } = useList<Notice>({
    resource: "notices",
    pagination: { currentPage: page, pageSize: PAGE_SIZE },
    sorters: [
      { field: "pinned", order: "desc" },
      { field: "createdAt", order: "desc" },
    ],
    filters: [...searchFilters, ...scopeFilters],
  });

  const notices = result.data;
  const total = result.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <ListView>
      <Breadcrumb />
      <h1>Notice Board</h1>
      <div className="intro-row">
        <p>announcements for every classroom — pinned ones stay on top</p>
        <div className="actions-row">
          <div className="search-field">
            <Search className="search-icon" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search notices..."
              aria-label="Search notices"
              className="pl-10 w-full"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger>
                <SelectValue placeholder="filter by scope" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All notices</SelectItem>
                <SelectItem value="global">Global only</SelectItem>
                {subjects.map((subject) => (
                  <SelectItem key={subject.id} value={String(subject.id)}>
                    {subject.code} — {subject.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isAdmin && (
              <Button variant="outline" asChild>
                <Link to="/notices/manage">
                  <Settings2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Manage</span>
                </Link>
              </Button>
            )}
            <CreateButton hidden={!canCreate} />
          </div>
        </div>
      </div>

      {query.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-44 rounded-md" />
          ))}
        </div>
      ) : notices.length === 0 ? (
        <div className="rounded-md border bg-card p-10 text-center flex flex-col items-center gap-3">
          <p className="font-semibold">No notices yet</p>
          <p className="text-sm text-muted-foreground max-w-md">
            Announcements appear here — pinned notices stay at the top of the
            board.
          </p>
          {canCreate && <CreateButton />}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {notices.map((notice) => (
            <Card key={notice.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-snug">
                    {notice.title}
                  </CardTitle>
                  {notice.pinned && (
                    <Badge className="shrink-0 gap-1">
                      <Pin className="h-3 w-3" />
                      Pinned
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground whitespace-pre-line line-clamp-4">
                  {notice.body}
                </p>
                <div className="flex items-center justify-between gap-2 border-t pt-3">
                  <Badge variant="outline">{subjectName(notice.subjectId)}</Badge>
                  <p className="text-xs text-muted-foreground">
                    {notice.createdBy} · {formatDate(notice.createdAt)}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {total} notice{total === 1 ? "" : "s"}
          </p>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground tabular-nums">
              Page {page} of {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </ListView>
  );
};

export default NoticesList;
