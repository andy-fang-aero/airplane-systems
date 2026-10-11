/**
 * Per-frame simulation: engine start/stop and RPM, flap motor, CAPS clock, time above 12,500 ft for the oxygen CAS.
 * Writes continuous values to `live`; only discrete changes go through the store.
 */
import { clamp, lerp } from "@/lib/math";
import {
  FLAP_DEG,
  OXY_RQD_MIN,
  above12k5,
  expireIce,
  fuelAvail,
  live,
  rpmTarget,
  rpmWarning,
  liftHeatGroundTime,
} from "./model";
import { useSR22T } from "./store";

export function simTick(dt: number) {
  const { s, E, update } = useSR22T.getState();
  const g = s.eng;
  live.liftHeatGroundSec = liftHeatGroundTime(live.liftHeatGroundSec, s, E, dt);
  live.icePhase = s.equip.fiki && s.ice.on ? (live.icePhase + dt) % 120 : 0;
  // MAX and WINDSHLD run in `live`; the store changes only when one expires or display backup forces AUTO
  live.iceMaxRun = s.ice.maxT > 0 ? live.iceMaxRun + dt : 0;
  live.iceWsRun = s.ice.ws > 0 ? live.iceWsRun + dt : 0;
  const ice = expireIce(s.ice, live.iceMaxRun, live.iceWsRun);
  if (ice.maxT !== s.ice.maxT || ice.ws !== s.ice.ws || (s.avx.backup && s.ice.sel !== "AUTO"))
    update((d) => {
      d.ice = expireIce(d.ice, live.iceMaxRun, live.iceWsRun);
      if (d.avx.backup) d.ice.sel = "AUTO";
    });

  // ignition key START is spring-loaded: cranks while held, then returns to BOTH
  if (g.key === "START") {
    live.startTimer -= dt;
    if (E.starterPwr && !g.running) {
      live.crankT += dt;
      if (live.crankT > 1.3 && fuelAvail(s) && g.mix > 0.05)
        update((d) => {
          d.eng.running = true;
        });
    }
    if (live.startTimer <= 0) {
      live.crankT = 0;
      update((d) => {
        d.eng.key = "BOTH";
      });
    }
  }
  const cur = useSR22T.getState().s;
  if (cur.eng.running && (cur.eng.key === "OFF" || cur.eng.mix <= 0.05))
    update((d) => {
      d.eng.running = false;
    });
  if (cur.eng.running && !fuelAvail(cur)) {
    live.starve += dt;
    if (live.starve > 3) {
      live.starve = 0;
      update((d) => {
        d.eng.running = false;
      });
    }
  } else live.starve = 0;

  // RPM: 2,500 from the governing range to full power; no propeller control (rpmTarget)
  const now = useSR22T.getState();
  const target = rpmTarget(now.s, now.E.starterPwr);
  live.rpm = lerp(live.rpm, target, clamp(dt * (target > live.rpm ? 2.2 : 1.1), 0, 1));
  if (live.rpm < 3) live.rpm = 0;

  // RPM warning timers (AMM 77-10), run by the Engine Airframe Unit only while ENGINE INSTR powers it;
  // the store only hears about a change
  const hi = live.rpmHi,
    eau = now.E.eisPwr;
  hi.t2560 = eau && live.rpm > 2560 ? hi.t2560 + dt : 0;
  hi.t2580 = eau && live.rpm > 2580 ? hi.t2580 + dt : 0;
  const warn = rpmWarning(hi.t2560, hi.t2580);
  if (warn !== now.s.eng.rpmWarn)
    update((d) => {
      d.eng.rpmWarn = warn;
    });

  // Illustrative flap motor rate (~4°/s, unsourced); only with FLAPS power.
  const tgt = FLAP_DEG[now.s.flaps.cmd];
  if (now.E.flapsPwr && live.flapAng !== tgt)
    live.flapAng += Math.sign(tgt - live.flapAng) * Math.min(Math.abs(tgt - live.flapAng), 4 * dt);

  // time above 12,500 ft (OXYGEN RQD caution, POH 3A-24): counted in `live` and written to the store at each whole minute,
  // on the first tick past 30 min (so the caution shows then, not a minute later) and on reset; a slider or scenario that
  // sets the store value restarts the count from there
  const stored = now.s.oxy.above12k5Min;
  if (stored !== live.above12k5Written) live.above12k5Min = live.above12k5Written = stored;
  const was = live.above12k5Min,
    min = above12k5(was, now.s.paFt, dt);
  live.above12k5Min = min;
  const crossed = Math.floor(min) !== Math.floor(was) || (was <= OXY_RQD_MIN && min > OXY_RQD_MIN);
  if (min !== stored && (crossed || min === 0)) {
    live.above12k5Written = min;
    update((d) => {
      d.oxy.above12k5Min = min;
    });
  }

  // CAPS clock
  if (live.capsPlaying) {
    live.capsT = Math.min(16, live.capsT + dt);
    if (live.capsT >= 16) live.capsPlaying = false;
  }
}
