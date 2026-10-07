import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreate, useList, usePermissions, useUpdate, type HttpError } from "@refinedev/core";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import {
  AlignLeft,
  ExternalLink,
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Pencil,
  Search,
  Trash2,
  Upload,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { DeleteButton } from "@/components/refine-ui/buttons/delete";
import {
  ACCEPT_FILE,
  FILE_TYPES,
  FILE_TYPE_LABELS,
  detectFileType,
  formatFileSize,
  formatDate,
  MAX_UPLOAD_BYTES,
} from "@/constants";
import type { FileType } from "@/constants";
import type { StudyMaterial } from "@/types";

const PAGE_SIZE = 6;

const materialMetaSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Title must be at least 2 characters")
    .max(120, "Title must be 120 characters or fewer"),
  description: z
    .string()
    .trim()
    .max(500, "Description must be 500 characters or fewer"),
});

type MaterialMeta = z.infer<typeof materialMetaSchema>;

const TYPE_ICONS: Record<FileType, ReactNode> = {
  pdf: <FileText className="h-4 w-4" />,
  docx: <File className="h-4 w-4" />,
  xlsx: <FileSpreadsheet className="h-4 w-4" />,
  pptx: <File className="h-4 w-4" />,
  video: <FileVideo className="h-4 w-4" />,
  image: <FileImage className="h-4 w-4" />,
  text: <AlignLeft className="h-4 w-4" />,
};

