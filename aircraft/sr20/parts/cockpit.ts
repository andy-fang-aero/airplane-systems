/** Cabin controls and service hardware absent from the base model.
 * Sources: SR20 POH 11934-005 7-13–15, 7-22–23, 7-34, 7-90–96; AMM12137-002 25-10.
 * All component dimensions and console offsets are illustrative. */
import { mergeGeos } from "@/lib/geometry";
import { mats } from "@/lib/materials";
import type { Vec3 } from "@/lib/math";
import { box, cyl, topY, tubeGeo } from "../geometry";
import { live } from "../model";
import { useSR20 } from "../store";
import { STACK } from "./cabin";
import { part } from "./catalogue";

export const CONSOLE_LEVERS: Vec3 = [1.68, -0.32, 0];
const state = () => useSR20.getState();
part(() => mergeGeos([box(0.05, 0.05, 0.07), cyl(0.024, 0.06, "z").translate(-0.03, -0.005, 0)]), ["cabin"], {
  pos: [1.69, topY(1.69) - 0.1, 0],
  color: "#20262B",
  name: "Magnetic compass",
  pin: true,
  note: "Internally lighted, liquid-filled magnetic compass with correction card on the headliner immediately above the windshield, if installed (POH 7-22; Fig 7-4 item 2). Fitted compass shown for the pre-2650 study configuration; check serial-specific equipment. Dimensions approximate.",
});
for (const [offset, name, color, value, note] of [
  [
    -0.035,
    "Power lever",
    "#20262B",
    () => state().s.eng.lever,
    "MAX-POWER-IDLE lever is mechanically cable-linked to the fuel-servo throttle and propeller governor. Commands 2500 RPM from idle through cruise and 2700 RPM at full power",
  ],
  [
    0.04,
    "Mixture lever",
    "#C8313B",
    () => state().s.eng.mix,
    "RICH-MIXTURE-CUTOFF lever is mechanically cable-linked to the fuel servo's sliding mixture valve; full aft shuts off fuel and the flow divider closes",
  ],
] as [number, string, string, () => number, string][])
  part(
    () => mergeGeos([box(0.012, 0.13, 0.012).translate(0, 0.125, 0), box(0.035, 0.03, 0.045).translate(0, 0.2, 0)]),
    ["engine", "cabin"],
    {
      pos: [CONSOLE_LEVERS[0], CONSOLE_LEVERS[1], offset],
      color,
      name,
      pin: true,
      pinIn: ["engine"],
      anim: (m) => {
        m.rotation.z = 0.35 * (1 - 2 * value());
      },
      note: `${note} (POH 11934-005 7-34, Fig 7-7). Lever size and angular motion schematic.`,
    },
  );
part(() => cyl(0.024, 0.012, "z", 24), ["engine", "cabin"], {
  pos: [1.68, -0.29, 0.136],
  color: "#4A535B",
  name: "Friction control wheel",
  pin: true,
  pinIn: ["cabin"],
  note: "FRICTION wheel on the right side of the console sets control-lever resistance to rotation for feel and setting stability (POH 7-34, Fig 7-7). Size and station approximate.",
});
part(() => box(0.004, 0.082, 0.1), ["flaps", "cabin"], {
  pos: STACK.at(0.08, 0.006, 0.04),
  rot: STACK.rot,
  color: "#20262B",
  fairing: true,
  name: "Flap switch panel",
  pin: true,
  pinIn: ["flaps"],
  note: "Airfoil flap selector at the foot of the console vertical section, with UP, 50% and 100% position lights (POH 7-23, Fig 7-4 item 10). Panel face shown behind the existing selector; dimensions approximate.",
});
for (const [cmd, offset, color, label] of [
  [0, 0.024, "#3FBF5F", "UP"],
  [50, 0, "#F2C230", "50%"],
  [100, -0.024, "#F2C230", "100%"],
] as const)
  part(() => cyl(0.0045, 0.006, "x", 12), ["flaps"], {
    pos: STACK.at(0.08 + offset, 0.012, 0.083),
    rot: STACK.rot,
    color,
    name: "Flap position light",
    pin: cmd === 0,
    anim: (m) => {
      const { s, E } = state();
      const target = cmd === 0 ? 0 : cmd === 50 ? 16 : 32;
      m.material =
        E.flapsPwr && s.flaps.cmd === cmd && Math.abs(live.flapAng - target) < 0.8
          ? mats(color).hi
          : mats("#3A3F44").on;
    },
    note: `${label} light (${cmd === 0 ? "green" : "yellow"}), illuminates at the selected flap position (POH 7-23). Shares 10 A FLAPS/NON ESS BUS with selector and actuator. Position tolerance used in this study animation is illustrative.`,
  });
