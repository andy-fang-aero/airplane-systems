/**
 * Live Perspective+ displays for the SR22T G6: PFD, MFD (Engine Strip + map) and reversionary mode drawn with the shared
 * Garmin renderer (lib/avionics/g1000.ts, Perspective+ style), plus the MD302 standby (its own drawing).
 *
 * The SR22T has no flight model or autopilot sim: attitude follows the yokes and the air data is a fixed cruise picture
 * (approximately 147 KIAS / 156 KTAS, heading 360°; illustrative, derived from POH 5-32 (65%, ISA)). Pressure altitude
 * follows s.paFt, initially 4,000 ft. Engine and electrical readings come from the sim (`live`, the electrical solution).
 */
import {
  drawMFD,
  drawPFD,
  type Comparator,
  type FlightData,
  type Gauge,
  type MfdData,
  type PfdData,
  type SpeedBands,
} from "@/lib/avionics/g1000";
import { D2R, clamp } from "@/lib/math";
import { altAirOpen, casMessages, live, MAP_FULL, mapInHg, type BusId, type Elec, type Sim } from "./model";

export { drawOff } from "@/lib/canvas";

type Ctx = CanvasRenderingContext2D;
type Band = [number, number, "green" | "yellow" | "red" | "white"];

/**
 * Airspeed markings up to 17,500 ft MSL (POH 13772-007 2-5): white 64–110, green 74–176, yellow 176–205, red line 205 KIAS
 * (VNE 205, VNO 176, POH 2-4). Cyan references: Vr 77 (short-field rotation, 4-18), Vx 88 and Vy 103 (best angle and best
 * rate of climb, sea level, 4-3), best glide 92 KIAS (all weights, 3-10). The MD302 standby always shows these; the PFD
 * lowers them above 17,500 ft (pfdSpeeds).
 */
export const SPEEDS: SpeedBands = {
  white: [64, 110],
  green: [74, 176],
  yellow: [176, 205],
  red: 205,
  vr: 77,
  vx: 88,
  vy: 103,
  vg: 92,
};

/** Altitudes (ft) between which VNO and VNE fall linearly, and their values at the top (POH 2-4, 2-5; 25,000 ft is the maximum operating altitude, 2-19). */
const LIMIT_ALT: [number, number] = [17500, 25000],
  VNO_TOP = 150,
  VNE_TOP = 175;

const pair = ([lo, hi]: [number, number]): [number, number] => [lo, hi];

/**
 * PFD airspeed markings at a pressure altitude (POH 2-4, 2-5, PDF pp. 30–31): "VNO and upper limit of green arc is reduced
 * linearly from 17,500 feet to 25,000 feet"; "VNE and red line is reduced linearly from 17,500 feet to 25,000 feet." Up to
 * 17,500 ft it returns a copy of SPEEDS; above 25,000 ft it holds the 25,000 ft values. White, green bottom and the cyan references
 * don't change. The POH gives feet MSL; the model feeds it pressure altitude.
 */
export function pfdSpeeds(altFt: number): SpeedBands {
  const [a0, a1] = LIMIT_ALT;
  // a fresh object and fresh band tuples every call, so a caller can't change SPEEDS (the standby's base markings)
  const base = { ...SPEEDS, white: pair(SPEEDS.white!) };
  if (altFt <= a0) return { ...base, green: pair(SPEEDS.green!), yellow: pair(SPEEDS.yellow!) };
  const t = Math.min(1, (altFt - a0) / (a1 - a0)),
    vno = SPEEDS.green![1] + (VNO_TOP - SPEEDS.green![1]) * t,
    vne = SPEEDS.red! + (VNE_TOP - SPEEDS.red!) * t;
  return { ...base, green: [SPEEDS.green![0], vno], yellow: [vno, vne], red: vne };
}

/**
 * MD302 standby colour bars (POH 7-20): from the base SPEEDS at every altitude, since its markings "do not automatically
 * compensate for changes in VNE or VNO at altitudes above 17,500 feet".
 */
