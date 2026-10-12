/**
 * Identical-scene guard: every catalogue entry of every airplane — part, skin shell and control surface: its id,
 * placement, systems, optional-equipment state and built geometry — plus the SR22T flow paths, against a baseline taken
 * from main a1d3cdf0 before the load work, with intentional model updates (SR20 G6 systems depth included).
 * Speeding up geometry or mounting it progressively must not change the reviewed scene.
 * The SR22T is checked with TKS (FIKI) fitted and not fitted.
 *
 * Portable across runtimes: the last bit of Math.sin/cos/atan2 differs between V8 versions and CPU architectures, so
 * the geometry is not hashed. Text and integers (ids, names, attribute layout, counts, indices, groups) must match
 * exactly. Positions are summarised as their sums (not means, so one moved vertex is not divided away) and the first
 * and last vertex, normals and uvs as their sums, and these are compared within TOL, set above the noise measured
 * between Node 22, 24 and 25 on macOS arm64, Linux arm64 and Linux x64. Moving one vertex of any part by 1.5 µm fails
 * (see the last case).
 *
 * Update only for an intended model change: UPDATE_SCENE_BASELINE=1 npx vitest run tests/scene-snapshot.test.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { BufferGeometry } from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { CAT as C172S } from "@/aircraft/c172s/parts";
import { CAT as C182T } from "@/aircraft/c182t/parts";
import { CAT as DA40 } from "@/aircraft/da40/parts";
import { CAT as M20C } from "@/aircraft/m20c/parts";
import { CAT as SR20 } from "@/aircraft/sr20/parts";
import { flowsFor } from "@/aircraft/sr22t/flows";
import { CAT as SR22T } from "@/aircraft/sr22t/parts";
import { useSR22T } from "@/aircraft/sr22t/store";
import type { Catalogue } from "@/lib/catalogue";

const BASELINE = new URL("./scene-snapshot.baseline.json", import.meta.url);

/** Absolute tolerances, and the step each is stored to. Measured noise: position sums 4.8e-7 m, samples 9e-8 m;
 * normal sums 3.9e-6, uv sums 0; flow points 3e-14 m; entry numbers 5e-16. */
const TOL = {
  part: { sum: 1e-6, sample: 1e-6, other: 2e-5 },
  flow: { sum: 1e-8, sample: 1e-8, other: 1e-8 },
};
const STEP = {
  part: { sum: 1e-7, sample: 1e-6, other: 1e-5 },
  flow: { sum: 1e-9, sample: 1e-9, other: 1e-9 },
};
/** Entry numbers: relative above 1; stored to 9 significant digits. */
const ENTRY_TOL = 1e-8;
/** Clipped skin patches whose triangulation itself changes with the runtime (Linux x64 Node 24/25: fuselage and cabin
 * doors; arm64 Node 22: baggage door). When the vertex count differs from the baseline, they are compared by bounding
 * box, area and area centroid instead; measured: area 0.015%, centroid 0.12 mm, bounding box 0. */
const REMESHED = new Set([
  "sr22t/Fuselage-0",
  "sr22t/Left cabin door-649",
  "sr22t/Right cabin door-672",
  "sr22t/Baggage door-695",
]);
const SKIN_TOL = { area: 1e-3 /* relative */, centroid: 1e-3 /* m */, box: 1e-6 };
/** Three seam vertices take u or 1 − u depending on the runtime; u is summed as min(u, 1 − u). */
const UV_SEAM = new Set(["sr20/Vertical stabilizer-12", "surface:rudder@sr20"]);

/** FNV-1a over 32-bit words, for integers and text only. */
class Hash {
  h = 0x811c9dc5;
  ints(a: ArrayLike<number>) {
    for (let i = 0; i < a.length; i++) this.h = Math.imul(this.h ^ a[i], 16777619) >>> 0;
    return this;
  }
  text(s: string) {
    return this.ints(Array.from(s, (c) => c.charCodeAt(0)).concat(-1));
  }
  toString() {
    return this.h.toString(36);
  }
}

/** Σ of each component of an attribute with item size k. */
function sums(a: ArrayLike<number>, k: number, fold = false): number[] {
  const s = new Array(k).fill(0);
  for (let i = 0; i < a.length; i++) s[i % k] += fold && i % k === 0 ? Math.min(a[i], 1 - a[i]) : a[i];
  return s;
}
/** The first and last item (zeros when empty). */
const ends = (a: ArrayLike<number>, k: number) =>
  [...Array.from({ length: k }, (_, i) => i), ...Array.from({ length: k }, (_, i) => a.length - k + i)].map((i) =>
    a.length ? a[i] : 0,
  );

