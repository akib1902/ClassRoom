import { useMemo } from "react";
import { useForm } from "@refinedev/react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useList, type HttpError } from "@refinedev/core";

import { CreateView, CreateViewHeader } from "@/components/refine-ui/views/create-view";
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
import { Button } from "@/components/ui/button";
import { FieldProgress } from "@/components/refine-ui/form/field-progress";
import { DEPARTMENTS_OPTIONS } from "@/constants";
import { subjectFormSchema, subjectProgress, type SubjectInput } from "./schema";
import type { Subject } from "@/types";

const SubjectCreate = () => {
  const { result } = useList<Subject>({
    resource: "subjects",
    pagination: { pageSize: 1000 },
  });

  const subjects = result.data;

  const takenCodes = useMemo(
    () => subjects.map((subject) => subject.code),
    [subjects]
  );

  const form = useForm<Subject, HttpError, SubjectInput>({
    refineCoreProps: {
      action: "create",
      resource: "subjects",
      redirect: "list",
    },
    resolver: zodResolver(subjectFormSchema(takenCodes)),
    defaultValues: {
      code: "",
      name: "",
      department: "CS",
      description: "",
    },
  });

  const {
    control,
    handleSubmit,
    watch,
    refineCore: { onFinish },
    formState: { isSubmitting },
  } = form;

  const progress = subjectProgress(watch());

  return (
    <CreateView>
      <CreateViewHeader resource="subjects" title="Create subject" />
      <Form {...form}>
        <form
          onSubmit={handleSubmit((values) => onFinish(values).catch(() => undefined))}
          className="max-w-3xl w-full mx-auto rounded-md border bg-card p-6 flex flex-col gap-6 shadow-sm"
        >
          <div className="flex items-center justify-between gap-4 border-b pb-4">
            <p className="text-sm text-muted-foreground">
              Progress updates as you complete each field.
            </p>
            <FieldProgress value={progress} />
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <FormField
              control={control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Code</FormLabel>
                  <FormControl>
                    <Input placeholder="CS101" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="department"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Department</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {DEPARTMENTS_OPTIONS.map((dept) => (
                        <SelectItem key={dept.value} value={dept.value}>
                          {dept.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input placeholder="Introduction to Computer Science" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="What this subject covers (optional, max 500 characters)"
                    rows={4}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => history.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Create subject"}
            </Button>
          </div>
        </form>
      </Form>
    </CreateView>
  );
};

export default SubjectCreate;