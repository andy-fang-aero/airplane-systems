import { afterEach, expect, it, vi } from "vitest";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";
import { getRewrittenUrl, unstable_getResponseFromNextConfig } from "next/experimental/testing/server";
import nextConfig from "../next.config";
import { VIEW_PATHS } from "@/lib/viewPaths";

// Next.js phase configuration and route testing: https://nextjs.org/docs/app/api-reference/config/next-config-js
// On Next.js upgrades, verify this documented experimental testing API remains compatible with the pinned version.
it("serves every known development view from the app page", async () => {
  const config = nextConfig(PHASE_DEVELOPMENT_SERVER);
  expect(config.output).toBeUndefined();
  for (const path of VIEW_PATHS.filter((path) => path !== "/")) {
    const response = await unstable_getResponseFromNextConfig({
      url: `https://example.com${path}`,
      nextConfig: config,
    });
    expect(getRewrittenUrl(response), path).toBe("https://example.com/");
  }
});

it("preserves unknown single system segments while leaving unrelated paths alone in development", async () => {
  const config = nextConfig(PHASE_DEVELOPMENT_SERVER);
  for (const path of ["/sr22t/bogus", "/sr22t/electrical?fiki=0"]) {
    const response = await unstable_getResponseFromNextConfig({
      url: `https://example.com${path}`,
      nextConfig: config,
    });
    expect(new URL(getRewrittenUrl(response)!).pathname).toBe("/");
    if (path.includes("?")) expect(new URL(getRewrittenUrl(response)!).search).toBe("?fiki=0");
  }
  for (const path of ["/nope", "/electrical", "/sr22t/electrical/extra", "/_next/static/chunks/app.js"]) {
    const response = await unstable_getResponseFromNextConfig({
      url: `https://example.com${path}`,
      nextConfig: config,
    });
    expect(getRewrittenUrl(response), path).toBeNull();
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
});

it("keeps the server view rule in a default production build", async () => {
  vi.stubEnv("STATIC_EXPORT", "");
  const config = nextConfig(PHASE_PRODUCTION_BUILD);
  expect(config.output).toBeUndefined();
  const response = await unstable_getResponseFromNextConfig({
    url: "https://example.com/sr22t/electrical",
    nextConfig: config,
  });
  expect(getRewrittenUrl(response)).toBe("https://example.com/");
});

it("exports production files without any server view rule when STATIC_EXPORT=1", () => {
  vi.stubEnv("STATIC_EXPORT", "1");
  const config = nextConfig(PHASE_PRODUCTION_BUILD);
  expect(config.output).toBe("export");
  expect(config.rewrites).toBeUndefined();
});

it("keeps the development view rule even when STATIC_EXPORT=1", () => {
  vi.stubEnv("STATIC_EXPORT", "1");
  const config = nextConfig(PHASE_DEVELOPMENT_SERVER);
  expect(config.output).toBeUndefined();
  expect(config.rewrites).toBeDefined();
});
