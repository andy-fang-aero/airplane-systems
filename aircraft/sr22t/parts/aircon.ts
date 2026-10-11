/**
 * Air conditioning hardware.
 * May import anchors only from earlier sections:
 * catalogue.ts, airframe.ts, surfaces.ts, cowl.ts, gear.ts, engine.ts, engine-ignition.ts, engine-oil.ts, engine-air.ts, engine-sensors.ts, structure.ts, cabin.ts, cockpit.ts, electrical.ts, avionics.ts, pitot.ts, fuel.ts, environment.ts.
 * Side-effect-free helpers may come from ../geometry, ../model and ../rig.
 * Shared constants belong in catalogue.ts; later sections must never be imported here.
 */
import * as THREE from "three";
import { glowAnim } from "@/lib/anims";
import type { Vec3 } from "@/lib/math";
import { ACCESSORY_FACE_X, CRANK_Y, IN } from "../engine-datum";
import { mergeGeos } from "@/lib/geometry";
import { botY, box, cyl } from "../geometry";
import { acCompressorOn } from "../model";
import { useSR22T } from "../store";
import { part } from "./catalogue";
import { valveEnv } from "./environment";

/* ---------- air conditioning ---------- */
// R134A vapor cycle: compressor → condenser → receiver-drier → expansion valve → evaporator → compressor (POH 7-65;
// AMM 21-50 PDF p. 496). Part centres; the refrigerant lines in flows.ts start and end on them.
const condY = botY(-0.25) + 0.054;
/** Pulley plane: the drive unit and compressor clutch pulleys are coplanar (AMM 21-50 PDF p. 503: a straight edge across
 * both). Station: the whole unit hangs aft of the crankcase pads and magnetos, between the engine and the
 * firewall, its head near the pad plane (Fig 21-50-1 sheet 2 PDF p. 520; Fig 71-00-2 sheet 1 PDF p. 2487; Fig 21-50-2
 * PDF p. 523; Fig 71-00-1 sheet 2 PDF p. 2484). 4.0 in. aft of the accessory face puts the clutch pulley's aft face
 * 31 mm forward of the firewall and keeps the drive pulley over the oil filter; approximate: no drawing
 * dimensions the drive unit or the station. */
export const AC_PULLEY_X = ACCESSORY_FACE_X - 4.0 * IN;
/** Clutch pulley width (approximate, undimensioned). */
const CLUTCH_W = 0.025;
/** Compressor body radius and length along x, from the clutch pulley's forward face to the head; approximate, neither
 * document dimensions it (Fig 21-50-2 PDF p. 523 proportions; 0.12 m so the head ends about 3 cm forward of the
 * accessory face). */
export const AC_COMPRESSOR_R = 0.055;
export const AC_COMPRESSOR_LEN = 0.12;
export const AC: Record<
  "compressor" | "condenser" | "receiver" | "blower" | "expansion" | "evaporator" | "recircValve" | "recircInlet",
  Vec3
> = {
  // compressor body centre. Upper left rear: cantilevered from the drive unit on the LH AND20000
  // accessory pad, outboard of and above it, over the oil cooler and the oil filter; axis fore-and-aft, clutch pulley aft,
  // head and hose fittings forward (AMM 21-50 PDF pp. 499–503; Fig 21-50-1 sheet 2 PDF p. 520; Fig 21-50-2 PDF p. 523;
  // Fig 71-00-2 sheets 1–2 item 2 PDF pp. 2487–2488; Fig 71-00-1 sheet 2 aft view item 15 PDF p. 2484). Offset from the
  // drive pulley scaled from that SR22 aft view and fitted over the filter; approximate (±1 in.). Station: the body runs
  // forward from the clutch pulley's forward face (AC_PULLEY_X).
  compressor: [AC_PULLEY_X + CLUTCH_W / 2 + AC_COMPRESSOR_LEN / 2, 0.1, -0.17],
  // under the baggage compartment floor (AMM 21-50 PDF p. 496), below the pitch servo and above the marker beacon sled
  // (POH 7-89); the blower sits 6 mm higher than the condenser so it stays clear of the sled too
  condenser: [-0.25, condY, 0],
  receiver: [-0.115, condY + 0.01, 0.1],
  blower: [-0.08, condY + 0.006, -0.06],
  // under the front passenger (RH crew) seat (POH 7-64; AMM 21-50 PDF p. 496), forward of the main spar and wing attach
  // fittings and above the static water trap; position approximate
  evaporator: [1.225, -0.562, 0.33],
  expansion: [1.11, -0.552, 0.38],
  // on top of the evaporator cover (POH Fig 7-14 RECIRCULATION CHECK VALVE)
  recircValve: [1.225, -0.522, 0.33],
  // cabin air under the RH crew seat, aft of the evaporator, drawn in through the cover in recirculation
  recircInlet: [1.06, -0.49, 0.33],
};
/** LH upper-rear AND20000 accessory drive pad on the accessory mounting face: Continental M-18 Fig 5-33 rear view (p. 5-53,
 * PDF p. 148) "PAD IAW AND20000", centre about 5.8 in. above and 2.5 in. left of the crankshaft CL (scaled, ±0.3 in.).
 * The drive unit mounts on it with a gasket and four nuts (AMM 21-50 Installation (b), PDF p. 501). */
