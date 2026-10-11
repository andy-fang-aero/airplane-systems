/** Progressive scene builds (lib/build.ts): which parts mount while a build runs, and the build-in glow. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Catalogue } from "@/lib/catalogue";
import { beginParts, buildingIn, BUILD_IN_MS, endParts, markAdded, setBuild, skipBuild, useBuild } from "@/lib/build";
import { box } from "@/lib/geometry";

const cat = new Catalogue("probe");
/** Fresh parts for each case: a part's glow is remembered per part. */
const parts = () => [
  cat.part(() => box(0.1, 0.1, 0.1), ["electrical"], { name: "A" }),
  cat.part(() => box(0.1, 0.1, 0.1), ["fuel"], { name: "B" }),
];

let reduce = false;
beforeEach(() => {
  reduce = false;
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce") && reduce }));
  vi.useFakeTimers({ toFake: ["performance"] });
});
afterEach(() => {
  endParts(cat);
  setBuild("code");
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("a progressive build", () => {
  it("starts with no parts and counts the ones added", () => {
    const [a] = parts();
    const built = beginParts(cat);
    expect(built.size).toBe(0);
    built.add(a);
    useBuild.setState({ done: built.size });
    expect([...built]).toEqual([a]);
    expect(useBuild.getState().done).toBe(1);
  });

  it("makes a part glow for BUILD_IN_MS after it is added, and no other part", () => {
    const [a, b] = parts();
    beginParts(cat);
    markAdded(a);
    expect(buildingIn(a)).toBe(true);
    expect(buildingIn(b)).toBe(false);
    vi.advanceTimersByTime(BUILD_IN_MS);
    expect(buildingIn(a)).toBe(false);
  });

  it("never glows with prefers-reduced-motion", () => {
    const [a] = parts();
    reduce = true;
    beginParts(cat);
    markAdded(a);
    expect(buildingIn(a)).toBe(false);
  });

  it("Add all ends the glow and asks for the rest at once; the next build glows again", () => {
    const [a, b] = parts();
    beginParts(cat);
    markAdded(a);
    skipBuild();
    expect(buildingIn(a)).toBe(false);
    expect(useBuild.getState().skip).toBe(true);
    beginParts(cat);
    expect(useBuild.getState().skip).toBe(false);
    markAdded(b);
    expect(buildingIn(b)).toBe(true);
  });
});
