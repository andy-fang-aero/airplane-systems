/** The SR22T fuselage skin built in a worker (aircraft/sr22t/fuselage-geo.ts): the same geometry, or a main-thread fallback. */
import type { BufferGeometry } from "three";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildInWorker, fuselageInWorker, isFuselage } from "@/aircraft/sr22t/fuselage-geo";
import { fuselageGeo } from "@/aircraft/sr22t/geometry";
import { CAT } from "@/aircraft/sr22t/parts";

/** A stand-in for the browser's Worker: answers like fuselage.worker.ts (`reply` builds the message), or not at all. */
function fakeWorker(reply: (() => unknown) | null) {
  return class {
    onmessage: ((e: { data: unknown }) => void) | null = null;
    onerror: ((e: { message: string }) => void) | null = null;
    terminated = false;
    constructor() {
      if (reply) queueMicrotask(() => this.onmessage?.({ data: reply() }));
    }
    terminate() {
      this.terminated = true;
    }
  };
}

/** What fuselage.worker.ts posts for a geometry. */
const message = (g: BufferGeometry) => ({
  attributes: Object.entries(g.attributes).map(([name, a]) => ({
    name,
    array: a.array.slice(), // a copy, as a transfer from another thread arrives
    itemSize: a.itemSize,
    normalized: a.normalized,
  })),
  index: g.index?.array.slice() ?? null,
  groups: g.groups,
});

// the main thread's fuselage, built once: the slow part
let reference: BufferGeometry;
beforeAll(() => {
  reference = fuselageGeo();
}, 60_000);
beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => {}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("the fuselage worker build", () => {
  it("returns the worker's geometry, array for array the main thread's", async () => {
    vi.stubGlobal(
      "Worker",
      fakeWorker(() => message(reference)),
    );
    const g = (await buildInWorker())!;
    const bytes = (a: ArrayLike<number> & { buffer: ArrayBufferLike; byteOffset: number; byteLength: number }) =>
      Buffer.from(a.buffer, a.byteOffset, a.byteLength);
    for (const name of ["position", "normal", "uv"]) {
      const got = g.attributes[name].array,
        want = reference.attributes[name].array;
      expect(got === want, `${name}: a copy, not the same array`).toBe(false);
      expect(bytes(got).equals(bytes(want)), name).toBe(true);
    }
    expect(g.index).toBe(reference.index); // the skin is not indexed
  });

  it("fuselageInWorker starts one build however often it is asked", async () => {
    const ctor = vi.fn();
    const Fake = fakeWorker(() => message(reference));
    vi.stubGlobal(
      "Worker",
      class extends Fake {
        constructor() {
          super();
          ctor();
        }
      },
    );
    expect(fuselageInWorker()).toBe(fuselageInWorker());
    await fuselageInWorker();
    expect(ctor).toHaveBeenCalledTimes(1);
  });

  it("falls back (null) on a reply that is not a geometry ({} or null), and stops the worker", async () => {
    for (const reply of [{}, null, { attributes: [{ name: "position", array: [1, 2, 3], itemSize: 3 }], groups: [] }]) {
      const workers: { terminated: boolean }[] = [];
      const Fake = fakeWorker(() => reply);
      vi.stubGlobal(
        "Worker",
        class extends Fake {
          constructor() {
            super();
            workers.push(this);
          }
        },
      );
      expect(await buildInWorker(), JSON.stringify(reply)).toBeNull();
      expect(
        workers.map((w) => w.terminated),
        JSON.stringify(reply),
      ).toEqual([true]);
    }
  });

  it("falls back (null) when the browser refuses to create the worker", async () => {
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          throw new DOMException("blocked", "SecurityError");
        }
      },
    );
    expect(await buildInWorker()).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("SecurityError"));
  });

  it("falls back (null) without Worker, on an error the worker reports, and when it never answers", async () => {
    expect(await buildInWorker()).toBeNull(); // node: no Worker
    vi.stubGlobal(
      "Worker",
      fakeWorker(() => ({ error: "ReferenceError: window is not defined" })),
    );
    expect(await buildInWorker()).toBeNull();
    vi.useFakeTimers();
    vi.stubGlobal("Worker", fakeWorker(null));
    const silent = buildInWorker();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await silent).toBeNull();
  });
});

describe("isFuselage", () => {
  it("picks out the fuselage skin, one shell of the catalogue", () => {
    expect(CAT.shells.filter(isFuselage).map((s) => s.name)).toEqual([expect.stringMatching(/fuselage/i)]);
  });
});

describe("worker-window", () => {
  it("gives a scope without window (a worker; node here) one pointing at its global, and leaves an existing one", async () => {
    const scope = globalThis as { window?: unknown };
    expect(scope.window).toBeUndefined();
    vi.resetModules();
    await import("@/aircraft/sr22t/worker-window");
    expect(scope.window).toBe(globalThis);
    const mine = {};
    scope.window = mine;
    vi.resetModules();
    await import("@/aircraft/sr22t/worker-window");
    expect(scope.window).toBe(mine);
    delete scope.window;
  });
});