export const standbyBands = () => ({
  white: pair(SPEEDS.white!),
  green: pair(SPEEDS.green!),
  yellow: pair(SPEEDS.yellow!),
  red: SPEEDS.red!,
});

/**
 * Illustrative IAS from TAS and altitude in the ISA troposphere, assuming CAS≈IAS and EAS≈CAS.
 * Density ratio rho/rho0 = (1 - 0.0065 * altitudeMetres / 288.15)^4.25588; EAS = TAS * sqrt(rho/rho0).
 * No instrument/position or compressibility correction: this is not calibrated POH IAS.
 */
export function illustrativeIas(tas: number, altitudeFt: number): number {
  const densityRatio = (1 - (0.0065 * (altitudeFt * 0.3048)) / 288.15) ** 4.25588;
  return Math.round(tas * Math.sqrt(densityRatio));
}

/**
 * Fixed SR22T cruise point: illustrative, derived from POH 5-32 (65%, ISA): 156 KTAS at 4,000 ft.
 * IAS stays at that point; the displayed altitude follows Sim.paFt, initially 4,000 ft.
 */
const TAS = 156,
  IAS = illustrativeIas(TAS, 4000),
  HDG = 360,
  BARO = 29.92;

/** A breaker-fed load has power: its bus is live and its breaker is in. */
const pw = (s: Sim, E: Elec, bus: BusId, cb: string) => E[bus] > 0 && !s.cb[cb];
const pad = (n: number) => String(n).padStart(2, "0");
/** The Perspective+ PFD clock shows UTC (PG Fig 2-1). */
const clock = () => {
  const d = new Date();
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
};
/** Under the CAPS canopy the airspeed shows dashes. */
const ias = () => (live.capsT >= 0 ? 0 : IAS);

/** Which ADAHRS feeds the PFD: 1 or 2, or null with none valid. */
export type AdahrsSide = 1 | 2 | null;
/**
 * Dual ADAHRS reversion (installed per operator, 2026-10-08). Each ADAHRS contains an AHRS and an air data
 * computer and runs on its own breaker and bus (POH 7-75); MAG 1 feeds ADAHRS 1 and MAG 2 feeds ADAHRS 2 (POH Fig 7-17),
 * and heading needs the AHRS plus its magnetometer (POH 7-75; HSI, POH 7-21). When one unit is lost the avionics system
 * switches to the functioning AHRS (POH 3-43, AHRS Failure step 1), so the PFD keeps attitude, heading and air data from
 * the other side. Only with both lost do the red X's and yellow ATTITUDE FAIL / HDG flags appear (POH 3-43 notes). With a
 * single air data computer left, or none, the temperature-compensated altitudes cannot be compared: "VDI NO COMP" (POH 7-81).
 * ADAHRS 1 is the primary (POH 7-75: "the primary ADC"); the model prefers it while both are valid.
 */
export function adahrsSources(E: Elec): {
  att: AdahrsSide;
  air: AdahrsSide;
  hdg: AdahrsSide;
  oat: AdahrsSide;
  comp: string | null;
} {
  const att: AdahrsSide = E.adahrs1 ? 1 : E.adahrs2 ? 2 : null;
  const hdg: AdahrsSide = E.adahrs1 && E.mag1 ? 1 : E.adahrs2 && E.mag2 ? 2 : null;
  const comp = E.adahrs1 && E.adahrs2 ? null : "VDI NO COMP";
  // Selected-side ADC supplies OAT (POH 7-80/7-81); both probes read the shared ambient temperature.
  return { att, air: att, hdg, oat: att, comp };
}

