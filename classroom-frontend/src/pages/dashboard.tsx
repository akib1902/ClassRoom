import { useMemo, type ReactNode } from "react";
import { useGetIdentity, useList, usePermissions } from "@refinedev/core";
import { Link } from "react-router";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BookOpen,
  CalendarDays,
  FileText,
  Lightbulb,
  Megaphone,
  Plus,
} from "lucide-react";

import { Breadcrumb } from "@/components/refine-ui/layout/breadcrumb";
import { GlowCard } from "@/components/refine-ui/effects/glow-card";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DEPARTMENTS, daysUntil, formatDate } from "@/constants";
import { useCountUp } from "@/hooks/use-count-up";
import {
  attendanceTrend,
  enrollmentTrend,
  gradeDistribution,
  mockStats,
} from "@/mocks/dashboard";
import { cn } from "@/lib/utils";
import type { Notice, Subject, StudyMaterial, Suggestion } from "@/types";

const departmentColor: Record<string, string> = {
  CS: "var(--chart-1)",
  Math: "var(--chart-2)",
  English: "var(--chart-3)",
};

const tooltipStyle: React.CSSProperties = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--popover-foreground)",
  fontSize: 12,
};

const axisTick = { fill: "var(--muted-foreground)", fontSize: 12 };

const StatCard = ({
  title,
  value,
  suffix = "",
  decimals = 0,
  hint,
}: {
  title: string;
  value: number;
  suffix?: string;
  decimals?: number;
  hint?: string;
}) => {
  const animated = useCountUp(value, 900, decimals);

  return (
    <GlowCard>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl font-bold tabular-nums">
          {animated}
          {suffix}
        </CardTitle>
      </CardHeader>
      {hint && (
        <CardContent className="pt-0 text-xs text-muted-foreground">
          {hint}
        </CardContent>
      )}
    </GlowCard>
  );
};

/**
 * Bento tile. The single `hero` tile carries the ambient loop
 * (design brief §3 — one designated hero block moving in an ambient
 * loop, surrounding tiles respond only on hover via GlowCard).
 */
