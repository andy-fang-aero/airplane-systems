import type { Vec3 } from "@/lib/math";
import type { SysDef } from "@/lib/systems";

export const SYS: SysDef[] = [
  {
    id: "overview",
    name: "Overview",
    pg: "7-5",
    cam: [
      [9.4, 5.4, 12],
      [0.5, -0.2, 0],
    ],
    blurb: "",
  },
  {
    id: "airframe",
    name: "Airframe",
    pg: "7-5",
    cam: [
      [5.5, 5.5, 8],
      [0.6, -0.3, 0],
    ],
    blurb: "Composite shell, carry-through spar",
  },
  {
    id: "controls",
    name: "Flight controls",
    pg: "7-6",
    cam: [
      [-7, 4.8, 7.5],
      [-0.6, -0.1, 0],
    ],
    blurb: "Cables, push rods, spring trim",
  },
  {
    id: "flaps",
    name: "Wing flaps",
    pg: "7-22",
    cam: [
      [-3.8, 3.4, 6.8],
      [0.4, -0.5, 1.4],
    ],
    blurb: "Three-position electric flaps",
  },
  {
    id: "gear",
    name: "Gear & brakes",
    pg: "7-25",
    cam: [
      [5.6, -0.3, 5.4],
      [1.8, -0.95, 0],
    ],
    blurb: "Fixed tricycle, differential braking",
  },
  {
    id: "doors",
    name: "Doors",
    pg: "7-33",
    cam: [
      [4.4, 2.4, 5.2],
      [1.4, 0.05, 0.35],
    ],
    blurb: "Hinges, gas struts, dual latches",
  },
  {
    id: "engine",
    name: "Engine",
    pg: "7-33",
    cam: [
      [5.6, 1.2, 2.9],
      [3.1, -0.2, 0],
    ],
    blurb: "Controls, ignition, induction, oil",
  },
  {
    id: "propeller",
    name: "Propeller",
    pg: "7-40",
    cam: [
      [6.6, 1.0, -3.2],
      [3.5, -0.14, 0],
    ],
    blurb: "Single-lever governor logic",
  },
  {
    id: "fuel",
    name: "Fuel",
    pg: "7-41",
    cam: [
      [2.6, 7, 8],
      [1.0, -0.5, 0],
    ],
    blurb: "Wet wings, selector, boost pump",
  },
  {
    id: "electrical",
    name: "Electrical",
    pg: "7-49",
    cam: [
      [4.6, 3.0, 4.9],
      [1.6, -0.1, 0],
    ],
    blurb: "2 alts, 2 batteries, 10 buses",
  },
  {
    id: "lighting",
    name: "Lighting",
    pg: "7-59",
    cam: [
      [-4.5, 3.4, 8.5],
      [0.6, 0, 0],
    ],
    blurb: "Wingtip, landing, ice and cabin lights",
  },
  {
    id: "environment",
    name: "Environmental",
    pg: "7-62",
    cam: [
      [4.4, 1.8, 3.8],
      [2.0, -0.2, 0],
    ],
    blurb: "Heat, fresh air, optional A/C",
  },
  {
    id: "pitot",
    name: "Pitot-static & stall",
    pg: "7-69",
    cam: [
      [6.2, 4.8, -13],
      [0.2, -0.15, -1.2],
    ],
    blurb: "Heated pitot, static, stall horn",
  },
  {
    id: "avionics",
    name: "Avionics",
    pg: "7-73",
    cam: [
      [1.17, 0.15, 0.075],
      [2.28, -0.05, -0.095],
    ],
    blurb: "Displays, ADAHRS, GIAs, CAS",
  },
  {
    id: "cabin",
    name: "Cabin & safety",
    pg: "7-27",
    cam: [
      [3.2, 4.6, 5.2],
      [0.5, 0, 0],
    ],
    blurb: "Seats, restraints, ELT, egress",
  },
  {
    id: "caps",
    name: "CAPS",
    pg: "7-97",
    cam: [
      [-5.2, 4.0, 7.2],
      [-0.4, 0.2, 0],
    ],
    blurb: "Parachute system and deployment",
  },
];
export const CAPS_CAM: [Vec3, Vec3] = [
  [20, 9, 26],
  [0, 6, 0],
];
