/** The sampled-clearance audit helper: tube-to-solid surface gaps along a bent tube. */
import { describe, expect, it } from "vitest";
import { BoxGeometry } from "three";
import { bentCurve } from "@/lib/geometry";
import { obstacle, sampledClearance } from "./sampled-clearance";

describe("sampledClearance", () => {
  const block = new BoxGeometry(0.1, 0.1, 0.1);
  const solid = obstacle("block", block);
  const pipe = (y: number) =>
    bentCurve(
      [
        [-0.2, y, 0],
        [0.2, y, 0],
      ],
      0.05,
    );
  it("measures the surface gap of a tube beside a block", () => {
    // centreline 0.07 m from the block's centre: 0.02 m from its face, minus the 0.01-m radius
    expect(sampledClearance(pipe(0.07), 0.01, [solid]).gap).toBeCloseTo(0.01, 3);
  });
  it("rejects a planted crossing and a tube wholly inside a solid", () => {
    const through = sampledClearance(pipe(0), 0.01, [solid]);
    expect(through.gap).toBeLessThan(0);
    expect(through.name).toBe("block");
    const inner = bentCurve(
      [
        [-0.02, 0, 0],
        [0.02, 0, 0],
      ],
      0.05,
    );
    expect(sampledClearance(inner, 0.005, [solid]).gap).toBeLessThan(0);
  });
  it("does not let a tube's open end reach past its end ring", () => {
    // a tube ending 4 mm above a block's top, axis vertical: its end ring is clear even though the radius is 10 mm
    const down = bentCurve(
      [
        [0, 0.2, 0],
        [0, 0.054, 0],
      ],
      0.05,
    );
    expect(sampledClearance(down, 0.01, [solid]).gap).toBeCloseTo(0.004, 3);
    // tilted 30° the ring dips to 4 - 5 = -1 mm: a crossing
    const tilted = bentCurve(
      [
        [0, 0.2, -0.0842],
        [0, 0.054, 0],
      ],
      0.05,
    );
    expect(sampledClearance(tilted, 0.01, [solid]).gap).toBeLessThan(0);
  });
});