part(() => cyl(0.011, 0.01, "x", 20), ["electrical", "cabin"], {
  pos: [1.564, -0.24, 0],
  color: "#15181B",
  name: "12 V convenience outlet",
  pin: true,
  pinIn: ["cabin"],
  note: "Pre-2901 G6 center-console cigarette-lighter receptacle, maximum draw 3.5 A; 5 A 12V & USB POWER breaker on MAIN BUS 3 (POH 7-95). Size and armrest face station approximate.",
});
for (const [x, y, name] of [
  [1.564, -0.24, "USB charging port (front)"],
  [1.176, -0.31, "USB charging port (rear)"],
] as const)
  for (const side of [-1, 1])
    part(() => box(0.008, 0.008, 0.014), ["electrical", "cabin"], {
      pos: [x, y, side * (x > 1.5 ? 0.028 : 0.11)],
      color: "#15181B",
      name,
      pin: side < 0,
      pinIn: ["cabin"],
      note: "One of four dedicated charging-only USB ports, two forward and two aft on the center console. No data/audio access. The 2220/2339–2900 configuration uses 15 W ports and the 5 A 12V & USB POWER breaker on MAIN BUS 3 (POH 7-96 Revision A1). Device draw must follow each port label. Shape and location approximate.",
    });
part(() => cyl(0.004, 0.008, "x", 12), ["cabin"], {
  pos: [1.564, -0.24, 0.046],
  color: "#15181B",
  name: "AUDIO INPUT jack",
  pin: true,
  note: "3.5 mm entertainment input near the console convenience outlet, selected through the audio panel (POH 7-90). Position and dimensions approximate.",
});
for (const side of [-1, 1])
  part(() => mergeGeos([cyl(0.0045, 0.008, "x", 12), cyl(0.004, 0.008, "x", 12).translate(0, -0.014, 0)]), ["cabin"], {
    pos: [1.176, -0.35, side * 0.11],
    color: "#15181B",
    name: "Rear passenger headset jacks",
    pin: side < 0,
    note: "Rear audio jacks on the aft console, if equipped. Rear occupants use intercom and selected entertainment/audio, without COM transmit (POH 7-90; Fig 7-4 item 12). Jack spacing and station approximate.",
  });
for (const [name, x] of [
  ["HOBBS hour meter", 1.48],
  ["FLIGHT hour meter", 1.4],
] as const)
  part(() => box(0.045, 0.01, 0.05), ["cabin", "electrical"], {
    pos: [x, -0.218, 0],
    color: "#20262B",
    name,
    pin: true,
    pinIn: ["cabin"],
    note:
      (name.startsWith("HOBBS")
        ? "Records with BAT 1 ON and either ALT 1 or ALT 2 ON"
        : "Records flight time beginning at approximately 35 KIAS, controlled by the integrated avionics unit") +
      ". Inside the center armrest storage compartment; 5 A FUEL QTY breaker on MAIN BUS 1 (POH 7-95). Size and layout schematic.",
  });
part(() => mergeGeos([cyl(0.006, 0.15, "x", 12), cyl(0.014, 0.06, "z", 16).translate(0.075, 0, 0)]), ["cabin"], {
  pos: [1.44, -0.23, 0.047],
  color: "#89949C",
  name: "Emergency egress hammer",
  pin: true,
  note: "Eight-ounce ball-peen hammer stored in the center armrest, accessible to either front occupant to break acrylic windows if the doors are jammed/inoperable (POH 7-95). Dimensions and placement schematic.",
});
for (const side of [-1, 1])
  part(
    () =>
      tubeGeo(
        [
          [1.24, -0.36, side * 0.18],
          [1.4, -0.28, side * 0.33],
          [1.24, -0.36, side * 0.48],
        ],
        0.009,
        0,
      ),
    ["cabin"],
    {
      color: "#454A4D",
      name: "Front lap restraint",
      pin: side < 0,
      note: "Lap portion of the four-point front restraint attaches to the seat frame; the buckle should be centered over the hips with the harness snug and no shoulder slack (POH 7-29–30). Webbing path and width illustrative without occupants.",
    },
  );
