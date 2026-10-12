/** A STATIC_EXPORT=1 build omits Vercel Analytics, whose /_vercel/insights script a plain file host cannot serve. */
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";
import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "@/next.config";
import { vercelAnalytics } from "@/lib/staticExport";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Vercel Analytics in static exports", () => {
  it("a STATIC_EXPORT=1 build exports with NEXT_PUBLIC_STATIC_EXPORT=1, which drops Analytics", () => {
    vi.stubEnv("STATIC_EXPORT", "1");
    const config = nextConfig(PHASE_PRODUCTION_BUILD);
    expect(config.output).toBe("export");
    expect(config.env).toEqual({ NEXT_PUBLIC_STATIC_EXPORT: "1" });
    expect(vercelAnalytics(config.env?.NEXT_PUBLIC_STATIC_EXPORT)).toBe(false);
  });

  it("a default build sets no flag and keeps Analytics", () => {
    vi.stubEnv("STATIC_EXPORT", "");
    for (const phase of [PHASE_PRODUCTION_BUILD, PHASE_DEVELOPMENT_SERVER]) {
      const config = nextConfig(phase);
      expect(config.output).toBeUndefined();
      expect(config.env?.NEXT_PUBLIC_STATIC_EXPORT).toBeUndefined();
      expect(vercelAnalytics(config.env?.NEXT_PUBLIC_STATIC_EXPORT)).toBe(true);
    }
  });

  it("next dev keeps Analytics even with STATIC_EXPORT=1", () => {
    vi.stubEnv("STATIC_EXPORT", "1");
    expect(nextConfig(PHASE_DEVELOPMENT_SERVER).env?.NEXT_PUBLIC_STATIC_EXPORT).toBeUndefined();
  });
});