export const AC_PAD: Vec3 = [ACCESSORY_FACE_X, CRANK_Y + 5.8 * IN, -2.5 * IN];
/** Drive unit pulley, coaxial with the pad (Fig 71-00-1 sheet 2 aft view, PDF p. 2484); Ø ≈ 4 in. scaled, approximate. */
export const AC_DRIVE_PULLEY: Vec3 = [AC_PULLEY_X, AC_PAD[1], AC_PAD[2]];
export const AC_DRIVE_PULLEY_R = 2 * IN;
/** Compressor clutch pulley on the compressor's aft end, in the pulley plane; Ø ≈ 5.5 in. scaled (Fig 71-00-1 sheet 2),
 * approximate. */
export const AC_CLUTCH_PULLEY: Vec3 = [AC_PULLEY_X, 0.1, -0.17];
export const AC_CLUTCH_PULLEY_R = 2.75 * IN;
/** Pulley widths and belt section radius, approximate (undimensioned). */
const DRIVE_W = 0.02,
  BELT_R = 0.005;
/** Hose fittings on the compressor head's forward face, discharge above suction (Fig 21-50-1 sheet 2 PDF p. 520: the
 * hoses leave the head at its forward end). Clock positions approximate. */
const HEAD_X = AC.compressor[0] + AC_COMPRESSOR_LEN / 2 + 0.0055;
export const AC_FITTING: Record<"discharge" | "suction", Vec3> = {
  discharge: [HEAD_X, 0.12, -0.2],
  suction: [HEAD_X, 0.095, -0.205],
};
/** Belt pitch loop in the pulley plane: the far-side arc of each pulley and the two external tangent spans. */
export const acBeltLoop = (): Vec3[] => {
  const d = [AC_DRIVE_PULLEY[1], AC_DRIVE_PULLEY[2]],
    c = [AC_CLUTCH_PULLEY[1], AC_CLUTCH_PULLEY[2]],
    [r1, r2] = [AC_DRIVE_PULLEY_R + BELT_R, AC_CLUTCH_PULLEY_R + BELT_R];
  const len = Math.hypot(c[0] - d[0], c[1] - d[1]),
    u = Math.atan2(c[1] - d[1], c[0] - d[0]),
    phi = Math.acos((r1 - r2) / len);
  const arc = (o: number[], r: number, a0: number, a1: number, n = 24): Vec3[] =>
    Array.from({ length: n }, (_, i) => {
      const a = a0 + ((a1 - a0) * i) / n;
      return [AC_PULLEY_X, o[0] + r * Math.cos(a), o[1] + r * Math.sin(a)];
    });
  return [...arc(d, r1, u + phi, u + 2 * Math.PI - phi), ...arc(c, r2, u - phi, u + phi)];
};
/** Turnbuckle 9 from an ear on the drive unit to bracket 11 on the compressor, inboard of the belt and just forward of
 * the pulley plane (Fig 21-50-2 PDF p. 523, items 9, 11; Fig 71-00-2 sheet 1 PDF p. 2487); approximate. */
