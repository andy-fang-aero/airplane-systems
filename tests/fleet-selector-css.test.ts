/**
 * The airplane selector's stylesheet, read statically: no browser needed. With six airplanes the labels ran
 * together in one unpadded strip. They must be separate, padded chips on ONE row that keeps the old strip's 28.5 px
 * height, so the heading and system list below do not move, and all six must fit every rail width without scrolling.
 * The rendered layout (positions, label visibility, focus ring, overflow) is checked in a browser by
 * `npm run test:ui:fleet`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** The body of the `@media` block whose query is exactly `query`, or "" when there is none. */
function media(query: string): string {
  const at = CSS.indexOf(`@media ${query} {`);
  if (at < 0) return "";
  let depth = 0;
  for (let i = CSS.indexOf("{", at); i < CSS.length; i++) {
    if (CSS[i] === "{") depth++;
    else if (CSS[i] === "}" && --depth === 0) return CSS.slice(CSS.indexOf("{", at) + 1, i);
  }
  return "";
}

/** Declarations of the rule whose selector is exactly `selector`, at the top level of `css` (not in a media query). */
function rule(selector: string, css = CSS): Record<string, string> {
  let depth = 0,
    start = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === "{") {
      if (depth === 0 && css.slice(start, i).trim() === selector) {
        const body = css.slice(i + 1, css.indexOf("}", i));
        return Object.fromEntries(
          body
            .split(";")
            .map((d) => d.split(":").map((x) => x.trim()))
            .filter(([k, v]) => k && v)
            .map(([k, v]) => [k, v]),
        );
      }
      depth++;
    } else if (css[i] === "}") {
      depth--;
      start = i + 1;
    } else if (css[i] === ";" && depth === 0) start = i + 1;
  }
  return {};
}

const px = (v: string | undefined) => (v === undefined || v === "0" ? 0 : Number(/^(-?[\d.]+)px$/.exec(v)?.[1]));
/** [top, right, bottom, left] of a 1-4 value shorthand */
const sides = (v: string | undefined) => {
  const p = (v ?? "0").split(/\s+/).map(px);
  return [p[0], p[1] ?? p[0], p[2] ?? p[0], p[3] ?? p[1] ?? p[0]];
};
const borderWidth = (v: string | undefined) => (v ? px(v.split(/\s+/)[0]) : 0);

const strip = rule(".fleet");
const chip = rule(".fleet button");
const h1 = rule(".brand h1");
const NARROW = media("(min-width: 861px) and (max-width: 1100px)");

/**
 * The six labels (SR20 SR22T C172S C182T DA40 M20C) side by side, in em of the condensed display face at weight 600:
 * 132.9 px at 11 px and 120.7 px at 10 px, measured in Chromium with the app's fonts.
 */
const LABELS_EM = 12.08;
/** The rail's inner width: the .app rail column less the .brand side padding (18 px each) and the rail's 1 px border. */
const RAIL = { desktop: 228 - 36 - 1, narrow: 200 - 36 - 1 };

/** Width six chips need in a row, with the chip and strip rules overridden by `chipOver` and `stripOver`. */
function sixChips(chipOver: Record<string, string> = {}, stripOver: Record<string, string> = {}) {
  const c = { ...chip, ...chipOver },
    s = { ...strip, ...stripOver };
  const [, right, , left] = sides(c.padding);
  return (
    6 * (2 * borderWidth(c.border) + left + right) + 5 * px(s.gap ?? s["column-gap"]) + LABELS_EM * px(c["font-size"])
  );
}

describe("airplane selector stylesheet", () => {
  it("separates the airplanes with a gap", () => {
    expect(px(strip.gap ?? strip["column-gap"])).toBeGreaterThan(0);
  });

  it("gives every chip its own border and side padding", () => {
    expect(borderWidth(chip.border)).toBeGreaterThan(0);
    const [, right, , left] = sides(chip.padding);
    expect(left).toBeGreaterThan(0);
    expect(right).toBeGreaterThan(0);
    expect(chip["white-space"]).toBe("nowrap");
  });

  it("keeps every airplane on one row, scrolling sideways rather than wrapping", () => {
    expect(strip.display).toBe("grid");
    expect(strip["grid-auto-flow"]).toBe("column");
    expect(strip["grid-template-columns"]).toBeUndefined();
    expect(strip["flex-wrap"]).toBeUndefined();
    expect(strip["overflow-x"]).toBe("auto");
  });

  it("fits all six airplanes without scrolling, on the desktop rail and the narrow (861-1100 px) one", () => {
    expect(chip["font-family"]).toBe("var(--f-disp)");
    expect(chip["font-weight"]).toBe("600");
    expect(sixChips()).toBeLessThanOrEqual(RAIL.desktop);
    expect(sixChips(rule(".fleet button", NARROW), rule(".fleet", NARROW))).toBeLessThanOrEqual(RAIL.narrow);
    expect(px(rule(".fleet", NARROW).gap ?? strip.gap)).toBeGreaterThan(0);
  });

  it("leaves a mouse a scrollbar when more airplanes overflow the rail", () => {
    expect(strip["scrollbar-width"]).not.toBe("none");
    expect(strip["overflow-y"]).toBe("hidden");
  });

  it("keeps the old strip's 28.5 px row and 12 px space below it, so the heading and system list stay put", () => {
    const [top, , bottom] = sides(chip.padding);
    const row = 2 * borderWidth(chip.border) + top + bottom + px(chip["line-height"]);
    expect(row).toBe(28.5);
    expect(strip.border).toBeUndefined();
    // the strip box also holds the scrollbar's room; its bottom margin and the heading's top margin collapse together
    const [, , stripBottom] = sides(strip.margin),
      [headingTop] = sides(h1.margin);
    expect(px(strip.height) - row + stripBottom + headingTop).toBe(12);
  });

  it("draws the keyboard focus ring inside the chip, where the scrolling strip cannot clip it", () => {
    expect(px(rule(".fleet button:focus-visible")["outline-offset"])).toBeLessThan(0);
  });
});