function box(a: ArrayLike<number>): number[] {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < a.length; i++) {
    b[i % 3] = Math.min(b[i % 3], a[i]);
    b[3 + (i % 3)] = Math.max(b[3 + (i % 3)], a[i]);
  }
  return b;
}

/** [area, centroid x, y, z] of a triangle mesh. */
function surface(g: BufferGeometry): number[] {
  const p = g.attributes.position.array,
    idx = g.index?.array,
    n = idx ? idx.length : p.length / 3,
    c = [0, 0, 0];
  let area = 0;
  for (let t = 0; t < n; t += 3) {
    const [a, b, d] = [0, 1, 2].map((j) => 3 * (idx ? idx[t + j] : t + j));
    const u = [0, 1, 2].map((i) => p[b + i] - p[a + i]),
      w = [0, 1, 2].map((i) => p[d + i] - p[a + i]);
    const s = Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2;
    area += s;
    for (let i = 0; i < 3; i++) c[i] += (s * (p[a + i] + p[b + i] + p[d + i])) / 3;
  }
  return [area, ...c.map((x) => x / area)];
}

type Skin = { n: number; mesh: string; box: number[]; surface: number[] };
type Summary = {
  /** Text, structure, attribute layout and counts, indices and groups (indices and counts left out for REMESHED). */
  hash: string;
  /** The entry's numbers (placements are computed with trig too): [count, Σ (i + 1)·v_i]. */
  entry: number[];
  /** Σ x, Σ y, Σ z of the positions. */
  sum: number[];
  /** First and last vertex. */
  samples: number[];
  /** Σ of each other attribute's components, attributes by name. */
  other: number[];
  /** REMESHED only: their vertex count, indices and counts, bounding box and [area, centroid]. */
  skin?: Skin;
};

function entryOf(entry: unknown) {
  const v: number[] = [];
  const text = JSON.stringify(entry, (_k, x) => (typeof x === "number" ? (v.push(x), "#") : x));
  return { hash: new Hash().text(text), entry: [v.length, v.reduce((s, x, i) => s + (i + 1) * x, 0)] };
}

function summarise(key: string, entry: unknown, g: BufferGeometry): Summary {
  const names = Object.keys(g.attributes).sort();
  const layout = names.map((n) => `${n}:${g.attributes[n].itemSize}:${g.attributes[n].count}`).join(" ");
  const mesh = new Hash()
    .text(layout)
    .text(JSON.stringify(g.groups))
    .ints(g.index ? [g.index.count, ...g.index.array] : []);
  const { hash, entry: nums } = entryOf(entry);
  const remeshed = REMESHED.has(key);
  const pos = g.attributes.position.array;
  hash.text(names.map((n) => `${n}:${g.attributes[n].itemSize}`).join(" "));
  if (!remeshed) hash.text(mesh.toString());
  return {
    hash: hash.toString(),
    entry: nums,
    sum: sums(pos, 3),
    samples: ends(pos, 3),
    other: names
      .filter((n) => n !== "position")
      .flatMap((n) => sums(g.attributes[n].array, g.attributes[n].itemSize, n === "uv" && UV_SEAM.has(key))),
    ...(remeshed && { skin: { n: pos.length / 3, mesh: mesh.toString(), box: box(pos), surface: surface(g) } }),
  };
}

/** The stored form: [hash, entry count, entry Σ, ...sum, ...samples, ...other, skin?], each number to its STEP. */
type Record_ = (string | number | Skin)[];
const to = (x: number, step: number) => {
  const digits = Math.max(0, -Math.floor(Math.log10(step)));
  return +(Math.round(x / step) * step).toFixed(digits);
};
function encode(s: Summary, kind: keyof typeof STEP): Record_ {
  const q = STEP[kind];
  return [
    s.hash,
    s.entry[0],
    +s.entry[1].toPrecision(9),
    ...s.sum.map((x) => to(x, q.sum)),
    ...s.samples.map((x) => to(x, q.sample)),
    ...s.other.map((x) => to(x, q.other)),
    ...(s.skin
      ? [
          {
            n: s.skin.n,
            mesh: s.skin.mesh,
            box: s.skin.box.map((x) => to(x, 1e-7)),
            surface: s.skin.surface.map((x) => to(x, 1e-7)),
          },
        ]
      : []),
  ];
}
function decode(r: Record_): Summary {
  const last = r.at(-1);
  const skin = typeof last === "object" ? last : undefined;
  const nums = (skin ? r.slice(3, -1) : r.slice(3)) as number[];
  return {
    hash: r[0] as string,
    entry: [r[1] as number, r[2] as number],
    sum: nums.slice(0, 3),
    samples: nums.slice(3, 9),
    other: nums.slice(9),
    ...(skin && { skin }),
  };
}