const TURNBUCKLE: [Vec3, Vec3] = [
  [AC_PULLEY_X + 0.02, 0.035, -0.09],
  [AC_PULLEY_X + 0.02, 0.1, -0.16],
];
/** Drive unit casting on the pad: drawn 5 mm aft of the accessory face and 5 mm above the drawn crankcase, so it reads
 * as seated without touching the left magneto drawn on the same pad (engine.ts MAGNETO; pad centres scaled from the
 * same Fig 5-33 view). It reaches aft to its pulley (Fig 21-50-2 PDF p. 523: the long drive shaft 3 runs through the
 * pulley into the pad). Size approximate. */
const DRIVE_UNIT_SIZE: Vec3 = [0.1, 0.042, 0.044];
const DRIVE_UNIT: Vec3 = [ACCESSORY_FACE_X - 0.0053 - DRIVE_UNIT_SIZE[0] / 2, AC_PAD[1], AC_PAD[2]];
/** Mounting arm from the drive unit up to the compressor's underside, where the long bolt 5 and nuts 7 hold it (Fig
 * 21-50-2 items 2, 5, 7; 21-50 Disassembly (c) PDF p. 499); approximate. */
const ARM: [Vec3, Vec3] = [
  [AC_PULLEY_X + 0.038, 0.022, -0.072],
  [AC_PULLEY_X + 0.038, 0.062, -0.14],
];
const placedAt = (g: THREE.BufferGeometry, at: Vec3) =>
  g.translate(at[0] - AC.compressor[0], at[1] - AC.compressor[1], at[2] - AC.compressor[2]);
const strut = (a: Vec3, b: Vec3, sx: number, sy: number) => {
  const v = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const g = box(sx, sy, v.length());
  g.lookAt(v);
  return placedAt(g, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
};
/** The compressor assembly the AMM removes and installs as one unit (21-50 Removal (j) PDF p. 499; Installation (b)
 * PDF p. 501; Fig 21-50-2 items 1–3, 9–11): compressor, clutch pulley, drive unit with its pulley, belt, turnbuckle and
 * mounting arm, about the compressor body centre. */
const compressorAssemblyGeo = () => {
  const belt = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(
      acBeltLoop().map((p) => new THREE.Vector3(...p)),
      true,
      "centripetal",
    ),
    192,
    BELT_R,
    6,
    true,
  );
  placedAt(belt, [0, 0, 0]);
  return mergeGeos([
    cyl(AC_COMPRESSOR_R, AC_COMPRESSOR_LEN, "x"),
    placedAt(cyl(AC_CLUTCH_PULLEY_R, CLUTCH_W, "x", 28), AC_CLUTCH_PULLEY),
    placedAt(cyl(AC_DRIVE_PULLEY_R, DRIVE_W, "x", 24), AC_DRIVE_PULLEY),
    placedAt(box(...DRIVE_UNIT_SIZE), DRIVE_UNIT),
    strut(...ARM, 0.03, 0.02),
    strut(...TURNBUCKLE, 0.008, 0.008),
    ...(["discharge", "suction"] as const).map((k) => placedAt(cyl(0.009, 0.015, "x", 12), AC_FITTING[k])),
    belt,
  ]);
};
const acRunning = () => {
  const { s, E } = useSR22T.getState();
  // the A/C command latches with the control panel (lead ruling, POH silent; see acCompressorOn)
  return acCompressorOn(s, E, valveEnv(s, E));
};