/**
 * PFD sensor annunciations for the dual ADAHRS. Comparator boxes, black on white, post when one or both sensed values are
 * unavailable (Perspective+ PG 190-02183-01 Rev. A Fig 2-47, Table 2-4, p. 105–106): ALT and IAS from the air data
 * computers, PIT and ROL from the AHRS, HDG from the AHRS with its magnetometer. The VDI one reads "VDI NO COMP", black text
 * on a white background in the PFD's sensor comparison annunciation area (POH 7-81). The model has no miscompares: both
 * units read the same picture. "USING AHRS2" / "USING ADC2" show while PFD 1 shows data from ADAHRS 2 (PG Fig 2-48,
 * Table 2-5, p. 106).
 */
export function adahrsAnnunciations(E: Elec): { comparators: Comparator[]; reversionary: string[] } {
  const src = adahrsSources(E),
    both = E.adahrs1 && E.adahrs2,
    comparators: Comparator[] = [];
  if (!both) comparators.push({ at: "IAS", text: "IAS" }, { at: "ALT", text: "ALT" });
  if (src.comp) comparators.push({ at: "VDI", text: src.comp });
  if (!both) comparators.push({ at: "PIT", text: "PIT" }, { at: "ROL", text: "ROL" });
  if (!(both && E.mag1 && E.mag2)) comparators.push({ at: "HDG", text: "HDG" });
  const reversionary = [
    ...(src.att === 2 || src.hdg === 2 ? ["USING AHRS2"] : []),
    ...(src.air === 2 ? ["USING ADC2"] : []),
  ];
  return { comparators, reversionary };
}

function flight(s: Sim, E: Elec): FlightData {
  const dash: [string, string] = ["----", "----"];
  const src = adahrsSources(E);
  const xpdr = pw(s, E, "avx", "XPONDER");
  return {
    pitch: s.ctrl.pitch * 10,
    roll: s.ctrl.roll * 25,
    slip: 0,
    ias: ias(),
    tas: TAS,
    gs: TAS,
    alt: s.paFt,
    vs: 0,
    hdg: HDG,
    trk: HDG,
    baro: BARO,
    oat: s.pitot.oat,
    hdgBug: HDG,
    crs: HDG,
    cdi: 0,
    navSrc: "GPS",
    selAlt: s.paFt,
    pos: [0, 0],
    xtk: 0,
    // GIA 1: COM 1 + GPS NAV GIA 1 on ESS BUS 1; GIA 2: COM 2 + GPS NAV GIA 2 on MAIN BUS 2
    com1: pw(s, E, "ess1", "COM 1") ? undefined : dash,
    com2: pw(s, E, "main2", "COM 2") ? undefined : dash,
    nav1: pw(s, E, "ess1", "GPS NAV GIA 1") ? undefined : dash,
    nav2: pw(s, E, "main2", "GPS NAV GIA 2") ? undefined : dash,
    xpdr: xpdr ? "1200" : "----",
    xpdrMode: xpdr ? "ALT" : "FAIL",
    time: clock(),
    fail: src.att && src.hdg ? undefined : { att: !src.att, air: !src.air, hdg: !src.hdg },
  };
}

/** Power left with the alternate air door open: "expect 3-5% power loss" (POH 3A-11); the model takes the middle, 4%. */
export const ALT_AIR_POWER = 0.96;
/**
 * Percent power, illustrative: the display computes it from manifold pressure, IAS, OAT, pressure altitude, RPM and fuel flow
 * (POH 7-36), and the POH 5-32 cruise tables give % power against fuel flow only, with no manifold-pressure column. The model
 * scales 100% = 315 bhp at 2,500 RPM and MAP_FULL 36.0 in.Hg (POH 2-6, 4-17) with RPM and manifold pressure, times
 * ALT_AIR_POWER while the alternate air door is open (the % power indication shows the reduced power, POH 3A-11).
 * Null without ENGINE INSTR power, like the rest of the engine data.
 */
export const pctPower = (s: Sim, E: Elec, rpm = live.rpm) => {
  if (!E.eisPwr) return null;
  if (rpm < 200) return 0;
  return clamp(100 * (rpm / 2500) * (mapInHg(s, rpm) / MAP_FULL), 0, 100) * (altAirOpen(s) ? ALT_AIR_POWER : 1);
};

