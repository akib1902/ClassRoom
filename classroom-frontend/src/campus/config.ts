import {
  BookOpen,
  Box,
  CalendarDays,
  Gauge,
  LayoutDashboard,
  Megaphone,
  Pencil,
  Pin,
  Plus,
  Settings2,
} from "lucide-react";
import type { ComponentType } from "react";

/**
 * Campus 3D — configuration.
 *
 * The campus is a 3D shell over the existing functional app: every destination
 * below either opens one of the real screens in an overlay panel (memory-router
 * scoped, so its own links keep working inside the panel) or walks through a
 * "door" into a full route with a cinematic veil.
 *
 * Three roles share the world but never the same room: each `CampusTheme`
 * changes palette, fog, layout, lighting, hover behaviour and the transition
 * used when a destination opens.
 */

export type CampusRole = "admin" | "instructor" | "student";

export type CampusLayout = "ring" | "stage" | "constellation";
export type CampusHover = "scan" | "spotlight" | "bloom";
export type CampusTransition = "cut" | "iris" | "wipe";

export type CampusTheme = {
  role: CampusRole;
  /** Room name shown in the HUD, e.g. "Control Deck". */
  stage: string;
  tagline: string;
  /** three.js colours (hex numbers). */
  background: number;
  fogColor: number;
  fogNear: number;
  fogFar: number;
  floor: number;
  grid: number;
  structure: number;
  accent: number;
  accentSecondary: number;
  /** Same accent as a CSS colour for the 2D chrome. */
  accentCss: string;
  layout: CampusLayout;
  ringRadius: number;
  radiusJitter: number;
  yJitter: number;
  nodeY: number;
  particles: number;
  hover: CampusHover;
  transition: CampusTransition;
  ambient: number;
  ambientIntensity: number;
  keyIntensity: number;
  rim: number;
  rimIntensity: number;
  cameraHeight: number;
  cameraRadius: number;
  autoOrbit: number;
};

export const CAMPUS_THEMES: Record<CampusRole, CampusTheme> = {
  admin: {
    role: "admin",
    stage: "Control Deck",
    tagline: "Command every classroom, roster and announcement.",
    background: 0x0a0d1c,
    fogColor: 0x0a0d1c,
    fogNear: 12,
    fogFar: 34,
    floor: 0x0d1226,
    grid: 0x3b4ee0,
    structure: 0x151b36,
    accent: 0xffa53d,
    accentSecondary: 0x5b7cff,
    accentCss: "#ffa53d",
    layout: "ring",
    ringRadius: 7.8,
    radiusJitter: 0,
    yJitter: 0,
    nodeY: 1.95,
    particles: 190,
    hover: "scan",
    transition: "cut",
    ambient: 0x8fa3ff,
    ambientIntensity: 0.42,
    keyIntensity: 2.1,
    rim: 0x4b5cff,
    rimIntensity: 1.5,
    cameraHeight: 1.95,
    cameraRadius: 3.1,
    autoOrbit: 0.05,
  },
  instructor: {
    role: "instructor",
    stage: "Lecture Stage",
    tagline: "Teach the room, publish the notice, guide the exam.",
    background: 0x07161a,
    fogColor: 0x07161a,
    fogNear: 11,
    fogFar: 30,
    floor: 0x0a1f24,
    grid: 0x1fb6a6,
    structure: 0x123037,
    accent: 0x35e0c8,
    accentSecondary: 0xffc46b,
    accentCss: "#35e0c8",
    layout: "stage",
    ringRadius: 7.2,
    radiusJitter: 0.35,
    yJitter: 0.55,
    nodeY: 2.05,
    particles: 130,
    hover: "spotlight",
    transition: "iris",
    ambient: 0x9fe8dd,
    ambientIntensity: 0.38,
    keyIntensity: 2.4,
    rim: 0xffc46b,
    rimIntensity: 1.3,
    cameraHeight: 2.05,
    cameraRadius: 3.4,
    autoOrbit: 0.035,
  },
  student: {
    role: "student",
    stage: "Study Atrium",
    tagline: "Browse classrooms, read announcements, collect materials.",
    background: 0x0a1420,
    fogColor: 0x0a1420,
    fogNear: 10,
    fogFar: 32,
    floor: 0x0f1e2c,
    grid: 0x3ba9ff,
    structure: 0x16293a,
    accent: 0x57b6ff,
    accentSecondary: 0x8ce69a,
    accentCss: "#57b6ff",
    layout: "constellation",
    ringRadius: 6.6,
    radiusJitter: 1.15,
    yJitter: 0.95,
    nodeY: 1.9,
    particles: 160,
    hover: "bloom",
    transition: "wipe",
    ambient: 0xc7e5ff,
    ambientIntensity: 0.5,
    keyIntensity: 1.9,
    rim: 0x4be0a5,
    rimIntensity: 1.1,
    cameraHeight: 1.9,
    cameraRadius: 3.0,
    autoOrbit: 0.06,
  },
};