part(compressorAssemblyGeo, ["environment", "engine"], {
  pos: AC.compressor,
  color: "#7E8A93",
  anim: glowAnim("#7E8A93", acRunning, ["environment", "engine"], "#6EC9E6"),
  name: "A/C compressor",
  note: "Engine driven (POH 7-61, 7-65). Runs only with the engine running and the 5 A A/C COMPR breaker on A/C BUS 2 powered (POH 7-61). Upper left rear: drive unit on the LH AND20000 accessory pad (Continental M-18 Fig 5-33 PDF p. 148); compressor bolted to it, outboard and above, over the oil cooler and the oil filter, the whole unit hung aft of the crankcase pads and magnetos with its head near the pad plane (Fig 21-50-1 sheet 2 PDF p. 520; Fig 71-00-2 sheet 1 PDF p. 2487); belt and turnbuckle between the coplanar pulleys (AMM 21-50 PDF pp. 499–503; Fig 21-50-2 PDF p. 523; Fig 71-00-2 sheets 1–2 item 2 PDF pp. 2487–2488; Fig 71-00-1 sheet 2 aft view item 15 PDF p. 2484). Drawn as the one assembly the AMM removes and installs: compressor, clutch pulley, drive unit and pulley, belt, turnbuckle and mounting arm. The belt is tensioned at the turnbuckle to 0.25 in. deflection under about 8 lb (AMM 21-50 PDF p. 503). Its hoses leave the head forward and loop down and aft to the firewall (Fig 21-50-1 sheet 2 PDF p. 520). Offsets scaled; size and position approximate.",
  pin: true,
  groups: [],
});
part(() => box(0.2, 0.07, 0.2), ["environment"], {
  pos: AC.evaporator,
  color: "#6EC9E6",
  name: "A/C evaporator",
  note: "Under the front passenger seat (POH 7-64); the AMM says the RH crew seat, with the blower motor assembly bolted to it (AMM 21-50 PDF pp. 496, 504; Fig 21-50-1 sheet 3 items 22, 30, 31, PDF p. 521). With the A/C selected all cabin air passes through it (POH 7-64, 7-65). Condensate drains overboard through the belly (POH 7-65).",
});
part(() => box(0.03, 0.04, 0.04), ["environment"], {
  pos: AC.expansion,
  color: "#C9A227",
  name: "Expansion valve",
  note: "Integral to the evaporator assembly (AMM 21-50 PDF p. 496; Fig 21-50-1 sheet 3 PDF p. 521, item 32): a temperature-controlled metering valve regulating liquid refrigerant into the evaporator (POH 7-65). Position approximate.",
  pin: true,
});
// on top of the evaporator cover; opens in recirculation (maximum A/C) mode
part(() => box(0.12, 0.006, 0.08), ["environment"], {
  pos: AC.recircValve,
  color: "#4E9DB5",
  // follows the selection the panel last powered, like the fresh-air valve it pairs with (POH 7-61, 7-65)
  anim: (m: THREE.Object3D) => {
    const st = useSR22T.getState();
    m.rotation.z = valveEnv(st.s, st.E).recirc ? 0.6 : 0;
  },
  name: "Recirculation check valve",
  note: 'In recirculation mode "the fresh air valve closes and valves in the evaporator assembly open", recirculating cabin air through the coils (POH 7-65; RECIRCULATION CHECK VALVE, Fig 7-14 on 7-63). Recirculation needs the A/C on (POH 7-66). Shape and position approximate.',
  pin: true,
});
part(() => box(0.22, 0.06, 0.24), ["environment"], {
  pos: AC.condenser,
  color: "#6EC9E6",
  name: "A/C condenser",
  note: "Under the baggage compartment floor, with its integral blower fan and receiver-drier (AMM 21-50); the POH lists a condenser assembly without a location (POH 7-61). Size and position approximate.",
});
part(() => cyl(0.025, 0.08, "y"), ["environment"], {
  pos: AC.receiver,
  color: "#4E9DB5",
  name: "Receiver-drier",
  note: "Clamped to the condenser (AMM 21-50 PDF p. 508; Fig 21-50-1 sheet 4 PDF p. 522, item 33). Filters the refrigerant, removes moisture and keeps a steady flow of liquid to the expansion valve (POH 7-65). Position approximate.",
  pin: true,
});
part(() => cyl(0.045, 0.06, "x"), ["environment"], {
  pos: AC.blower,
  color: "#5A6A74",
  // AMM 21-50 General p. 1 (PDF p. 496) gives the feed, not blower run logic.
  // Modelling assumption (2026-10-08): runs with the compressor, provided its own feed is powered.
  anim: glowAnim("#5A6A74", () => useSR22T.getState().E.acCondPwr && acRunning(), ["environment"], "#6EC9E6"),
  name: "Condenser blower",
  note: "Integral to the condenser assembly, joined to it by a coupling, with an outlet duct to the exhaust screen (AMM 21-50 PDF pp. 496, 507–508; Fig 21-50-1 sheet 4 PDF p. 522, item 34). Powered through the 15 A A/C COND breaker on A/C BUS 1 (POH 13772-007 7-61). Runs whenever the compressor runs and this feed is powered (modelling assumption, 2026-10-08; AMM 21-50 General p. 1, PDF p. 496, does not specify blower run logic). Position approximate.",
  pin: true,
});
