/**
 * Side-effect-free SR20 G6 IO-390 installation anchors. Metres, schematic placement, not a measured installation.
 * POH 11934-005 Reissue A/Revision A1 7-33–7-40; AMM 12137-002 Reissue A/Revision A1 ATA 61, 71, 73, 74, 77–79.
 * Keep shared ports here so visible components, pipes and tests meet at the same point without registering parts.
 */
import type { Vec3 } from "@/lib/math";

export const CRANK_Y = -0.14;
export const PROP: Vec3 = [3.8, CRANK_Y, 0];
export const CYLS = [
  { n: 1, x: 3.36, s: 1 },
  { n: 2, x: 3.22, s: -1 },
  { n: 3, x: 2.99, s: 1 },
  { n: 4, x: 2.85, s: -1 },
] as const;
export type Cylinder = (typeof CYLS)[number];
export const cylOrigin = (c: Cylinder): Vec3 => [c.x, CRANK_Y, c.s * 0.25];
export const cylPoint = (c: Cylinder, v: Vec3): Vec3 => [c.x + v[0], CRANK_Y + v[1], c.s * 0.25 + v[2]];
export type PlugLevel = "U" | "L";
export const plugMag = (c: Cylinder, level: PlugLevel): "R" | "L" => (c.s > 0 === (level === "L") ? "R" : "L");
export const plugPoint = (c: Cylinder, level: PlugLevel): Vec3 =>
  cylPoint(c, [-0.12, level === "U" ? 0.065 : -0.065, c.s * 0.13]);
export const MAGNETO = (mag: "R" | "L"): Vec3 => [2.72, -0.04, mag === "R" ? 0.11 : -0.11];
export const SLICKSTART: Vec3 = [2.64, 0.065, 0.26];
export const STARTER: Vec3 = [3.46, -0.32, -0.13];
export const GOVERNOR: Vec3 = [3.48, -0.04, -0.16];
export const PROP_OIL: Vec3 = [3.78, CRANK_Y, 0];
export const THROTTLE: Vec3 = [3.43, -0.435, 0];
export const INDUCTION_PLENUM: Vec3 = [3.12, -0.365, 0];
export const INDUCTION_ENTRY: Vec3 = [3.715, -0.13, 0.22];
export const AIR_FILTER: Vec3 = [3.58, -0.15, 0.2];
export const ALT_AIR: Vec3 = [3.49, -0.23, 0.18];
export const ENGINE_FUEL_PUMP: Vec3 = [2.78, -0.27, 0.13];
export const FUEL_DIVIDER: Vec3 = [3.12, 0.075, 0];
export const FUEL_FLOW_SENSOR: Vec3 = [3.25, 0.065, 0.17];
export const injectorPoint = (c: Cylinder): Vec3 => cylPoint(c, [0.045, 0.035, c.s * 0.1]);
export const intakePort = (c: Cylinder): Vec3 => cylPoint(c, [0.03, -0.085, c.s * 0.055]);
export const exhaustPort = (c: Cylinder): Vec3 => cylPoint(c, [-0.035, -0.095, c.s * 0.095]);
/** A probe seated into each header, just below the cylinder; placement approximate. */
export const egtPoint = (c: Cylinder): Vec3 => [exhaustPort(c)[0], -0.29, c.s * 0.345];
export const MUFFLER: Vec3 = [3.04, -0.44, 0.285];
export const EXHAUST_COLLECTOR: Vec3 = [3.24, -0.43, 0.285];
export const TAILPIPE: Vec3[] = [
  [MUFFLER[0], MUFFLER[1], MUFFLER[2] + 0.14],
  [2.95, -0.56, 0.3],
  [2.85, -0.68, 0.22],
];
export const OIL_SUMP: Vec3 = [3.08, -0.38, 0];
export const OIL_SCREEN: Vec3 = [2.84, -0.405, 0];
export const OIL_PUMP: Vec3 = [2.82, -0.255, -0.025];
export const OIL_COOLER: Vec3 = [3.36, -0.1, -0.35];
export const OIL_FILTER: Vec3 = [2.83, -0.02, 0.21];
export const OIL_CONTROL: Vec3 = [2.875, -0.072, 0.16];
export const OIL_RELIEF: Vec3 = [2.85, -0.165, -0.12];
export const OIL_GALLERY: Vec3 = [3.15, -0.17, 0];
export const OIL_SEPARATOR: Vec3 = [2.65, 0.02, 0.32];
export const OIL_PRESSURE: Vec3 = [2.75, -0.16, 0.19];
export const OIL_TEMP: Vec3 = [2.9, -0.035, 0.21];
export const MAP_SENSOR: Vec3 = [3.08, -0.445, 0.075];
export const MAT_SENSOR: Vec3 = [3.19, -0.35, 0.13];
export const ENGINE_HARNESS: Vec3 = [2.66, 0.045, -0.23];