const ChartCard = ({
  title,
  description,
  className,
  hero = false,
  children,
}: {
  title: string;
  description: string;
  className?: string;
  hero?: boolean;
  children: ReactNode;
}) => (
  <GlowCard className={cn(hero && "ambient-sweep", className)}>
    <CardHeader>
      <CardTitle className="text-base">{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
    </CardHeader>
    <CardContent className={cn(hero && "lg:flex-1")}>
      <div
        className={cn(
          "w-full",
          hero ? "h-[300px] lg:h-full lg:min-h-[360px]" : "h-[260px]"
        )}
      >
        {children}
      </div>
    </CardContent>
  </GlowCard>
);

/** One row of the student home's quick links. */
const QuickLink = ({
  to,
  icon,
  title,
  description,
}: {
  to: string;
  icon: ReactNode;
  title: string;
  description: string;
}) => (
  <Link
    to={to}
    className="group flex items-start gap-3 rounded-md border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-accent"
  >
    <div className="rounded-md border bg-muted p-2 shrink-0 transition-colors group-hover:text-primary">
      {icon}
    </div>
    <div className="min-w-0">
      <p className="font-medium leading-tight">{title}</p>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  </Link>
);

/**
 * Student landing — view & download only. No mutation affordances anywhere:
 * students browse classrooms, read announcements, open materials and follow
 * exam guidance (PRD §1 role matrix; F9–F11 read-only for students).
 */
const StudentHome = () => {
  const { data: identity } = useGetIdentity();

  const { query: subjectsQuery, result: subjectsResult } = useList<Subject>({
    resource: "subjects",
    pagination: { pageSize: 1000 },
  });
  const { result: noticesResult } = useList<Notice>({
    resource: "notices",
    pagination: { pageSize: 3 },
    sorters: [
      { field: "pinned", order: "desc" },
      { field: "createdAt", order: "desc" },
    ],
  });
  const { result: materialsResult } = useList<StudyMaterial>({
    resource: "materials",
    pagination: { pageSize: 1 },
  });
  const { result: suggestionsResult } = useList<Suggestion>({
    resource: "suggestions",
    pagination: { pageSize: 1000 },
  });

  const isLoading = subjectsQuery.isLoading;
  const subjects = subjectsResult.data;
  const notices = noticesResult.data;
  const materialsTotal = materialsResult.total ?? 0;

  const subjectById = useMemo(
    () => new Map(subjects.map((subject) => [subject.id, subject])),
    [subjects]
  );

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = suggestionsResult.data
    .filter((item) => item.examAt && item.examAt >= today)
    .sort((a, b) => (a.examAt ?? "").localeCompare(b.examAt ?? ""))
    .slice(0, 3);

  const firstName =
    (identity as { firstName?: string } | undefined)?.firstName ?? "there";

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Breadcrumb />
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24 rounded-md" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-32 rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb />
      <div>
        <h1 className="page-title">Welcome back, {firstName}</h1>
        <p className="text-sm text-muted-foreground">
          Your read-only student workspace — browse classrooms, read
          announcements and download materials.
        </p>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Classrooms"
          value={subjectsResult.total ?? subjects.length}
          hint="Subjects you can open"
        />
        <StatCard
          title="Announcements"
          value={noticesResult.total ?? notices.length}
          hint="On the notice board"
        />
        <StatCard
          title="Study materials"
          value={materialsTotal}
          hint="Files ready to view or download"
        />
        <StatCard
          title="Upcoming exams"
          value={upcoming.length}
          hint="With published guidance"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <QuickLink
          to="/subjects"
          icon={<BookOpen className="h-4 w-4" />}
          title="Browse classrooms"
          description="Open a subject, then read its Materials and Suggestions tabs."
        />
        <QuickLink
          to="/notices"
          icon={<Megaphone className="h-4 w-4" />}
          title="Notice board"
          description="Announcements for every classroom — pinned ones stay on top."
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlowCard>
          <CardHeader>
            <CardTitle className="text-base">Latest announcements</CardTitle>
            <CardDescription>Newest notices across your classrooms</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {notices.length === 0 && (
              <p className="text-sm text-muted-foreground">No notices yet.</p>
            )}
            {notices.map((notice) => (
              <Link
                key={notice.id}
                to="/notices"
                className="flex items-start justify-between gap-3 border-b pb-3 last:border-0 last:pb-0 hover:underline"
              >
                <div className="min-w-0">
                  <p className="font-medium leading-snug line-clamp-1">
                    {notice.title}
                  </p>
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    {notice.body}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {notice.pinned && (
                    <Badge variant="secondary" className="text-[10px]">
                      Pinned
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {formatDate(notice.createdAt)}
                  </span>
                </div>
              </Link>
            ))}
            <Button variant="outline" size="sm" asChild className="self-start">
              <Link to="/notices">Open the notice board</Link>
            </Button>
          </CardContent>
        </GlowCard>

        <GlowCard>
          <CardHeader>
            <CardTitle className="text-base">Upcoming exam guidance</CardTitle>
            <CardDescription>Nearest exam first — straight to the materials</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {upcoming.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No upcoming exams with guidance yet.
              </p>
            )}
            {upcoming.map((item) => {
              const subject = subjectById.get(item.subjectId);
              const days = item.examAt ? daysUntil(item.examAt) : 0;
              return (
                <Link
                  key={item.id}
                  to={`/subjects/show/${item.subjectId}?tab=suggestions`}
                  className="flex items-start justify-between gap-3 border-b pb-3 last:border-0 last:pb-0 hover:underline"
                >
                  <div className="min-w-0">
                    <p className="font-medium leading-snug line-clamp-1">
                      {item.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {subject?.name ?? "Classroom"} · {item.materialIds.length}{" "}
                      linked material{item.materialIds.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    <CalendarDays className="h-3 w-3" />
                    {formatDate(item.examAt ?? "")} · in {days}d
                  </Badge>
                </Link>
              );
            })}
          </CardContent>
        </GlowCard>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <QuickLink
          to="/subjects"
          icon={<FileText className="h-4 w-4" />}
          title="Download materials"
          description="PDFs, decks, worksheets and recordings per classroom."
        />
        <QuickLink
          to="/subjects"
          icon={<Lightbulb className="h-4 w-4" />}
          title="Study suggestions"
          description="Admin-published guidance, nearest exam first."
        />
        <QuickLink
          to="/notices"
          icon={<Megaphone className="h-4 w-4" />}
          title="Read announcements"
          description="Students can read and download — posting is for staff."
        />
      </div>
    </div>
  );
};

const Dashboard = () => {
  const { data: role } = usePermissions<string>({});

  const { query, result } = useList<Subject>({
    resource: "subjects",
    pagination: { pageSize: 1000 },
  });

  const subjects = result.data;
  const subjectCount = result.total ?? 0;
  const isLoading = query.isLoading;

  const departmentBreakdown = useMemo(
    () =>
      DEPARTMENTS.map((department) => ({
        department,
        count: subjects.filter((subject) => subject.department === department)
          .length,
      })),
    [subjects]
  );

  // Role-wise landing: students get a view/download-only home (F1/§1).
  if (role === "student") {
    return <StudentHome />;
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Breadcrumb />
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <GlowCard key={index}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-16" />
              </CardHeader>
            </GlowCard>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <GlowCard key={index}>
              <CardHeader>
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-[260px] w-full" />
              </CardContent>
            </GlowCard>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <Breadcrumb />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="page-title">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Subjects, enrollment, grades and attendance at a glance
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {role === "admin" && (
              <Button asChild size="sm">
                <Link to="/subjects/create">
                  <Plus className="h-4 w-4" />
                  New subject
                </Link>
              </Button>
            )}
            {(role === "admin" || role === "instructor") && (
              <Button asChild size="sm" variant="outline">
                <Link to="/notices/create">
                  <Megaphone className="h-4 w-4" />
                  Post notice
                </Link>
              </Button>
            )}
            <Button asChild size="sm" variant="outline">
              <Link to="/subjects">
                <BookOpen className="h-4 w-4" />
                Classrooms
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <ChartCard
          hero
          title="Enrollment over time"
          description="Students enrolled per month"
          className="sm:col-span-2 lg:col-span-2 lg:row-span-2"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={enrollmentTrend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="enrollmentFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tick={axisTick} tickLine={false} axisLine={false} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} width={40} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "var(--border)" }} />
              <Area
                type="monotone"
                dataKey="enrolled"
                name="Enrolled"
                stroke="var(--chart-1)"
                strokeWidth={2}
                fill="url(#enrollmentFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <StatCard
          title="Total subjects"
          value={subjectCount}
          hint="Live from the subjects data layer"
        />
        <StatCard
          title="Students"
          value={mockStats.students}
          hint="Demo metric until the API lands"
        />
        <StatCard
          title="Enrollment rate"
          value={mockStats.enrollmentRate}
          suffix="%"
          hint="Seats filled across all subjects"
        />
        <StatCard
          title="Attendance rate"
          value={mockStats.attendanceRate}
          suffix="%"
          hint="Average across recorded sessions"
        />

        <ChartCard
          title="Grade distribution"
          description="Students per score band (current term)"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={gradeDistribution} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="band" tick={axisTick} tickLine={false} axisLine={false} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} width={40} />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ fill: "var(--muted)" }}
              />
              <Bar dataKey="count" name="Students" radius={[4, 4, 0, 0]}>
                {gradeDistribution.map((entry) => (
                  <Cell key={entry.band} fill="var(--chart-2)" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Attendance over time"
          description="Weekly attendance rate (%)"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={attendanceTrend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="week" tick={axisTick} tickLine={false} axisLine={false} />
              <YAxis domain={[70, 100]} tick={axisTick} tickLine={false} axisLine={false} width={40} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "var(--border)" }} />
              <Line
                type="monotone"
                dataKey="rate"
                name="Attendance"
                stroke="var(--chart-3)"
                strokeWidth={2}
                dot={{ r: 3, fill: "var(--chart-3)" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Subjects by department"
          description="Live breakdown of the subjects catalogue"
          className="sm:col-span-2"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={departmentBreakdown}
              layout="vertical"
              margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
              <YAxis
                type="category"
                dataKey="department"
                tick={axisTick}
                tickLine={false}
                axisLine={false}
                width={70}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ fill: "var(--muted)" }}
              />
              <Bar dataKey="count" name="Subjects" radius={[0, 4, 4, 0]} barSize={22}>
                {departmentBreakdown.map((entry) => (
                  <Cell
                    key={entry.department}
                    fill={departmentColor[entry.department] ?? "var(--chart-1)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
};

export default Dashboard;