const geoCache = new Map<object, BufferGeometry>();
const built = (spec: { geo: () => BufferGeometry }) => {
  let g = geoCache.get(spec);
  if (!g) geoCache.set(spec, (g = spec.geo()));
  return g;
};

/** id → summary of each part, shell and surface; `fitted` is the part's optional-equipment state in the current store. */
function catalogueSummaries(cat: Catalogue, plane: string) {
  const out: Record<string, Summary> = {};
  for (const p of cat.parts) {
    const { geo: _geo, anim, fitted, ...rest } = p;
    out[p.id] = summarise(p.id, { ...rest, anim: !!anim, fitted: fitted ? fitted() : "always" }, built(p));
  }
  for (const s of cat.shells)
    out[s.id] = summarise(s.id, { shell: s.name, note: s.note, skin: !!s.skin, finish: s.finish ?? "" }, built(s));
  for (const s of cat.surfaces) {
    const { geo: _geo, skin, ...rest } = s;
    out[`surface:${s.key}`] = summarise(`surface:${s.key}@${plane}`, { ...rest, skin: !!skin }, built(s));
  }
  return out;
}

const flowSummaries = (fiki: boolean) =>
  Object.fromEntries(
    flowsFor(fiki).map((f): [string, Summary] => {
      const { pts, ...rest } = f;
      const xyz = pts.flatMap((p) => (Array.isArray(p) ? p : p.toArray()));
      const { hash, entry } = entryOf(rest);
      return [
        f.key,
        {
          hash: hash.text(`points:${xyz.length / 3}`).toString(),
          entry,
          sum: sums(xyz, 3),
          samples: ends(xyz, 3),
          other: [],
        },
      ];
    }),
  );

const within = (a: number[], b: number[], tol: number) =>
  a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tol);

/** Differences beyond tolerance between a baseline and a current summary, as readable lines. */
function compare(key: string, base: Summary, cur: Summary, tol: (typeof TOL)[keyof typeof TOL]): string[] {
  const out: string[] = [];
  if (base.hash !== cur.hash) out.push(`${key}: id, name, systems, attribute layout, counts or indices changed`);
  if (
    base.entry[0] !== cur.entry[0] ||
    !within([cur.entry[1]], [base.entry[1]], ENTRY_TOL * Math.max(1, Math.abs(base.entry[1])))
  )
    out.push(`${key}: placement or another number changed: ${cur.entry} vs ${base.entry}`);
  if (base.skin && cur.skin && base.skin.n !== cur.skin.n) {
    const [a0, ...c0] = base.skin.surface,
      [a1, ...c1] = cur.skin.surface;
    if (!(Math.abs(a1 - a0) <= SKIN_TOL.area * a0)) out.push(`${key}: area ${a1} vs ${a0}`);
    if (!within(c1, c0, SKIN_TOL.centroid)) out.push(`${key}: centroid ${c1} vs ${c0}`);
    if (!within(cur.skin.box, base.skin.box, SKIN_TOL.box))
      out.push(`${key}: bounding box ${cur.skin.box} vs ${base.skin.box}`);
    return out;
  }
  if (base.skin && cur.skin && base.skin.mesh !== cur.skin.mesh) out.push(`${key}: counts or indices changed`);
  if (!within(cur.sum, base.sum, tol.sum))
    out.push(`${key}: position sum ${cur.sum} vs ${base.sum} (tolerance ${tol.sum})`);
  if (!within(cur.samples, base.samples, tol.sample))
    out.push(`${key}: first or last vertex ${cur.samples} vs ${base.samples} (tolerance ${tol.sample})`);
  if (!within(cur.other, base.other, tol.other))
    out.push(`${key}: normal or uv sum ${cur.other} vs ${base.other} (tolerance ${tol.other})`);
  return out;
}

function compareSets(base: Record<string, Summary> | undefined, cur: Record<string, Summary>, kind: keyof typeof TOL) {
  if (!base) return ["no baseline"];
  const out: string[] = [];
  for (const k of Object.keys(base)) if (!cur[k]) out.push(`${k}: removed`);
  for (const k of Object.keys(cur)) if (!base[k]) out.push(`${k}: added`);
  for (const k of Object.keys(base)) if (cur[k]) out.push(...compare(k, base[k], cur[k], TOL[kind]));
  return out;
}

const fleet = { sr20: SR20, c172s: C172S, c182t: C182T, da40: DA40, m20c: M20C };
const current: Record<string, Record<string, Summary>> = {};
let baseline: Record<string, Record<string, Summary>> = {};
const kindOf = (set: string) => (set.includes("flows") ? "flow" : "part");
/** Most SR22T entries are the same with and without FIKI: the FIKI-off sets store only the entries that differ. */
const sameAs: Record<string, string> = {
  "sr22t fiki=false": "sr22t fiki=true",
  "sr22t flows fiki=false": "sr22t flows fiki=true",
};
/** Keys are stored without their airplane prefix ("sr22t/Fuselage-0" as "/Fuselage-0"). */
const plane = (set: string) => set.split(" ")[0];