// No AFCS status: the model has no autopilot sim, and with the flight director off the Perspective+ AFCS row is blank (PG Fig 2-1).
export const pfdData = (s: Sim, E: Elec): PfdData => ({
  f: flight(s, E),
  speeds: pfdSpeeds(s.paFt),
  alerts: casMessages(s, E),
  pctPower: pctPower(s, E),
  style: "perspective",
  ...adahrsAnnunciations(E),
});

const level = (v: number | null, bands: Band[]): Gauge["alert"] => {
  if (v == null) return null;
  for (const [a, b, c] of bands)
    if (v >= a && v <= b) return c === "red" ? "warning" : c === "yellow" ? "caution" : null;
  return null;
};
const f0 = (v: number) => String(Math.round(v)),
  f1 = (v: number) => v.toFixed(1),
  sgn = (v: number) => (v > 0 ? "+" : "") + Math.round(v);

/**
 * Engine Strip (PG 190-02183-03 Fig 3-2; markings POH 2-9, electrical markings SR22T POH 13772-007 2-11), top to bottom, for what the model has: % Pwr (estimated,
 * see pctPower), RPM and Man "Hg as digital rows, fuel quantity L/R with fuel flow beside it, Batt 1 A and Ess Bus V.
 * RPM, manifold pressure, fuel quantity and the electrical values come from the sim; fuel flow is illustrative (no
 * fuel-flow model). GAL Used, oil, CHT and EGT aren't simulated and are left off. Main-bus volts and alternator amps are on
 * the ENGINE page, not the strip (POH 7-53), so they aren't drawn here (the Electrical panel shows them). Everything comes
 * through the Engine Airframe Unit (POH 7-33, 7-42, 7-53), so every item shows a red X when it loses ENGINE INSTR power.
 */
export function eisGauges(s: Sim, E: Elec): Gauge[] {
  const ok = E.eisPwr,
    v = (x: number) => (ok ? x : null);
  const g = (
    key: string,
    label: string,
    style: Gauge["style"],
    min: number,
    max: number,
    bands: Band[],
    value: number | null,
    fmt: (n: number) => string,
  ): Gauge => ({ key, label, style, min, max, bands, value, fmt, alert: level(value, bands) });
  const rpm = Math.round(live.rpm / 10) * 10;
  // Float sensors: FUEL QTY on MAIN BUS 1; red 0, yellow 0–14, green 14–46 gal
  // (POH 13772-007 2-10, 7-43). Each pointer takes its band's colour; fuel flow beside it.
  const fq = ok && pw(s, E, "main1", "FUEL QTY");
  // Illustrative, not a fuel-flow model: 38.5 GPH at full power / full rich sits inside the
  // AMM 13773-002 Rev 7 Fig 73-20-2 setup range 35–42 GPH (PDF p. 2592).
  const fullRich = 10 + s.eng.lever * 28.5;
  const ff = s.eng.running ? fullRich * s.eng.mix : 0;
  // POH 7-44: expanded green arc at ≤30.5 in.Hg. The model uses >30.5 across
  // the text's 30.5 / 30.6 gap; the narrow ±1 GPH band is illustrative.
  const narrow = mapInHg(s, live.rpm) > 30.5;
  const ffBands: Band[] = [[narrow ? fullRich - 1 : 10, narrow ? fullRich + 1 : fullRich, "green"]];
  const fuel: Gauge = {
    key: "fuel",
    label: "GAL",
    style: "tanks",
    min: 0,
    max: 46,
    bands: [
      [0, 0.5, "red"],
      [0.5, 14, "yellow"],
      [14, 46, "green"],
    ],
    value: fq ? s.fuel.qL : null,
    value2: fq ? s.fuel.qR : null,
    side: g("ff", "FFlow GPH", "bar", 0, 45, ffBands, v(ff), f1),
  };
  const pct = pctPower(s, E);
  return [
    g("pwr", "% Pwr", "dial", 0, 100, [[0, 100, "green"]], pct == null ? null : Math.round(pct), f0),
    // RPM: 0–3000, green 500–2550, red above 2550 (POH 2-9); the readout turns red with the RPM warning (POH 3-32;
    // > 2,560 RPM for 10 s or > 2,580 for 5 s, AMM 77-10), so it agrees with the CAS window
    {
      ...g(
        "rpm",
        "RPM",
        "text",
        0,
        3000,
        [
          [500, 2550, "green"],
          [2550, 3000, "red"],
        ],
        v(rpm),
        f0,
      ),
      alert: ok && s.eng.rpmWarn ? "warning" : null,
    },
    // manifold pressure: 10–40 in.Hg, green 15.0–36.5, yellow 36.5–37.5, red 37.5–40.0 (POH 2-9; sensor near the throttle body, 7-36)
    g(
      "map",
      'Man "Hg',
      "text",
      10,
      40,
      [
        [15, 36.5, "green"],
        [36.5, 37.5, "yellow"],
        [37.5, 40, "red"],
      ],
      v(mapInHg(s, live.rpm)),
      f1,
    ),
    fuel,
    g(
      "b1",
      "Batt 1 A",
      "text",
      -59,
      59,
      [
        [-59, -5, "yellow"],
        [-4, 59, "green"],
      ],
      v(E.b1),
      sgn,
    ),
    g(
      "ess",
      "Ess Bus V",
      "text",
      0,
      36,
      [
        [0, 24.4, "red"],
        [24.5, 32, "green"],
        [32, 36, "red"],
      ],
      v(E.ess1),
      f1,
    ),
  ];
}

