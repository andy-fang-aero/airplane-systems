/**
 * Per-frame simulation: engine start/stop and RPM, flap motor, CAPS clock.
 * Writes continuous values to `live`; only discrete changes go through the store.
 */
import { clamp, lerp } from "@/lib/math";
import { fuelAvail, inductionAvailable, live } from "./model";
import { useSR20 } from "./store";

export function simTick(dt: number) {
  const { s, E, update } = useSR20.getState();
  const g = s.eng;

  // ignition key START is spring-loaded: cranks while held, then returns to BOTH
  if (g.key === "START") {
    live.startTimer -= dt;
    if (E.starterPwr && !g.running) {
      live.crankT += dt;
      if (live.crankT > 1.3 && fuelAvail(s) && inductionAvailable(s) && g.mix > 0.05)
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
  const cur = useSR20.getState().s;
  if (cur.eng.running && (cur.eng.key === "OFF" || cur.eng.mix <= 0.05))
    update((d) => {
      d.eng.running = false;
    });
  // Delay illustrates loss of supply; it is not a measured aircraft flameout time.
  if (cur.eng.running && (!fuelAvail(cur) || !inductionAvailable(cur))) {
    live.starve += dt;
    if (live.starve > 3) {
      live.starve = 0;
      update((d) => {
        d.eng.running = false;
      });
    }
  } else live.starve = 0;

  // RPM: POH governor schedule — 2,500 from idle through cruise, 2,700 at full power
  const now = useSR20.getState();
  let target = 0;
  if (now.s.eng.running) {
    const L = now.s.eng.lever;
    target = L < 0.14 ? 700 + (L / 0.14) * 1750 : L < 0.93 ? 2500 : 2500 + ((L - 0.93) / 0.07) * 200;
    if (now.s.eng.key === "L" || now.s.eng.key === "R") target -= 60;
  } else if (now.s.eng.key === "START" && now.E.starterPwr) target = 260;
  live.rpm = lerp(live.rpm, target, clamp(dt * (target > live.rpm ? 2.2 : 1.1), 0, 1));
  if (live.rpm < 3) live.rpm = 0;

  // flap motor: ~4°/s, only with FLAPS power
  const tgt = now.s.flaps.cmd * 0.32;
  if (now.E.flapsPwr && Math.abs(live.flapAng - tgt) > 0.01)
    live.flapAng += Math.sign(tgt - live.flapAng) * Math.min(Math.abs(tgt - live.flapAng), 4 * dt);

  // CAPS clock
  if (live.capsPlaying) {
    live.capsT = Math.min(16, live.capsT + dt);
    if (live.capsT >= 16) live.capsPlaying = false;
  }
}
