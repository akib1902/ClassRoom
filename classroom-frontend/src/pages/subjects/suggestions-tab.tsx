import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreate, useList, usePermissions, useUpdate, type HttpError } from "@refinedev/core";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { Calendar, FileText, Lightbulb, Pencil, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { DeleteButton } from "@/components/refine-ui/buttons/delete";
import { daysUntil, formatDate, todayISO } from "@/constants";
import type { StudyMaterial, Suggestion } from "@/types";

const suggestionSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Title must be at least 3 characters")
    .max(120, "Title must be 120 characters or fewer"),
  body: z
    .string()
    .trim()
    .min(1, "Body is required")
    .max(2000, "Body must be 2000 characters or fewer"),
  examAt: z
    .string()
    .refine(
      (value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value),
      "Pick a valid date"
    ),
});

type SuggestionInput = z.infer<typeof suggestionSchema>;

const ExamBadge = ({ examAt }: { examAt: string }) => {
  const days = daysUntil(examAt);
  const label =
    days > 0 ? `in ${days} day${days === 1 ? "" : "s"}` : days === 0 ? "today" : `${Math.abs(days)} days ago`;

  return (
    <Badge variant={days >= 0 ? "secondary" : "outline"} className="gap-1 shrink-0">
      <Calendar className="h-3 w-3" />
      {formatDate(examAt)} · {label}
    </Badge>
  );
};

