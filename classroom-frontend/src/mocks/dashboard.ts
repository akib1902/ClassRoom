/**
 * Stand-in series for the F7 dashboard widgets until `/api/dashboard/stats`
 * and `/api/dashboard/trends` land with the backend (README §5.3, Phase 5).
 * Subject-derived metrics on the dashboard are read from the live data
 * provider instead of this file.
 */
export const mockStats = {
  students: 486,
  enrollmentRate: 82,
  attendanceRate: 91,
  avgGrade: 76.4,
};

export const enrollmentTrend = [
  { month: "Mar", enrolled: 268 },
  { month: "Apr", enrolled: 301 },
  { month: "May", enrolled: 344 },
  { month: "Jun", enrolled: 318 },
  { month: "Jul", enrolled: 372 },
  { month: "Aug", enrolled: 425 },
  { month: "Sep", enrolled: 461 },
  { month: "Oct", enrolled: 486 },
];

export const gradeDistribution = [
  { band: "0–49", count: 9 },
  { band: "50–59", count: 24 },
  { band: "60–69", count: 58 },
  { band: "70–79", count: 112 },
  { band: "80–89", count: 141 },
  { band: "90–100", count: 87 },
];

export const attendanceTrend = [
  { week: "W1", rate: 96 },
  { week: "W2", rate: 94 },
  { week: "W3", rate: 92 },
  { week: "W4", rate: 93 },
  { week: "W5", rate: 89 },
  { week: "W6", rate: 91 },
  { week: "W7", rate: 88 },
  { week: "W8", rate: 91 },
];
