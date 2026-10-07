import { useMemo } from "react";
import { useForm } from "@refinedev/react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useList, type HttpError } from "@refinedev/core";

import { EditView, EditViewHeader } from "@/components/refine-ui/views/edit-view";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { FieldProgress } from "@/components/refine-ui/form/field-progress";
import { noticeFormSchema, noticeProgress, toSubjectId, type NoticeInput } from "./schema";
import type { Notice, Subject } from "@/types";

const NoticeEdit = () => {
  const { result } = useList<Subject>({
    resource: "subjects",
    pagination: { pageSize: 1000 },
  });

  const subjects = useMemo(() => result.data, [result.data]);

  const form = useForm<Notice, HttpError, NoticeInput>({
    refineCoreProps: {
      action: "edit",
      resource: "notices",
      redirect: "list",
    },
    resolver: zodResolver(noticeFormSchema),
    defaultValues: {
      title: "",
      body: "",
      subjectId: "global",
      pinned: false,
    },
  });

  const {
    control,
    handleSubmit,
    watch,
    refineCore: { onFinish },
    formState: { isSubmitting },
  } = form;

  const progress = noticeProgress(watch());

  return (
    <EditView>
      <EditViewHeader resource="notices" title="Edit notice" />
      <Form {...form}>
        <form
          onSubmit={handleSubmit((values) =>
            onFinish({ ...values, subjectId: toSubjectId(values.subjectId) }).catch(
              () => undefined
            )
          )}
          className="max-w-3xl w-full mx-auto rounded-md border bg-card p-6 flex flex-col gap-6 shadow-sm"
        >
          <div className="flex items-center justify-between gap-4 border-b pb-4">
            <p className="text-sm text-muted-foreground">
              Changes appear immediately on the notice board.
            </p>
            <FieldProgress value={progress} />
          </div>

          <FormField
            control={control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl>
                  <Input placeholder="Midterm exam schedule published" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name="body"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Body</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="What should everyone know? (max 2000 characters)"
                    rows={6}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-6 sm:grid-cols-2">
            <FormField
              control={control}
              name="subjectId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Scope</FormLabel>
                  <Select
                    value={field.value == null ? "global" : String(field.value)}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="All subjects" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="global">All subjects</SelectItem>
                      {subjects.map((subject) => (
                        <SelectItem key={subject.id} value={String(subject.id)}>
                          {subject.code} — {subject.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="pinned"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-3 space-y-0 pt-6">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="text-sm font-normal cursor-pointer">
                    Pin to the top of the board
                  </FormLabel>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => history.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </form>
      </Form>
    </EditView>
  );
};

export default NoticeEdit;
