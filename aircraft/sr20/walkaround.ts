/**
 * SR20 G6 study walk, POH 11934-005 Reissue A, pp. 4-4–4-9, Figure 4-1.
 * Every lettered basic-POH inspection in source order. This Lycoming/Perspective+ configuration has no oxygen or FIKI
 * checklist. Positions are approximate display framing; inspection actions and numerical standards come from the POH.
 */
import { toVec3, type Vec3 } from "@/lib/math";
import type { SysId } from "@/lib/systems";
import { onSkin, wingP, WTIP } from "./geometry";
import type { Sim } from "./model";

export interface CameraPose {
  p: Vec3;
  t: Vec3;
}
export interface WalkItem {
  id: string;
  text: string;
  standard: string;
  parts: string[];
  /** Part name or point anchoring the label and camera instead of averaging the highlighted parts. */
  target?: string | Vec3;
  /** Inspection side override for unique belly hardware reached from either fuselage side. */
  side?: "L" | "R" | "any";
  system: SysId;
  ref: string;
  why?: string;
  note?: string;
  steps?: string[];
  crouch?: boolean;
  sim?: (s: Sim) => void;
}
export interface WalkStation {
  n: number;
  title: string;
  side?: "L" | "R";
  cam: CameraPose;
  map: [number, number];
  warning?: string;
  note?: string;
  items: WalkItem[];
}

export const SOURCE_URL = "https://www.palomaraviation.com/pdf/sr20-g6-poh.pdf";
export const SOURCE = "SR20 POH 11934-005 Reissue A · 4-4–4-9 · Figure 4-1";
export const EYE_Y = 0.26; // approximate: GROUND_Y + 1.65 m standing height
export const CROUCH_Y = -0.29; // approximate: GROUND_Y + 1.1 m crouched height
export const GENERAL_WARNING =
  "Before inspection, verify required maintenance, plan the flight, and calculate weight and balance and performance.";
export const THROUGHOUT = [
  "Check hinges, pins and bolts for security; skin for damage or delamination.",
  "Check controls for proper movement and excessive free play, and reservoirs and lines for leaks.",
  "Remove all frost, ice, snow and slush; controls and wheel fairings must be clear of internal ice and debris.",
  "In cold weather, verify the pitot probe warms within 30 seconds of selecting heat ON. The probe may be hot.",
];
/** Physical inspection details omitted from the scene are named explicitly, rather than substituted with other equipment. */
export const NOT_MODELLED: Record<string, string> = {
  "Required documents": "Paperwork is outside the 3D model.",
  "Parachute cover": "Cover/seal condition is not simulated.",
  "Tail tiedown": "Rings, ropes and removal are not simulated.",
  "Stabilizer inspection-hole tape": "Tape attachment is a physical inspection.",
  "Control attachment hardware": "Individual bolts, safety wire and cotter pins are not all modelled.",
  "Aileron gap seal": "Seal condition is not simulated.",
  "Flap rub strips (if installed)": "Installation and wear are not simulated.",
  "Chocks and tiedown ropes": "Removal is a physical action.",
  "Oil service door": "Access-door security is a physical check.",
  "Tow bar": "Removal and stowage are physical actions.",
  "External power door": "Receptacle is shown; access-door security is a physical check.",
  "CAPS safety pin": "Handle is shown; removable safety pin is not simulated.",
};

const item = (
  id: string,
  text: string,
  standard: string,
  parts: string[],
  system: SysId,
  extra: Partial<WalkItem> = {},
): WalkItem => ({
  id,
  text,
  standard,
  parts,
  system,
  ref: `POH 4-${[5, 6, 6, 6, 6, 7, 7, 7, 8, 8, 8, 8, 9][Number.parseInt(id) - 1]}`,
  ...extra,
});
const power = (key: "bat1" | "bat2" | "avionics", on: boolean) => (s: Sim) => {
  s.elec[key] = on;
};
const heat = (on: boolean) => (s: Sim) => {
  s.pitot.heat = on;
};
const lightL = "Left wingtip: nav (red) + strobe",
  lightR = "Right wingtip: nav (green) + strobe";
const boltNote = "Verify the bolt under the inboard aileron edge is secured with safety wire (POH 4-7 and 4-9).";

