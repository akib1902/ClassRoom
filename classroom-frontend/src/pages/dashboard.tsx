import { useMemo, type ReactNode } from "react";
import { useList } from "@refinedev/core";
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

import { Breadcrumb } from "@/components/refine-ui/layout/breadcrumb";
import { GlowCard } from "@/components/refine-ui/effects/glow-card";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DEPARTMENTS } from "@/constants";
import { useCountUp } from "@/hooks/use-count-up";
import {
  attendanceTrend,
  enrollmentTrend,
  gradeDistribution,
  mockStats,
} from "@/mocks/dashboard";
import { cn } from "@/lib/utils";
import type { Subject } from "@/types";

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

const Dashboard = () => {
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
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Subjects, enrollment, grades and attendance at a glance
          </p>
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
                cursor={{ fill: "var(--muted)", opacity: 0.6 }}
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
                cursor={{ fill: "var(--muted)", opacity: 0.6 }}
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