const mfdData = (s: Sim, E: Elec, reversion: boolean): MfdData => ({
  ...pfdData(s, E),
  eis: eisGauges(s, E),
  reversion,
  page: "Map - Navigation Map",
});

/**
 * Reversionary mode: losing one display puts PFD symbology plus the Engine Strip on the other automatically (POH 7-74), and
 * DISPLAY BACKUP puts both displays in reversionary mode (PG p. 12, Fig 1-6). `E.pfd` is false when the PFD has failed.
 */
export const pfdReversion = (s: Sim, E: Elec) => E.pfd && (s.avx.backup || !E.mfd);
export const mfdReversion = (s: Sim, E: Elec) => E.mfd && (s.avx.backup || !E.pfd);

export function drawPfdScreen(ctx: Ctx, W: number, H: number, s: Sim, E: Elec) {
  if (pfdReversion(s, E)) drawMFD(ctx, W, H, mfdData(s, E, true));
  else drawPFD(ctx, W, H, pfdData(s, E));
}

export function drawMfdScreen(ctx: Ctx, W: number, H: number, s: Sim, E: Elec) {
  drawMFD(ctx, W, H, mfdData(s, E, mfdReversion(s, E)));
}

/* ---------- MD302 standby attitude module: attitude on the left screen, air data on the right ---------- */

const MD_FONT = `Arial, "Liberation Sans", "DejaVu Sans", Helvetica, sans-serif`;
function mdText(ctx: Ctx, s: string, x: number, y: number, c: string, px: number, align: CanvasTextAlign = "center") {
  ctx.font = `700 ${px}px ${MD_FONT}`;
  ctx.fillStyle = c;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(s, x, y);
}
const tri = (ctx: Ctx, pts: number[], c: string) => {
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  ctx.fill();
};
const seg = (ctx: Ctx, x1: number, y1: number, x2: number, y2: number) => {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
};

/** The two LCDs: 2.4 in. diagonal each (MD302 Installation Manual), ≈49 × 37 mm, on the 420×180 grid of the 5.5 × 2.37 in. bezel. */
const LCD_W = 147,
  LCD_H = 111,
  LCD_Y = 28,
  LCD_L = 30,
  LCD_R = 243;