function writeBaseline() {
  const sets = Object.entries(current).map(([set, parts]) => {
    const records = Object.entries(parts).map(([k, v]): [string, string] => [
      k.startsWith(`${plane(set)}/`) ? k.slice(plane(set).length) : k,
      JSON.stringify(encode(v, kindOf(set))),
    ]);
    const ref = current[sameAs[set]];
    let lines = records;
    if (ref && Object.keys(ref).join("\n") === Object.keys(parts).join("\n")) {
      const like = new Map(Object.entries(ref).map(([k, v]) => [k, JSON.stringify(encode(v, kindOf(set)))]));
      lines = [
        ["=", JSON.stringify(sameAs[set])],
        ...records.filter(([, t], i) => like.get(Object.keys(parts)[i]) !== t),
      ];
    }
    return `${JSON.stringify(set)}: {\n${lines.map(([k, t]) => `${JSON.stringify(k)}:${t}`).join(",\n")}\n}`;
  });
  writeFileSync(BASELINE, `{\n${sets.join(",\n")}\n}\n`);
}

function readBaseline() {
  const raw: Record<string, Record<string, Record_ | string>> = JSON.parse(readFileSync(BASELINE, "utf8"));
  const sets: Record<string, Record<string, Summary>> = {};
  const read = (set: string): Record<string, Summary> => {
    if (sets[set]) return sets[set];
    const { "=": ref, ...parts } = raw[set];
    const own = Object.fromEntries(
      Object.entries(parts).map(([k, r]) => [k.startsWith("/") ? plane(set) + k : k, decode(r as Record_)]),
    );
    return (sets[set] = typeof ref === "string" ? { ...read(ref), ...own } : own);
  };
  for (const set of Object.keys(raw)) read(set);
  return sets;
}

function withFiki<T>(fiki: boolean, f: () => T): T {
  const saved = useSR22T.getState().s;
  useSR22T.setState({ s: { ...saved, equip: { ...saved.equip, fiki } } });
  try {
    return f();
  } finally {
    useSR22T.setState({ s: saved });
  }
}

// Building every airplane's geometry is the slow part: once, here, not in each case.
beforeAll(() => {
  for (const fiki of [true, false]) {
    current[`sr22t fiki=${fiki}`] = withFiki(fiki, () => catalogueSummaries(SR22T, "sr22t"));
    current[`sr22t flows fiki=${fiki}`] = flowSummaries(fiki);
  }
  for (const [id, cat] of Object.entries(fleet)) current[id] = catalogueSummaries(cat, id);
  if (process.env.UPDATE_SCENE_BASELINE) writeBaseline();
  baseline = readBaseline();
}, 180_000);

describe("catalogue and geometry match the reviewed model baseline", () => {
  for (const fiki of [true, false]) {
    it(`SR22T parts, shells and surfaces, FIKI ${fiki ? "fitted" : "not fitted"}`, () => {
      const set = `sr22t fiki=${fiki}`;
      expect(compareSets(baseline[set], current[set], "part")).toEqual([]);
    });
    it(`SR22T flow paths, FIKI ${fiki ? "fitted" : "not fitted"}`, () => {
      const set = `sr22t flows fiki=${fiki}`;
      expect(compareSets(baseline[set], current[set], "flow")).toEqual([]);
    });
  }
  for (const id of Object.keys(fleet))
    it(`${id} parts, shells and surfaces`, () => {
      expect(compareSets(baseline[id], current[id], "part")).toEqual([]);
    });

  it("fails when one vertex of one part moves 1.5 µm along any axis", () => {
    const missed: string[] = [];
    for (const [id, cat] of Object.entries({ sr22t: SR22T, ...fleet }))
      for (const spec of [...cat.parts, ...cat.shells]) {
        const g = built(spec),
          pos = g.attributes.position.array as Float32Array,
          v = Math.floor(pos.length / 6); // the middle vertex: not the first or last
        if (pos.length < 9) continue;
        // against the stored form, so the baseline's rounding is part of the check
        const before = decode(encode(summarise(spec.id, {}, g), "part"));
        for (let i = 3 * v; i < 3 * v + 3; i++) {
          const x = pos[i];
          pos[i] += 1.5e-6;
          try {
            if (compare(spec.id, before, summarise(spec.id, {}, g), TOL.part).length === 0)
              missed.push(`${id} ${spec.id} axis ${i - 3 * v}`);
          } finally {
            pos[i] = x;
          }
        }
      }
    expect(missed).toEqual([]);
  });
});