export const SuggestionsTab = ({ subjectId }: { subjectId: number }) => {
  const { data: role } = usePermissions<string>({});
  const canManage = role === "admin";

  const [, setSearchParams] = useSearchParams();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Suggestion | null>(null);
  const [linkedIds, setLinkedIds] = useState<number[]>([]);

  const { register, handleSubmit, reset, formState: { errors } } =
    useForm<SuggestionInput>({
      resolver: zodResolver(suggestionSchema),
      defaultValues: { title: "", body: "", examAt: "" },
    });

  // Custom sonner toasts below replace Refine's default notifications.
  const { mutate: create, mutation: createMutation } = useCreate<
    Suggestion,
    HttpError,
    Record<string, unknown>
  >({
    successNotification: false,
    errorNotification: false,
  });
  const { mutate: update, mutation: updateMutation } = useUpdate<
    Suggestion,
    HttpError,
    Record<string, unknown>
  >({
    successNotification: false,
    errorNotification: false,
  });
  const isCreating = createMutation.isPending;
  const isUpdating = updateMutation.isPending;

  const { result: materialResult } = useList<StudyMaterial>({
    resource: "materials",
    filters: [{ field: "subjectId", operator: "eq", value: subjectId }],
    pagination: { pageSize: 1000 },
  });
  const materials = useMemo(() => materialResult.data, [materialResult]);
  const materialById = useMemo(
    () => new Map(materials.map((material) => [material.id, material])),
    [materials]
  );

  const { query, result } = useList<Suggestion>({
    resource: "suggestions",
    filters: [{ field: "subjectId", operator: "eq", value: subjectId }],
    pagination: { pageSize: 1000 },
    sorters: [{ field: "createdAt", order: "desc" }],
  });

  const suggestions = result.data;
  const today = todayISO();

  const upcoming = suggestions
    .filter((item) => item.examAt && item.examAt >= today)
    .sort((a, b) => (a.examAt ?? "").localeCompare(b.examAt ?? ""));
  const undated = suggestions.filter((item) => !item.examAt);
  const past = suggestions
    .filter((item) => item.examAt && item.examAt < today)
    .sort((a, b) => (b.examAt ?? "").localeCompare(a.examAt ?? ""));

  /** Chip click → jump to the Materials tab pre-filtered to that title. */
  const openMaterial = (title: string) =>
    setSearchParams({ tab: "materials", q: title });

  const openCreate = () => {
    setEditing(null);
    setLinkedIds([]);
    reset({ title: "", body: "", examAt: "" });
    setDialogOpen(true);
  };

  const openEdit = (item: Suggestion) => {
    setEditing(item);
    setLinkedIds(item.materialIds);
    reset({
      title: item.title,
      body: item.body,
      examAt: item.examAt ?? "",
    });
    setDialogOpen(true);
  };

  const toggleLinked = (materialId: number) =>
    setLinkedIds((current) =>
      current.includes(materialId)
        ? current.filter((id) => id !== materialId)
        : [...current, materialId]
    );

  const onSubmit = (values: SuggestionInput) => {
    const variables = {
      subjectId,
      title: values.title,
      body: values.body,
      examAt: values.examAt || null,
      materialIds: linkedIds,
    };

    if (editing) {
      update(
        { resource: "suggestions", id: editing.id, values: variables },
        {
          onSuccess: () => {
            toast.success("Suggestion updated", { description: values.title });
            setDialogOpen(false);
          },
          onError: (error) =>
            toast.error("Update failed", { description: error?.message }),
        }
      );
      return;
    }

    create(
      { resource: "suggestions", values: variables },
      {
        onSuccess: () => {
          toast.success("Suggestion published", { description: values.title });
          setDialogOpen(false);
        },
        onError: (error) =>
          toast.error("Publish failed", { description: error?.message }),
      }
    );
  };

  const SuggestionCard = ({ item }: { item: Suggestion }) => (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2 space-y-0">
        <CardTitle className="text-base leading-snug flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
          {item.title}
        </CardTitle>
        {item.examAt && <ExamBadge examAt={item.examAt} />}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground whitespace-pre-line">
          {item.body}
        </p>

        {item.materialIds.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {item.materialIds.map((materialId) => {
              const material = materialById.get(materialId);
              if (!material) return null;
              return (
                <Button
                  key={materialId}
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs"
                  onClick={() => openMaterial(material.title)}
                  title={`Open "${material.title}" in Materials`}
                >
                  <FileText className="h-3 w-3" />
                  {material.title}
                </Button>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            {item.createdBy} · {formatDate(item.createdAt)}
          </p>
          {canManage && (
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                title="Edit suggestion"
                onClick={() => openEdit(item)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <DeleteButton
                resource="suggestions"
                recordItemId={item.id}
                size="icon"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                title="Delete suggestion"
              >
                <Trash2 className="h-4 w-4" />
              </DeleteButton>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  const live = [...upcoming, ...undated];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Pre-exam study guidance published by the admin — nearest exam first.
        </p>
        {canManage && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New suggestion
          </Button>
        )}
      </div>

      {query.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-40 rounded-md" />
          ))}
        </div>
      ) : suggestions.length === 0 ? (
        <div className="rounded-md border bg-card p-10 text-center flex flex-col items-center gap-3">
          <p className="font-semibold">No suggestions for this subject yet</p>
          <p className="text-sm text-muted-foreground max-w-md">
            {canManage
              ? "Publish guidance before the next exam and link it to the right materials."
              : "The admin has not published any pre-exam guidance for this classroom."}
          </p>
          {canManage && (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              New suggestion
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {live.map((item) => (
              <SuggestionCard key={item.id} item={item} />
            ))}
          </div>

          {past.length > 0 && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <Separator className="flex-1" />
                <h3 className="text-sm font-medium text-muted-foreground shrink-0">
                  Past exams
                </h3>
                <Separator className="flex-1" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 opacity-75">
                {past.map((item) => (
                  <SuggestionCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Create / edit dialog ---------------------------------------- */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit suggestion" : "New suggestion"}
            </DialogTitle>
            <DialogDescription>
              Shown above the material list for this classroom before the exam.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="suggestion-title">Title</Label>
              <Input
                id="suggestion-title"
                placeholder="Midterm focus: graphs & sorting"
                {...register("title")}
              />
              {errors.title && (
                <p className="text-xs text-destructive">{errors.title.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="suggestion-exam">Exam date (optional)</Label>
              <Input
                id="suggestion-exam"
                type="date"
                {...register("examAt")}
              />
              <p className="text-xs text-muted-foreground">
                Suggestions with a date sort by the nearest upcoming exam.
              </p>
              {errors.examAt && (
                <p className="text-xs text-destructive">{errors.examAt.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="suggestion-body">Guidance</Label>
              <Textarea
                id="suggestion-body"
                rows={4}
                placeholder="What should students focus on? (max 2000 characters)"
                {...register("body")}
              />
              {errors.body && (
                <p className="text-xs text-destructive">{errors.body.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label>Linked materials</Label>
              {materials.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No materials in this classroom yet — upload some first.
                </p>
              ) : (
                <div className="max-h-44 overflow-y-auto rounded-md border p-3 flex flex-col gap-2">
                  {materials.map((material) => (
                    <label
                      key={material.id}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <Checkbox
                        checked={linkedIds.includes(material.id)}
                        onCheckedChange={() => toggleLinked(material.id)}
                      />
                      <span className="truncate">{material.title}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isCreating || isUpdating}>
                {isCreating || isUpdating
                  ? "Saving..."
                  : editing
                    ? "Save changes"
                    : "Publish suggestion"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
