/** The SR22T fuselage skin built in a Web Worker (fuselage.worker.ts), so the main thread stays free while it is built. */
import * as THREE from "three";
import { primeGeo } from "@/lib/catalogue";
import { fuselageGeo } from "./geometry";
import { CAT } from "./parts";

/** Longest wait for the worker before building on the main thread, ms (a phone builds the fuselage in a few seconds). */
const WORKER_TIMEOUT_MS = 20_000; // approximate: a load-time choice, not a source value

interface Built {
  attributes: { name: string; array: THREE.TypedArray; itemSize: number; normalized: boolean }[];
  index: THREE.TypedArray | null;
  groups: THREE.BufferGeometry["groups"];
}

/**
 * The fuselage geometry, built in a worker; null when the browser can't run the worker (no Worker, one it refuses to
 * create, a failed load or build, or no answer in WORKER_TIMEOUT_MS: the caller builds it on the main thread instead, with a warning logged).
 */
let pending: Promise<THREE.BufferGeometry | null> | null = null;
export function fuselageInWorker(): Promise<THREE.BufferGeometry | null> {
  // one build per page: the first call (the airplane's prepare, at boot) starts it, the model's build awaits the same one;
  // its result becomes the shell's geometry the moment it arrives, so nothing builds the hull again meanwhile
  return (pending ??= buildInWorker().then((g) => {
    if (g) primeGeo(HULL, g);
    return g;
  }));
}

/** One worker build of the fuselage (fuselageInWorker shares one per page). */
export function buildInWorker(): Promise<THREE.BufferGeometry | null> {
  if (typeof Worker === "undefined") return Promise.resolve(null);
  let worker: Worker;
  try {
    worker = new Worker(new URL("./fuselage.worker.ts", import.meta.url), { type: "module" });
  } catch (e) {
    // a refused worker (SecurityError, e.g. a locked-down browser), a URL it can't load (SyntaxError), or a browser
    // without module workers (TypeError); anything else is a bug and propagates
    if (!(e instanceof DOMException || e instanceof TypeError)) throw e;
    console.warn(`Fuselage worker refused (${e.name}: ${e.message}); building the fuselage on the main thread`);
    return Promise.resolve(null);
  }
  return new Promise((done) => {
    const fail = (why: string) => {
      clearTimeout(timer);
      worker.terminate();
      console.warn(`Fuselage worker failed (${why}); building the fuselage on the main thread`);
      done(null);
    };
    // last resort for a worker that never answers (an error its runtime swallowed)
    const timer = setTimeout(() => fail(`no answer in ${WORKER_TIMEOUT_MS / 1000} s`), WORKER_TIMEOUT_MS);
    worker.onmessage = ({ data }: MessageEvent<unknown>) => {
      if (!data || typeof data !== "object") return fail("an empty reply");
      if ("error" in data) return fail(String(data.error));
      let g: THREE.BufferGeometry;
      try {
        g = rebuild(data);
      } catch (e) {
        if (!(e instanceof TypeError || e instanceof RangeError)) throw e;
        return fail(`a malformed reply: ${e.message}`);
      }
      clearTimeout(timer);
      worker.terminate();
      done(g);
    };
    worker.onerror = (e) => fail(e.message);
  });
}

/** The geometry the worker sent (`Built`); a TypeError for anything else. */
function rebuild(data: object): THREE.BufferGeometry {
  const { attributes, index, groups } = data as Partial<Built>;
  const typed = (a: unknown): a is THREE.TypedArray => ArrayBuffer.isView(a) && !(a instanceof DataView);
  if (!Array.isArray(attributes) || !attributes.length || !Array.isArray(groups) || (index != null && !typed(index)))
    throw new TypeError("not a fuselage geometry");
  const g = new THREE.BufferGeometry();
  for (const a of attributes) {
    if (typeof a?.name !== "string" || !typed(a.array) || !Number.isInteger(a.itemSize) || a.itemSize < 1)
      throw new TypeError(`bad attribute ${JSON.stringify(a?.name)}`);
    g.setAttribute(a.name, new THREE.BufferAttribute(a.array, a.itemSize, !!a.normalized));
  }
  if (index) g.setIndex(new THREE.BufferAttribute(index, 1));
  for (const { start, count, materialIndex } of groups) g.addGroup(start, count, materialIndex);
  return g;
}

/** Is `spec` the fuselage skin shell (its geometry is what the worker builds)? */
export const isFuselage = (spec: { geo: () => THREE.BufferGeometry }) => spec.geo === fuselageGeo;

/** The fuselage skin shell. */
const HULL = CAT.shells.find(isFuselage)!;
