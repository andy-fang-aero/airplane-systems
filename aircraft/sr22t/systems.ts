import type { Vec3 } from "@/lib/math";
import type { SysDef } from "@/lib/systems";

export const SYS: SysDef[] = [
  {
    id: "overview",
    name: "Overview",
    pg: "7-5",
    cam: [
      [7.5, 4.2, 9.5],
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
    id: "doors",
    name: "Doors",
    pg: "7-31",
    cam: [
      [3.5, 2.1, -4.1],
      [1.0, 0.15, 0],
    ],
    blurb: "Gull-wing cabin doors, baggage door",
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
    id: "engine",
    name: "Engine",
    pg: "7-31",
    cam: [
      [5.5, 1.6, 2.3],
      [3.1, -0.25, 0],
    ],
    blurb: "Controls, ignition, induction, oil, turbos",
  },
  {
    id: "propeller",
    name: "Propeller",
    pg: "7-39",
    cam: [
      [6.6, 1.0, -3.2],
      [3.5, -0.14, 0],
    ],
    blurb: "Fixed 2,500 RPM governor",
  },
  {
    id: "fuel",
    name: "Fuel",
    pg: "7-40",
    cam: [
      [2.6, 7, 8],
      [1.0, -0.5, 0],
    ],
    blurb: "Wet wings, selector, two-speed pump",
  },
  {
    id: "electrical",
    name: "Electrical",
    pg: "7-47",
    cam: [
      [4.6, 3.0, 4.9],
      [1.6, -0.1, 0],
    ],
    blurb: "2 alts, 2 batteries, 10 buses",
  },
  {
    id: "lighting",
    name: "Lighting",
    pg: "7-57",
    cam: [
      [-4.5, 3.4, 8.5],
      [0.6, 0, 0],
    ],
    blurb: "Wingtip, cowl landing, ice and cabin lights",
  },
  {
    id: "environment",
    name: "Environmental",
    pg: "7-61",
    cam: [
      [4.4, 1.8, 3.8],
      [2.0, -0.2, 0],
    ],
    blurb: "Heat, fresh air, A/C",
  },
  {
    id: "pitot",
    name: "Pitot-static & stall",
    pg: "7-68",
    cam: [
      [2.6, 2.0, -9.6],
      [0.4, -0.55, -1.4],
    ],
    blurb: "Heated pitot, static, stall horn",
  },
  {
    id: "ice",
    name: "Ice protection",
    pg: "7-13",
    ref: "AMM 13773-002 Rev 7 · 30-00 (PDF 1166–1169)",
    cam: [
      [7.5, 4.2, -11],
      [0.5, -0.2, 0],
    ],
    blurb: "TKS porous panels, pumps and wing tanks",
  },
  {
    id: "avionics",
    name: "Avionics",
    pg: "7-72",
    cam: [
      [1.17, 0.15, 0.075],
      [2.28, -0.05, -0.095],
    ],
    blurb: "Displays, ADAHRS, GIAs, CAS",
  },
  {
    id: "cabin",
    name: "Cabin & safety",
    pg: "7-26",
    cam: [
      [3.2, 4.6, 5.2],
      [0.8, 0, 0],
    ],
    blurb: "Seats, restraints, ELT, egress",
  },
  {
    id: "oxygen",
    name: "Oxygen",
    pg: "3-41",
    ref: "Precise Flight Built-In Oxygen AFMS (STC SA01708SE)",
    cam: [
      [-1.1, 3.9, 4.8],
      [0.25, 0.1, 0],
    ],
    blurb: "77 cu ft bottle, 5 outlets",
  },
  {
    id: "caps",
    name: "CAPS",
    pg: "7-95",
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