/**
 * MD302 SAM in its horizontal mounting (MD302 Pilot's Guide Image 2; POH 7-18 … 7-21): two LCDs in one bezel with the
 * control knob between them. Left: attitude (blue sky over dark red ground, roll scale with 45° triangles, yellow airplane
 * symbol, slip indicator at the bottom). Right: airspeed tape with its colour bars on the left edge and the boxed IAS window,
 * altitude tape with the boxed altitude window, and a white BARO box at the top. The altitude trend bar isn't drawn: the
 * model's air data is a level cruise picture.
 */
export function drawStandby(ctx: Ctx, W: number, H: number, s: Sim) {
  ctx.save();
  ctx.fillStyle = "#16191C";
  ctx.fillRect(0, 0, W, H);
  ctx.scale(W / 420, H / 180);
  const lcd = (x: number) => {
    ctx.fillStyle = "#26292C";
    ctx.fillRect(x - 4, LCD_Y - 4, LCD_W + 8, LCD_H + 8);
    ctx.fillStyle = "#000";
    ctx.fillRect(x, LCD_Y, LCD_W, LCD_H);
  };
  const clipTo = (x: number) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, LCD_Y, LCD_W, LCD_H);
    ctx.clip();
  };

  // left LCD: attitude
  lcd(LCD_L);
  clipTo(LCD_L);
  const cx = LCD_L + LCD_W / 2,
    cy = LCD_Y + 50,
    roll = s.ctrl.roll * 25,
    pitch = s.ctrl.pitch * 10,
    ppd = 2.6,
    R = 42;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-roll * D2R);
  ctx.translate(0, pitch * ppd);
  ctx.fillStyle = "#3AA0E0";
  ctx.fillRect(-300, -400, 600, 400);
  ctx.fillStyle = "#7A1E14";
  ctx.fillRect(-300, 0, 600, 400);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.5;
  seg(ctx, -300, 0, 300, 0);
  for (let p = -30; p <= 30; p += 5) {
    if (!p || Math.abs(p - pitch) > 15) continue; // ±15° around the current pitch, clear of the slip indicator
    const y = -p * ppd,
      major = p % 10 === 0,
      hw = major ? 18 : 8;
    seg(ctx, -hw, y, hw, y);
    if (major) {
      mdText(ctx, String(Math.abs(p)), -hw - 8, y, "#fff", 9);
      mdText(ctx, String(Math.abs(p)), hw + 8, y, "#fff", 9);
    }
  }
  ctx.translate(0, -pitch * ppd);
  // roll scale (moves with the horizon): 10, 20, 30, 60° ticks, small triangles at 45° (POH 7-18), zero index
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, R, -150 * D2R, -30 * D2R);
  ctx.stroke();
  for (const a of [-60, -45, -30, -20, -10, 10, 20, 30, 45, 60]) {
    const r = (a - 90) * D2R,
      c = Math.cos(r),
      sn = Math.sin(r);
    if (Math.abs(a) === 45)
      tri(
        ctx,
        [
          c * R,
          sn * R,
          Math.cos(r - 0.06) * (R + 7),
          Math.sin(r - 0.06) * (R + 7),
          Math.cos(r + 0.06) * (R + 7),
          Math.sin(r + 0.06) * (R + 7),
        ],
        "#fff",
      );
    else {
      const len = Math.abs(a) % 30 ? 5 : 9;
      seg(ctx, c * R, sn * R, c * (R + len), sn * (R + len));
    }
  }
  tri(ctx, [0, -R, -5, -R - 8, 5, -R - 8], "#fff");
  ctx.restore();
  // fixed roll pointer and yellow airplane symbol
  tri(ctx, [cx, cy - R + 1, cx - 5, cy - R + 9, cx + 5, cy - R + 9], "#fff");
  ctx.fillStyle = "#FFD200";
  ctx.fillRect(cx - 46, cy - 2, 20, 4);
  ctx.fillRect(cx + 26, cy - 2, 20, 4);
  tri(ctx, [cx, cy, cx - 18, cy + 8, cx + 18, cy + 8], "#FFD200");
  // slip indicator at the bottom of the screen
  const sy = LCD_Y + LCD_H - 9;
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(cx - 30, sy - 6, 60, 12);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.5;
  seg(ctx, cx - 7, sy - 5, cx - 7, sy + 5);
  seg(ctx, cx + 7, sy - 5, cx + 7, sy + 5);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(cx, sy, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // right LCD: airspeed tape (left) and altitude tape (right), BARO at the top
  lcd(LCD_R);
  clipTo(LCD_R);
  const x0 = LCD_R,
    ty = LCD_Y + 58,
    kts = ias(),
    v0 = Math.max(kts, 20),
    ppk = 1.5,
    ppf = 0.16;
  const ky = (v: number) => ty - (v - v0) * ppk,
    fy = (a: number) => ty - (a - s.paFt) * ppf;
  const clear = (y: number) => y < ty - 19 || y > ty + 29; // tape numbers clear of the readout windows and their KTS / FEET captions
  // colour bars along the tape's left edge (POH 2-5): green, yellow, red from the red line up, white flap range inboard of them;
  // the base markings at every altitude (POH 7-20)
  const bar = (a: number, b: number, c: string, x: number, w: number) => {
    const y0 = ky(b),
      y1 = ky(a);
    ctx.fillStyle = c;
    ctx.fillRect(x, y0, w, y1 - y0);
  };
  const sb = standbyBands();
  bar(...sb.green, "#14D21E", x0 + 2, 4);
  bar(...sb.yellow, "#FFD400", x0 + 2, 4);
  bar(sb.red, 400, "#FF2020", x0 + 2, 4);
  bar(...sb.white, "#FFFFFF", x0 + 7, 2);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.2;
  for (let v = Math.ceil((v0 - 40) / 5) * 5; v <= v0 + 40; v += 5) {
    if (v < 20) continue;
    const y = ky(v),
      big = v % 10 === 0;
    seg(ctx, x0 + 10, y, x0 + (big ? 17 : 14), y);
    if (big && clear(y)) mdText(ctx, String(v), x0 + 20, y, "#fff", 11, "left");
  }
  for (let a = Math.ceil((s.paFt - 360) / 20) * 20; a <= s.paFt + 360; a += 20) {
    const y = fy(a),
      big = a % 100 === 0;
    seg(ctx, x0 + LCD_W - 2, y, x0 + LCD_W - (big ? 9 : 5), y);
    if (big && clear(y)) mdText(ctx, String(a), x0 + LCD_W - 12, y, "#fff", 11, "right");
  }
  const box = (x: number, w: number, v: string, unit: string) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(x, ty - 12, w, 24);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, ty - 12, w, 24);
    mdText(ctx, v, x + w / 2, ty + 1, "#fff", 19);
    mdText(ctx, unit, x + w / 2, ty + 19, "#fff", 8);
  };
  box(x0 + 13, 42, kts ? String(kts) : "---", "KTS");
  box(x0 + 62, 74, String(s.paFt), "FEET");
  // BARO: white caption over the boxed setting, which follows the Garmin baro (POH 7-21)
  ctx.fillStyle = "#000";
  ctx.fillRect(x0 + 52, LCD_Y + 2, 42, 27);
  mdText(ctx, "BARO", x0 + 73, LCD_Y + 8, "#fff", 8);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.strokeRect(x0 + 54, LCD_Y + 14, 38, 13);
  mdText(ctx, BARO.toFixed(2), x0 + 73, LCD_Y + 21, "#fff", 11);
  ctx.restore();

  // control knob between the screens
  ctx.fillStyle = "#3A4046";
  ctx.beginPath();
  ctx.arc(210, 150, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#5A6168";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}