export const WALK: WalkStation[] = [
  {
    n: 1,
    title: "Cabin",
    cam: { p: [-0.2, EYE_Y, -1.35], t: [1.8, -0.1, -0.05] },
    map: [1.55, 0],
    items: [
      item("1a", "Required Documents", "ON BOARD", ["Required documents"], "cabin"),
      item("1b", "AVIONICS Switch", "OFF", ["AVIONICS switch"], "electrical", { sim: power("avionics", false) }),
      item("1c", "BAT 2 Switch", "ON", ["BAT 2 switch"], "electrical", { sim: power("bat2", true) }),
      item("1d", "PFD", "VERIFY ON", ["PFD bezel"], "avionics", {
        why: "This check precedes BAT 1: the PFD is supplied by the essential battery circuit.",
      }),
      item("1e", "Essential Bus Voltage", "23–25 VOLTS", ["PFD bezel"], "electrical"),
      item("1f", "Flap Position Light", "OUT", ["FLAPS switch"], "flaps", {
        why: "BAT 2 alone does not supply the flap motor's nonessential bus.",
      }),
      item("1g", "BAT 1 Switch", "ON", ["BAT 1 switch"], "electrical", { sim: power("bat1", true) }),
      item(
        "1h",
        "Avionics Cooling Fan",
        "AUDIBLE",
        ["PFD cooling fan", "MFD cooling fan", "Integrated avionics cooling fan"],
        "avionics",
        {
          why: "Listen at the panel; fan sound and operation cannot be established from this silent model.",
        },
      ),
      item("1i", "AVIONICS Switch", "ON", ["AVIONICS switch"], "electrical", { sim: power("avionics", true) }),
      item("1j", "Fuel Quantity", "CHECK", ["MFD bezel", "Filler cap"], "fuel", {
        why: "The subsequent wing checks verify quantity at each filler; displayed quantities alone are not the whole inspection.",
      }),
      item("1k", "Fuel Selector", "SELECT FULLER TANK", ["Fuel selector valve"], "fuel", {
        sim: (s) => {
          s.fuel.sel = s.fuel.qL >= s.fuel.qR ? "L" : "R";
        },
      }),
      item("1l", "Flaps", "100%, CHECK LIGHT ON", ["FLAPS switch", "Left flap", "Right flap"], "flaps", {
        sim: (s) => {
          s.flaps.cmd = 100;
        },
      }),
      item(
        "1m",
        "Lights",
        "CHECK OPERATION",
        [lightL, lightR, "Wingtip landing light", "Ice inspection light"],
        "lighting",
        {
          sim: (s) => {
            s.lights.nav = s.lights.strobe = s.lights.land = s.lights.ice = true;
          },
        },
      ),
      item("1n", "Stall Warning System Inlet", "UNOBSTRUCTED", ["Stall warning inlet"], "pitot"),
      item("1o", "Stall Warning", "TEST", ["Stall warning inlet"], "pitot", {
        note: "Apply suction to the inlet and verify the warning horn sounds. This study scene does not perform the physical test.",
      }),
      item("1p", "Pitot Heat", "ON · VERIFY PROBE HOT", ["PITOT HEAT switch", "Heated pitot tube"], "pitot", {
        target: "Heated pitot tube",
        sim: heat(true),
        note: "The probe may be hot. In cold weather, verify warming within 30 seconds (POH 4-4).",
      }),
      item("1q", "Pitot Heat", "OFF", ["PITOT HEAT switch"], "pitot", { sim: heat(false) }),
      item("1r", "AVIONICS Switch", "OFF", ["AVIONICS switch"], "electrical", { sim: power("avionics", false) }),
      item("1s", "BAT 1 and BAT 2 Switches", "OFF", ["BAT 1 switch", "BAT 2 switch"], "electrical", {
        sim: (s) => {
          s.elec.bat1 = s.elec.bat2 = false;
        },
      }),
      item("1t", "Alternate Static Source", "NORMAL", ["Alternate static valve"], "pitot", {
        sim: (s) => {
          s.pitot.alt = false;
        },
      }),
      item("1u", "Circuit Breakers", "IN", ["Circuit breaker panel"], "electrical", {
        sim: (s) => {
          s.cb = {};
        },
      }),
      item("1v", "Fire Extinguisher", "CHARGED AND AVAILABLE", ["Fire extinguisher"], "cabin"),
      item("1w", "Emergency Egress Hammer", "AVAILABLE", ["Armrest: egress hammer & hour meters"], "cabin"),
      item("1x", "CAPS Handle", "PIN REMOVED", ["CAPS activation T-handle", "CAPS safety pin"], "caps", {
        note: "Removing the safety pin is separate from pulling the activation handle. CAPS deployment is not part of preflight.",
      }),
    ],
  },
  {
    n: 2,
    title: "Left Fuselage",
    side: "L",
    cam: { p: [-0.7, EYE_Y, -2.3], t: [-0.15, -0.05, -0.3] },
    map: [-0.9, -1.7],
    items: [
      item("2a", "Door Lock", "UNLOCK", ["Cabin door key lock"], "cabin"),
      item("2b", "COM 1 Antenna (top)", "CONDITION AND ATTACHMENT", ["COM 1 antenna"], "avionics"),
      item("2c", "Transponder Antenna (underside)", "CONDITION AND ATTACHMENT", ["Transponder antenna"], "avionics", {
        side: "any",
        crouch: true,
      }),
      item("2d", "COM 2 Antenna (underside)", "CONDITION AND ATTACHMENT", ["COM 2 antenna"], "avionics", {
        crouch: true,
      }),
      item("2e", "Wing/Fuselage Fairing", "CHECK", ["Wing/fuselage fairing"], "airframe", {
        target: toVec3(wingP(-0.66, 0.4, 1)), // approximate: visible upper skin at the blended wing root
      }),
      item("2f", "Baggage Door", "CLOSED AND SECURE", ["Baggage door"], "cabin"),
      item("2g", "Static Button", "CHECK FOR BLOCKAGE", ["Static port (L)"], "pitot"),
      item("2h", "Parachute Cover", "SEALED AND SECURE", ["Parachute cover", "CAPS composite cover"], "caps"),
    ],
  },
  {
    n: 3,
    title: "Empennage",
    cam: { p: [-4.9, EYE_Y, -1.7], t: [-2.95, 0.15, 0] },
    map: [-4.6, 0],
    items: [
      item("3a", "Tiedown Rope", "REMOVE", ["Tail tiedown"], "airframe"),
      item(
        "3b",
        "Horizontal and Vertical Stabilizers",
        "CONDITION",
        ["Horizontal stabilizer", "Vertical stabilizer", "Stabilizer inspection-hole tape"],
        "airframe",
        {
          note: "Verify tape over the forward and aft inspection holes at the outboard horizontal stabilizer ends is installed and secure.",
        },
      ),
      item(
        "3c",
        "Elevator and Tab",
        "CONDITION AND MOVEMENT",
        ["Elevator (right half)", "Elevator (left half)", "Elevator trim tab (ground-adjustable)"],
        "controls",
      ),
      item("3d", "Rudder", "FREEDOM OF MOVEMENT", ["Rudder"], "controls"),
      item("3e", "Rudder Trim Tab", "CONDITION AND SECURITY", ["Rudder trim tab (ground-adjustable)"], "controls"),
      item("3f", "Attachment Hinges, Bolts, and Cotter Pins", "SECURE", ["Control attachment hardware"], "controls"),
    ],
  },
  {
    n: 4,
    title: "Right Fuselage",
    side: "R",
    cam: { p: [-0.7, EYE_Y, 2.3], t: [-0.15, -0.05, 0.3] },
    map: [-0.9, 1.7],
    items: [
      item("4a", "Static Button", "CHECK FOR BLOCKAGE", ["Static port (R)"], "pitot"),
      item("4b", "Wing/Fuselage Fairings", "CHECK", ["Wing/fuselage fairing"], "airframe", {
        target: toVec3(wingP(0.66, 0.4, 1)), // approximate: visible upper skin at the blended wing root
      }),
      item("4c", "Door Lock", "UNLOCK", ["Cabin door key lock"], "cabin"),
    ],
  },
  {
    n: 5,
    title: "Right Wing Trailing Edge",
    side: "R",
    cam: { p: [-1.1, EYE_Y, 3.7], t: [0.75, -0.35, 3.3] },
    map: [-0.6, 4],
    note: boltNote,
    items: [
      item(
        "5a",
        "Flap and Rub Strips (if installed)",
        "CONDITION AND SECURITY",
        ["Right flap", "Flap rub strips (if installed)"],
        "flaps",
      ),
      item(
        "5b",
        "Aileron and Tab",
        "CONDITION AND MOVEMENT",
        ["Right aileron", "Aileron trim tab (ground-adjustable)"],
        "controls",
      ),
      item("5c", "Aileron Gap Seal", "SECURITY", ["Aileron gap seal"], "controls"),
      item(
        "5d",
        "Hinges, Actuation Arm, Bolts, and Cotter Pins",
        "SECURE",
        ["Aileron hinge fairing", "Control attachment hardware"],
        "controls",
        { ref: "POH 4-7" },
      ),
    ],
  },
  {
    n: 6,
    title: "Right Wing Tip",
    side: "R",
    cam: { p: [0.9, EYE_Y, 7.4], t: [1.2, -0.15, 5.5] },
    map: [1.2, 7],
    items: [
      item("6a", "Tip", "ATTACHMENT", ["Wing tip"], "airframe", {
        target: toVec3(wingP(WTIP - 0.03, 0.3, 1)), // approximate: an inspection point on the rounded tip skin
      }),
      item(
        "6b",
        "Wing Tip Light and Lens",
        "CONDITION AND SECURITY",
        [lightR, "Wingtip landing light", "Aft position light (white)"],
        "lighting",
      ),
      item("6c", "Fuel Vent (underside)", "UNOBSTRUCTED", ["NACA fuel vent"], "fuel", { crouch: true }),
    ],
  },
  {
    n: 7,
    title: "Right Forward Wing and Main Gear",
    side: "R",
    cam: { p: [3.4, EYE_Y, 2.7], t: [1.4, -0.6, 1.9] },
    map: [3, 3.6],
    items: [
      item("7a", "Leading Edge and Stall Strips", "CONDITION", ["Wing leading edge", "Stall strips"], "airframe", {
        target: "Stall strips",
      }),
      item("7b", "Fuel Cap", "CHECK QUANTITY AND SECURE", ["Filler cap", "Fuel filler neck"], "fuel"),
      item("7c", "Fuel Drains (2 underside)", "DRAIN AND SAMPLE", ["Tank drain", "Collector drain"], "fuel", {
        crouch: true,
      }),
      item("7d", "Wheel Fairings", "SECURITY, ACCUMULATION OF DEBRIS", ["Wheel pant"], "gear"),
      item("7e", "Tire", "CONDITION, INFLATION, AND WEAR", ["Main wheel"], "gear"),
      item(
        "7f",
        "Wheel and Brakes",
        "FLUID LEAKS, EVIDENCE OF OVERHEATING, GENERAL CONDITION, AND SECURITY",
        ["Main wheel hub", "Brake caliper", "Brake disc", "Brake overheat indicator"],
        "gear",
      ),
      item("7g", "Chocks and Tiedown Ropes", "REMOVE", ["Chocks and tiedown ropes"], "gear"),
    ],
  },
  {
    n: 8,
    title: "Nose, Right Side",
    side: "R",
    cam: { p: [3.5, EYE_Y, 1.9], t: [2.55, -0.35, 0.45] },
    map: [3.6, 1.6],
    warning:
      "Do not operate the engine below six quarts on the dipstick. Seven quarts is recommended for extended flights (POH 4-7).",
    items: [
      item("8a", "Engine Oil", "CHECK 6–7 QUARTS, LEAKS", ["Oil filler cap / dipstick"], "engine"),
      item(
        "8b",
        "Engine Oil Dipstick/Filler Cap & Door",
        "SECURE",
        ["Oil filler cap / dipstick", "Oil service door"],
        "engine",
      ),
      item("8c", "Ice Inspection Light", "CONDITION AND SECURITY", ["Ice inspection light"], "lighting"),
      item("8d", "Cowling", "ATTACHMENTS SECURE", ["Cowling inspection region"], "airframe", {
        target: toVec3(onSkin(3.1, -0.15, 1, 1)), // approximate inspection point on the actual cowl side skin
        note: "The cowl is part of the displayed shell; inspect its actual attachments.",
      }),
      item("8e", "Exhaust Pipe", "CONDITION, SECURITY, AND CLEARANCE", ["Exhaust tailpipe"], "engine"),
    ],
  },
  {
    n: 9,
    title: "Nose Gear, Propeller, and Spinner",
    cam: { p: [5.5, EYE_Y, 0.7], t: [3.5, -0.4, 0] },
    map: [5.4, 0],
    warning: "Keep clear of the propeller rotation plane and keep others away from the propeller (POH 4-8).",
    items: [
      item("9a", "Tow Bar", "REMOVE AND STOW", ["Tow bar"], "gear"),
      item("9b", "Strut", "CONDITION", ["Nose gear strut", "Nose oleo piston rod"], "gear"),
      item("9c", "Wheel Fairing", "SECURITY, ACCUMULATION OF DEBRIS", ["Nose wheel pant"], "gear"),
      item("9d", "Wheel and Tire", "CONDITION, INFLATION, AND WEAR", ["Nose wheel", "Nose wheel hub"], "gear"),
      item("9e", "Propeller", "CONDITION (INDENTATIONS, NICKS, ETC.)", ["Propeller blade"], "propeller"),
      item("9f", "Spinner", "CONDITION, SECURITY, AND OIL LEAKS", ["Spinner"], "propeller"),
      item("9g", "Air Inlets", "UNOBSTRUCTED", ["Right cowl inlet — induction", "Left cowl inlet — cooling"], "engine"),
    ],
  },
  {
    n: 10,
    title: "Nose, Left Side",
    side: "L",
    cam: { p: [3.5, EYE_Y, -1.9], t: [2.65, -0.3, -0.3] },
    map: [3.6, -1.6],
    items: [
      item("10a", "Ice Inspection Light", "CONDITION AND SECURITY", ["Ice inspection light"], "lighting"),
      item("10b", "Cowling", "ATTACHMENTS SECURE", ["Cowling inspection region"], "airframe", {
        target: toVec3(onSkin(3.1, -0.15, -1, 1)), // approximate inspection point on the actual cowl side skin
      }),
      item("10c", "External Power", "DOOR SECURE", ["External power door", "Ground service receptacle"], "electrical"),
      item("10d", "Gascolator (underside)", "DRAIN FOR 3 SECONDS, SAMPLE", ["Gascolator drain"], "fuel", {
        crouch: true,
      }),
    ],
  },
  {
    n: 11,
    title: "Left Main Gear and Forward Wing",
    side: "L",
    cam: { p: [3.4, EYE_Y, -2.7], t: [1.4, -0.6, -1.9] },
    map: [3, -3.6],
    items: [
      item("11a", "Wheel Fairings", "SECURITY, ACCUMULATION OF DEBRIS", ["Wheel pant"], "gear"),
      item("11b", "Tire", "CONDITION, INFLATION, AND WEAR", ["Main wheel"], "gear"),
      item(
        "11c",
        "Wheel and Brakes",
        "FLUID LEAKS, EVIDENCE OF OVERHEATING, GENERAL CONDITION, AND SECURITY",
        ["Main wheel hub", "Brake caliper", "Brake disc", "Brake overheat indicator"],
        "gear",
      ),
      item("11d", "Chocks and Tiedown Ropes", "REMOVE", ["Chocks and tiedown ropes"], "gear"),
      item("11e", "Fuel Drains (2 underside)", "DRAIN AND SAMPLE", ["Tank drain", "Collector drain"], "fuel", {
        crouch: true,
      }),
      item("11f", "Fuel Cap", "CHECK QUANTITY AND SECURE", ["Filler cap", "Fuel filler neck"], "fuel"),
      item("11g", "Leading Edge and Stall Strips", "CONDITION", ["Wing leading edge", "Stall strips"], "airframe", {
        target: "Stall strips",
      }),
    ],
  },
  {
    n: 12,
    title: "Left Wing Tip",
    side: "L",
    cam: { p: [2.5, EYE_Y, -7.1], t: [1.3, -0.2, -5.4] },
    map: [1.2, -7],
    items: [
      item("12a", "Fuel Vent (underside)", "UNOBSTRUCTED", ["NACA fuel vent"], "fuel", { crouch: true }),
      item("12b", "Pitot Probe", "COVER REMOVED, UNOBSTRUCTED", ["Heated pitot tube"], "pitot"),
      item(
        "12c",
        "Wing Tip Light and Lens",
        "CONDITION AND SECURITY",
        [lightL, "Wingtip landing light", "Aft position light (white)"],
        "lighting",
      ),
      item("12d", "Tip", "ATTACHMENT", ["Wing tip"], "airframe", {
        target: toVec3(wingP(-WTIP + 0.03, 0.3, 1)), // approximate: an inspection point on the rounded tip skin
      }),
    ],
  },
  {
    n: 13,
    title: "Left Wing Trailing Edge",
    side: "L",
    cam: { p: [-1.1, EYE_Y, -3.7], t: [0.75, -0.35, -3.3] },
    map: [-0.6, -4],
    note: boltNote,
    items: [
      item(
        "13a",
        "Hinges, Actuation Arm, Bolts, and Cotter Pins",
        "SECURE",
        ["Aileron hinge fairing", "Control attachment hardware"],
        "controls",
      ),
      item("13b", "Aileron Gap Seal", "SECURITY", ["Aileron gap seal"], "controls"),
      item("13c", "Aileron", "FREEDOM OF MOVEMENT", ["Left aileron"], "controls"),
      item(
        "13d",
        "Flap and Rub Strips (if installed)",
        "CONDITION AND SECURITY",
        ["Left flap", "Flap rub strips (if installed)"],
        "flaps",
      ),
    ],
  },
];