export const MaterialsTab = ({ subjectId }: { subjectId: number }) => {
  const [searchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState(
    () => searchParams.get("q") ?? ""
  );
  const [type, setType] = useState<"all" | FileType>("all");

  const { data: role } = usePermissions<string>({});
  const canEdit = role === "admin" || role === "instructor";

  const [uploadOpen, setUploadOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [editing, setEditing] = useState<StudyMaterial | null>(null);

  const {
    register: uploadRegister,
    handleSubmit: handleUploadSubmit,
    reset: resetUpload,
    getValues: getUploadValues,
    setValue: setUploadValue,
    formState: { errors: uploadErrors },
  } = useForm<MaterialMeta>({
    resolver: zodResolver(materialMetaSchema),
    defaultValues: { title: "", description: "" },
  });

  const {
    register: editRegister,
    handleSubmit: handleEditSubmit,
    reset: resetEdit,
    formState: { errors: editErrors },
  } = useForm<MaterialMeta>({
    resolver: zodResolver(materialMetaSchema),
    defaultValues: { title: "", description: "" },
  });

  // Custom sonner toasts below replace Refine's default notifications.
  const { mutate: create, mutation: createMutation } = useCreate<
    StudyMaterial,
    HttpError,
    Record<string, unknown>
  >({
    successNotification: false,
    errorNotification: false,
  });
  const { mutate: update, mutation: updateMutation } = useUpdate<
    StudyMaterial,
    HttpError,
    MaterialMeta
  >({
    successNotification: false,
    errorNotification: false,
  });
  const isCreating = createMutation.isPending;
  const isUpdating = updateMutation.isPending;

  useEffect(() => {
    setPage(1);
  }, [searchQuery, type]);

  const filters = useMemo(
    () => [
      { field: "subjectId", operator: "eq" as const, value: subjectId },
      ...(type === "all"
        ? []
        : [{ field: "fileType", operator: "eq" as const, value: type }]),
      ...(searchQuery
        ? [{ field: "q", operator: "contains" as const, value: searchQuery }]
        : []),
    ],
    [subjectId, type, searchQuery]
  );

  const { query, result } = useList<StudyMaterial>({
    resource: "materials",
    pagination: { currentPage: page, pageSize: PAGE_SIZE },
    sorters: [{ field: "createdAt", order: "desc" }],
    filters,
  });

  const materials = result.data;
  const total = result.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  /** Client-side gate (415/413) before anything reaches the provider. */
  const pickFile = (picked: File | null | undefined) => {
    if (!picked) return;

    if (!detectFileType(picked.name)) {
      toast.error("Unsupported file type", {
        description: `"${picked.name}" — allowed: PDF, DOCX, XLSX, PPTX, video, PNG/JPG, TXT/MD.`,
      });
      return;
    }

    if (picked.size > MAX_UPLOAD_BYTES) {
      toast.error("File too large", {
        description: `"${picked.name}" is ${formatFileSize(picked.size)} — the limit is 50 MB.`,
      });
      return;
    }

    setFile(picked);
    if (!getUploadValues("title").trim()) {
      setUploadValue(
        "title",
        picked.name.replace(/\.[^.]+$/, ""),
        { shouldValidate: true }
      );
    }
  };

  const onUpload = (values: MaterialMeta) => {
    if (!file) {
      toast.error("Choose a file first", {
        description:
          "Pick a PDF, DOCX, XLSX, PPTX, video, image, or text file.",
      });
      return;
    }

    create(
      {
        resource: "materials",
        values: {
          subjectId,
          title: values.title,
          description: values.description,
          fileName: file.name,
          fileType: detectFileType(file.name),
          fileSize: file.size,
          fileUrl: URL.createObjectURL(file),
          license: null,
          // Raw upload — the local DB persists it so downloads survive reloads.
          file,
        },
      },
      {
        onSuccess: () => {
          toast.success("Material uploaded", { description: file.name });
          setUploadOpen(false);
          setFile(null);
          resetUpload();
        },
        onError: (error) => {
          toast.error("Upload failed", { description: error?.message });
        },
      }
    );
  };

  const openEdit = (material: StudyMaterial) => {
    setEditing(material);
    resetEdit({ title: material.title, description: material.description });
  };

  const onEdit = (values: MaterialMeta) => {
    if (!editing) return;
    update(
      { resource: "materials", id: editing.id, values },
      {
        onSuccess: () => {
          toast.success("Material updated", { description: values.title });
          setEditing(null);
        },
        onError: (error) => {
          toast.error("Update failed", { description: error?.message });
        },
      }
    );
  };

  const chips: Array<{ value: "all" | FileType; label: string }> = [
    { value: "all", label: "All" },
    ...FILE_TYPES.map((value) => ({
      value,
      label: FILE_TYPE_LABELS[value],
    })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <Button
              key={chip.value}
              size="sm"
              variant={type === chip.value ? "default" : "outline"}
              onClick={() => setType(chip.value)}
            >
              {chip.label}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="search-field">
            <Search className="search-icon" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search materials..."
              aria-label="Search materials by title"
              className="pl-10 w-full"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {canEdit && (
            <Button onClick={() => setUploadOpen(true)}>
              <Upload className="h-4 w-4" />
              Upload
            </Button>
          )}
        </div>
      </div>

      {query.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-40 rounded-md" />
          ))}
        </div>
      ) : materials.length === 0 ? (
        <div className="rounded-md border bg-card p-10 text-center flex flex-col items-center gap-3">
          <p className="font-semibold">No materials here yet</p>
          <p className="text-sm text-muted-foreground max-w-md">
            {searchQuery || type !== "all"
              ? "Nothing matches the current search and type filter."
              : "Upload the first PDF, deck, worksheet, or recording for this classroom."}
          </p>
          {canEdit && !searchQuery && type === "all" && (
            <Button onClick={() => setUploadOpen(true)}>
              <Upload className="h-4 w-4" />
              Upload material
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {materials.map((material) => (
            <Card key={material.id}>
              <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2 space-y-0">
                <div className="flex items-start gap-2 min-w-0">
                  <div className="rounded-md border bg-muted p-2 shrink-0">
                    {TYPE_ICONS[material.fileType]}
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-base leading-snug line-clamp-2">
                      {material.title}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground truncate">
                      {material.fileName} · {formatFileSize(material.fileSize)}
                    </p>
                  </div>
                </div>
                <Badge variant="secondary" className="shrink-0">
                  {FILE_TYPE_LABELS[material.fileType]}
                </Badge>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {material.description || "No description."}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {material.uploadedBy} · {formatDate(material.createdAt)}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Open / download"
                      asChild
                    >
                      <a
                        href={material.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                    {canEdit && (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Edit metadata"
                          onClick={() => openEdit(material)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <DeleteButton
                          resource="materials"
                          recordItemId={material.id}
                          size="icon"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          title="Delete material"
                        >
                          <Trash2 className="h-4 w-4" />
                        </DeleteButton>
                      </>
                    )}
                  </div>
                </div>
                {material.license && (
                  <p className="text-[11px] text-muted-foreground border-t pt-2">
                    {material.license}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {total} material{total === 1 ? "" : "s"}
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

      {/* Upload dialog ------------------------------------------------ */}
      <Dialog
        open={uploadOpen}
        onOpenChange={(open) => {
          setUploadOpen(open);
          if (!open) {
            setFile(null);
            resetUpload();
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload material</DialogTitle>
            <DialogDescription>
              PDF, DOCX, XLSX, PPTX, video, PNG/JPG, or TXT/MD — up to 50 MB.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={handleUploadSubmit(onUpload)}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="material-file">File</Label>
              <Input
                id="material-file"
                type="file"
                accept={ACCEPT_FILE}
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
              {file && (
                <p className="text-xs text-muted-foreground">
                  {file.name} · {formatFileSize(file.size)}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="material-title">Title</Label>
              <Input
                id="material-title"
                placeholder="Lecture 07 — graphs"
                {...uploadRegister("title")}
              />
              {uploadErrors.title && (
                <p className="text-xs text-destructive">
                  {uploadErrors.title.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="material-description">Description</Label>
              <Textarea
                id="material-description"
                rows={3}
                placeholder="What this material covers (optional, max 500 characters)"
                {...uploadRegister("description")}
              />
              {uploadErrors.description && (
                <p className="text-xs text-destructive">
                  {uploadErrors.description.message}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setUploadOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isCreating}>
                {isCreating ? "Uploading..." : "Upload"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit metadata dialog ---------------------------------------- */}
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit material</DialogTitle>
            <DialogDescription>
              Metadata only — the uploaded file itself is never changed.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={handleEditSubmit(onEdit)}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-material-title">Title</Label>
              <Input
                id="edit-material-title"
                placeholder="Lecture 07 — graphs"
                {...editRegister("title")}
              />
              {editErrors.title && (
                <p className="text-xs text-destructive">
                  {editErrors.title.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-material-description">Description</Label>
              <Textarea
                id="edit-material-description"
                rows={3}
                placeholder="What this material covers (optional, max 500 characters)"
                {...editRegister("description")}
              />
              {editErrors.description && (
                <p className="text-xs text-destructive">
                  {editErrors.description.message}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isUpdating}>
                {isUpdating ? "Saving..." : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
