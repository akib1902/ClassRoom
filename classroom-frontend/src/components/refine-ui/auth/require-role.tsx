import type { ReactNode } from "react";
import { usePermissions } from "@refinedev/core";
import { Link } from "react-router";
import { ShieldAlert } from "lucide-react";

import { Breadcrumb } from "@/components/refine-ui/layout/breadcrumb";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type Role = "admin" | "instructor" | "student";

/**
 * Route-level guard (PRD §1 role matrix). Renders `children` only for
 * allowed roles; everyone else gets a friendly 403 panel instead of the
 * form — the mock provider rejects the mutation anyway, this just never
 * shows the form in the first place.
 */
export const RequireRole = ({
  allow,
  title,
  description,
  backTo,
  backLabel,
  children,
}: {
  allow: Role[];
  title: string;
  description: string;
  backTo: string;
  backLabel: string;
  children: ReactNode;
}) => {
  const { data: role, isLoading } = usePermissions<string>({});

  if (isLoading || role === undefined) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-64 rounded-md" />
      </div>
    );
  }

  if (!allow.includes(role as Role)) {
    return (
      <div className="flex flex-col gap-4">
        <Breadcrumb />
        <h1 className="page-title">{title}</h1>
        <div className="rounded-md border bg-card p-10 text-center flex flex-col items-center gap-3">
          <ShieldAlert className="h-8 w-8 text-destructive" aria-hidden="true" />
          <p className="font-semibold">403 — your role ({role}) can't do this</p>
          <p className="text-sm text-muted-foreground max-w-md">{description}</p>
          <Button variant="outline" asChild>
            <Link to={backTo}>{backLabel}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

RequireRole.displayName = "RequireRole";
