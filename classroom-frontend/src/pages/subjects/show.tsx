import { useParams, useSearchParams } from "react-router";
import { useOne } from "@refinedev/core";
import { FileUp, Lightbulb, Loader2 } from "lucide-react";

import { ListView } from "@/components/refine-ui/views/list-view";
import { Breadcrumb } from "@/components/refine-ui/layout/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MaterialsTab } from "./materials-tab";
import { SuggestionsTab } from "./suggestions-tab";
import type { Subject } from "@/types";

const SubjectShow = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const tab =
    searchParams.get("tab") === "suggestions" ? "suggestions" : "materials";

  const { query, result: subject } = useOne<Subject>({
    resource: "subjects",
    id: id ?? "",
  });

  if (query.isLoading) {
    return (
      <ListView>
        <Breadcrumb />
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading subject...</span>
        </div>
        <Skeleton className="h-24 rounded-md" />
        <Skeleton className="h-9 w-64 rounded-md" />
        <Skeleton className="h-72 rounded-md" />
      </ListView>
    );
  }

  if (query.isError || !subject) {
    return (
      <ListView>
        <Breadcrumb />
        <h1>Subject not found</h1>
        <div className="rounded-md border bg-card p-10 text-center flex flex-col items-center gap-3">
          <p className="text-sm text-muted-foreground">
            This subject may have been deleted.
          </p>
          <Button variant="outline" asChild>
            <a href="/subjects">Back to subjects</a>
          </Button>
        </div>
      </ListView>
    );
  }

  return (
    <ListView>
      <Breadcrumb />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-mono">
              {subject.code}
            </Badge>
            <Badge variant="outline">{subject.department}</Badge>
          </div>
          <h1>{subject.name}</h1>
          {subject.description && (
            <p className="text-muted-foreground max-w-2xl">
              {subject.description}
            </p>
          )}
        </div>
        <Button variant="outline" asChild>
          <a href="/subjects">Back to subjects</a>
        </Button>
      </div>

      <Tabs
        value={tab}
        onValueChange={(next) =>
          setSearchParams(
            { tab: next },
            { replace: true }
          )
        }
      >
        <TabsList>
          <TabsTrigger value="materials">
            <FileUp className="h-4 w-4" />
            Materials
          </TabsTrigger>
          <TabsTrigger value="suggestions">
            <Lightbulb className="h-4 w-4" />
            Suggestions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="materials">
          <MaterialsTab subjectId={subject.id} />
        </TabsContent>
        <TabsContent value="suggestions">
          <SuggestionsTab subjectId={subject.id} />
        </TabsContent>
      </Tabs>
    </ListView>
  );
};

export default SubjectShow;