export type DestinationIcon = ComponentType<{ className?: string }>;

/** A destination that opens in the campus overlay panel. */
export type PanelDestination = {
  kind: "panel";
  id: string;
  label: string;
  /** Short code drawn on the 3D card, e.g. "SUB". */
  code: string;
  blurb: string;
  icon: DestinationIcon;
  roles: CampusRole[];
  /** Initial entry for the panel's memory router. */
  path: string;
};

/** A destination that leaves the campus through a route (a real "door"). */
export type RouteDestination = {
  kind: "route";
  id: string;
  label: string;
  code: string;
  blurb: string;
  icon: DestinationIcon;
  roles: CampusRole[];
  to: string;
};

export type Destination = PanelDestination | RouteDestination;

const ALL: CampusRole[] = ["admin", "instructor", "student"];
const STAFF: CampusRole[] = ["admin", "instructor"];

export const DESTINATIONS: Destination[] = [
  {
    kind: "panel",
    id: "dashboard",
    label: "Dashboard",
    code: "DASH",
    blurb: "Stats, trends and the day's snapshot.",
    icon: LayoutDashboard,
    roles: ALL,
    path: "/",
  },
  {
    kind: "panel",
    id: "subjects",
    label: "Classrooms",
    code: "SUBJ",
    blurb: "Search, filter and open every subject.",
    icon: BookOpen,
    roles: ALL,
    path: "/subjects",
  },
  {
    kind: "panel",
    id: "subject-create",
    label: "New subject",
    code: "NEW+",
    blurb: "Add a course to the catalogue.",
    icon: Plus,
    roles: ["admin"],
    path: "/subjects/create",
  },
  {
    kind: "panel",
    id: "notices",
    label: "Notice board",
    code: "NOTE",
    blurb: "Announcements, pinned first.",
    icon: Megaphone,
    roles: ALL,
    path: "/notices",
  },
  {
    kind: "panel",
    id: "notice-create",
    label: "Post notice",
    code: "POST",
    blurb: "Publish an announcement to a classroom.",
    icon: Pin,
    roles: STAFF,
    path: "/notices/create",
  },
  {
    kind: "panel",
    id: "notice-manage",
    label: "Manage notices",
    code: "EDIT",
    blurb: "Edit or remove anything on the board.",
    icon: Settings2,
    roles: ["admin"],
    path: "/notices/manage",
  },
  {
    kind: "panel",
    id: "schedule",
    label: "Exam guidance",
    code: "EXAM",
    blurb: "Pre-exam suggestions linked to materials.",
    icon: CalendarDays,
    roles: ALL,
    path: "/subjects",
  },
  {
    kind: "panel",
    id: "gradebook",
    label: "Gradebook",
    code: "MRKS",
    blurb: "Per-subject scores and letter grades.",
    icon: Gauge,
    roles: STAFF,
    path: "/subjects",
  },
  {
    kind: "panel",
    id: "authoring",
    label: "Subject editor",
    code: "EDIT",
    blurb: "Fix details on an existing subject.",
    icon: Pencil,
    roles: ["admin"],
    path: "/subjects",
  },
  {
    kind: "route",
    id: "classroom-3d",
    label: "Live classroom",
    code: "3D",
    blurb: "Walk a lesson in session — a scroll-driven room.",
    icon: Box,
    roles: ALL,
    to: "/classroom-3d",
  },
];

export const destinationsForRole = (role: CampusRole): Destination[] =>
  DESTINATIONS.filter((destination) => destination.roles.includes(role));

export const isCampusRole = (value: unknown): value is CampusRole =>
  value === "admin" || value === "instructor" || value === "student";

/** Per-role light-dot cluster colour used by the HUD rail. */
export const ROLE_LABEL: Record<CampusRole, string> = {
  admin: "Administrator",
  instructor: "Instructor",
  student: "Student",
};
