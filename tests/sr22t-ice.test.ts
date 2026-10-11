import * as THREE from "three";
import { CAT } from "@/aircraft/sr22t/parts";
import { useSR22T } from "@/aircraft/sr22t/store";
import { expect, it } from "vitest";
import { AB, inFus } from "@/aircraft/sr22t/geometry";
import {
  TKS_USABLE,
  breakerBus,
  casMessages,
  expireIce,
  icePumps,
  initialSim,
  live,
  pumpDuty,
  solve,
} from "@/aircraft/sr22t/model";
import { simTick } from "@/aircraft/sr22t/tick";
const state = () => structuredClone(initialSim);
it("requires both documented IPS feeds; ice lights lose ICE PROTECT 1 (POH 7-48; AMM 30-80 PDF 1272)", () => {
  const s = state();
  expect(breakerBus(s.equip, "ICE PROTECT 1")).toBe("main1");
  expect(breakerBus(s.equip, "ICE PROTECT 2")).toBe("ess2");
  expect(solve(s).ipsPwr).toBe(true);
  s.cb["ICE PROTECT 1"] = true;
  expect(solve(s).ipsPwr).toBe(false);
  expect(solve(s).icePwr).toBe(false);
  s.cb = { "ICE PROTECT 2": true };
  expect(solve(s).ipsPwr).toBe(false);
  expect(solve(s).icePwr).toBe(true);
});
it("NORM cycles 30 on / 90 off; HIGH and MAX relative flow (AMM 30-00 PDF 1167)", () => {
  const s = state();
  s.ice.on = true;
  expect(pumpDuty(s)).toBe(100);
  expect(icePumps(s, 29)).toEqual([true, true]);
  expect(icePumps(s, 30)).toEqual([false, false]);
  expect(icePumps(s, 120)).toEqual([true, true]);
  s.ice.mode = "HIGH";
  expect(pumpDuty(s)).toBe(200);
  expect(icePumps(s, 60)).toEqual([true, false]);
  s.ice.maxT = 120;
  expect(pumpDuty(s)).toBe(400);
  s.ice = expireIce(s.ice, 119, 0);
  expect(pumpDuty(s)).toBe(400);
  s.ice = expireIce(s.ice, 120, 0);
  expect(pumpDuty(s)).toBe(200);
});
it("BKUP independently runs pump 2; NORM + BKUP 250 %, HIGH + BKUP 400 % (AMM 30-00 PDF 1167)", () => {
  const s = state();
  s.ice.bkup = true;
  expect(pumpDuty(s)).toBe(200);
  expect(icePumps(s, 60)).toEqual([false, true]);
  s.ice.on = true;
  expect(pumpDuty(s)).toBe(250);
  s.ice.mode = "HIGH";
  expect(pumpDuty(s)).toBe(400);
});
it("windshield cancels at 3 s without consuming the 8 usable gal (AMM 30-00 PDF 1167; AMM 12-10 PDF 269)", () => {
  const s = state();
  s.ice.ws = 3;
  const next = expireIce(s.ice, 0, 3);
  expect(next.ws).toBe(0);
  expect(next.qL).toBe(4);
  expect(next.qR).toBe(4);
});
it("each tank starts at its 4.0 usable gal, 8.0 gal usable in all (AMM 30-00 PDF 1166; AMM 12-10 PDF 269)", () => {
  expect(TKS_USABLE).toBe(4);
  expect([initialSim.ice.qL, initialSim.ice.qR]).toEqual([TKS_USABLE, TKS_USABLE]);
  expect(2 * TKS_USABLE).toBe(8);
});
it("the Timer Box sits on the RH aft longeron, not under the LH passenger seat (AMM 30-07 PDF 1212)", () => {
  const timer = CAT.parts.find((p) => p.name === "Timer Box")!;
  const [x, y, z] = timer.pos!;
  expect(z).toBeGreaterThan(0);
  expect(x).toBeLessThan(AB);
  expect(inFus(new THREE.Vector3(x, y, z))).toBe(true);
  expect(timer.note).toMatch(/RH aft longeron/);
  expect(timer.note).toMatch(/AMM 30-07/);
  expect(timer.note).not.toMatch(/passenger seat/);
});
it("no IPS power, pump commands or ice CAS without FIKI regardless of controls", () => {
  const s = state();
  s.equip.fiki = false;
  Object.assign(s.ice, { on: true, maxT: 120, ws: 3, bkup: true });
  const E = solve(s);
  expect(E.ipsPwr).toBe(false);
  expect(pumpDuty(s)).toBe(0);
  expect(icePumps(s, 0)).toEqual([false, false]);
  expect(casMessages(s, E).filter((m) => /ANTI ICE/.test(m[1]))).toEqual([]);
});

it("MAX reverts to NORM and timing steps preserve quantity (AMM 30-00 PDF 1167)", () => {
  const s = state();
  s.ice.on = true;
  s.ice.maxT = 120;
  s.ice = expireIce(s.ice, 120, 0);
  expect(pumpDuty(s)).toBe(100);
  expect(s.ice.qL + s.ice.qR).toBe(8);
});

it("nine porous panels and all TKS hardware hide without FIKI (AMM Fig. 30-00-1 PDF 1169)", () => {
  const parts = CAT.parts.filter((p) => p.sys.includes("ice"));
  expect(parts.filter((p) => p.name?.includes("porous panel"))).toHaveLength(9);
  const saved = useSR22T.getState().s;
  try {
    for (const fitted of [false, true]) {
      useSR22T.setState({ s: { ...saved, equip: { fiki: fitted } } });
      expect(CAT.partsFor().filter((p) => p.sys.includes("ice")).length > 0).toBe(fitted);
      expect(CAT.pinned("ice").length > 0).toBe(fitted);
      for (const p of parts) {
        const mesh = new THREE.Mesh();
        expect(p.anim).toBeTypeOf("function");
        p.anim!(mesh, 0);
        expect(mesh.visible, p.name).toBe(fitted);
        const geometry = p.geo();
        geometry.computeBoundingBox();
        expect(Number.isFinite(geometry.boundingBox!.min.x), p.name).toBe(true);
        geometry.dispose();
      }
    }
  } finally {
    useSR22T.setState({ s: saved });
  }
});

it("MAX and WINDSHLD count down per frame without store updates until each expires (AMM 30-00 PDF 1167)", () => {
  const saved = useSR22T.getState().s;
  const savedLive = { ...live };
  let notified = 0;
  const unsubscribe = useSR22T.subscribe(() => notified++);
  try {
    useSR22T.setState({ s: { ...saved, ice: { ...saved.ice, on: true, maxT: 120, ws: 3 } } });
    notified = 0;
    const run = (seconds: number) => {
      for (let n = 0; n < seconds * 10; n++) simTick(0.1);
    };
    run(2.9);
    expect(notified).toBe(0);
    run(0.2);
    expect(notified).toBe(1);
    expect(useSR22T.getState().s.ice).toMatchObject({ maxT: 120, ws: 0 });
    run(116.8);
    expect(notified).toBe(1);
    expect(pumpDuty(useSR22T.getState().s)).toBe(400);
    run(0.2);
    expect(notified).toBe(2);
    expect(useSR22T.getState().s.ice.maxT).toBe(0);
    expect(pumpDuty(useSR22T.getState().s)).toBe(100);
  } finally {
    unsubscribe();
    useSR22T.setState({ s: saved });
    Object.assign(live, savedLive);
  }
});
