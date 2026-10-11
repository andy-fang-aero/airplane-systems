/** Fixed illustration, SR22T POH 13772-007 5-32; IAS is an uncalibrated ISA estimate. */
import { afterEach, expect, it, vi } from "vitest";
import { drawMFD, drawPFD } from "@/lib/avionics/g1000";
import { drawMfdScreen, drawPfdScreen, eisGauges, illustrativeIas } from "@/aircraft/sr22t/displays";
import { initialSim, solve } from "@/aircraft/sr22t/model";
import { patched } from "./helpers";

vi.mock("@/lib/avionics/g1000", () => ({ drawMFD: vi.fn(), drawPFD: vi.fn() }));
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

it("renders the illustrative cruise data on PFD and backup MFD and preserves engine indications", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2020-01-01T12:00:00Z"));
  expect(initialSim.paFt).toBe(4000);
  const s = patched(initialSim);
  const e = solve(s);
  const ctx = {} as CanvasRenderingContext2D;
  drawPfdScreen(ctx, 640, 480, s, e);
  expect(vi.mocked(drawPFD).mock.calls[0][3].f).toMatchObject({
    ias: 147,
    tas: 156,
    alt: 4000,
    selAlt: 4000,
    hdg: 360,
    baro: 29.92,
  });
  const backup = patched(s, { avx: { pfdFail: true } });
  const eb = solve(backup);
  drawMfdScreen(ctx, 640, 480, backup, eb);
  const data = vi.mocked(drawMFD).mock.calls[0][3];
  expect(data.f).toMatchObject({ ias: 147, tas: 156, alt: 4000 });
  expect(data.reversion).toBe(true);
  expect(data.eis).toEqual(eisGauges(backup, eb));
});

it("reads the PFD altitude from s.paFt while IAS stays at the fixed POH 5-32 point", () => {
  const s = patched(initialSim, { paFt: 12000 });
  drawPfdScreen({} as CanvasRenderingContext2D, 640, 480, s, solve(s));
  expect(vi.mocked(drawPFD).mock.calls[0][3].f).toMatchObject({ ias: 147, tas: 156, alt: 12000, selAlt: 12000 });
});

it.each([
  [156, 0, 156],
  [156, 4000, 147],
  [156, 10000, 134],
  [0, 4000, 0],
])("derives illustrative IAS from %s KTAS at %s ft ISA", (tas, altitudeFt, expectedIas) => {
  expect(illustrativeIas(tas, altitudeFt)).toBe(expectedIas);
});
