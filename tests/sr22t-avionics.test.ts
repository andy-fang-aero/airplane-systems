/** Perspective+ display power and backup, SR22T POH 13772-007 7-74. */
import { describe, expect, it } from "vitest";
import { mfdReversion, pfdReversion, eisGauges } from "@/aircraft/sr22t/displays";
import { initialSim, solve } from "@/aircraft/sr22t/model";
import { patched } from "./helpers";

describe("SR22T Perspective+ avionics", () => {
  it.each([
    ["pfd", "PFD A", "PFD B"],
    ["mfd", "MFD A", "MFD B"],
    ["stby", "STDBY ATTD A", "STDBY ATTD B"],
  ] as const)("%s stays powered on either feed and goes dark with both pulled (POH 7-74, 7-21)", (display, a, b) => {
    for (const cb of [{ [a]: true }, { [b]: true }]) {
      expect(solve(patched(initialSim, { cb }))[display]).toBe(true);
    }
    expect(solve(patched(initialSim, { cb: { [a]: true, [b]: true } }))[display]).toBe(false);
  });

  it("PFD failure transfers flight data and powered engine indications to MFD (POH 7-74)", () => {
    const s = patched(initialSim, { avx: { pfdFail: true } });
    const e = solve(s);
    expect(e.pfd).toBe(false);
    expect(mfdReversion(s, e)).toBe(true);
    expect(pfdReversion(s, e)).toBe(false);
    expect(eisGauges(s, e).every((g) => g.value !== null)).toBe(true);
  });

  it("MFD power loss transfers engine indications to the PFD (POH 7-74)", () => {
    const s = patched(initialSim, { cb: { "MFD A": true, "MFD B": true } });
    const e = solve(s);
    expect(pfdReversion(s, e)).toBe(true);
    expect(mfdReversion(s, e)).toBe(false);
  });

  it("DISPLAY BACKUP puts both powered displays in backup; releasing it restores normal mode (POH 7-74)", () => {
    for (const backup of [true, false]) {
      const s = patched(initialSim, { avx: { backup } });
      const e = solve(s);
      expect(pfdReversion(s, e)).toBe(backup);
      expect(mfdReversion(s, e)).toBe(backup);
    }
  });

  it("ENGINE INSTR loss removes each engine indication in backup mode (POH 7-78)", () => {
    const s = patched(initialSim, { avx: { backup: true }, cb: { "ENGINE INSTR": true } });
    const e = solve(s);
    expect(mfdReversion(s, e)).toBe(true);
    expect(eisGauges(s, e).every((g) => g.value === null)).toBe(true);
  });
});
