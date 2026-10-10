import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { AIRCRAFT_IDS } from "@/lib/systems";
import { VIEW_PATHS } from "@/lib/viewPaths";

const source = readFileSync(new URL("../infra/cloudfront/view-rewrite.js", import.meta.url), "utf8");
type Query = Record<string, { value: string; multiValue?: { value: string }[] }>;
const run = (uri: string, querystring: Query = {}) => {
  const request = { uri, querystring, method: "GET", headers: {}, cookies: {} };
  const context = { event: { request } };
  return { request, result: runInNewContext(source + "\nhandler(event);", context) };
};
const paths = VIEW_PATHS.filter((path) => path !== "/");

describe("CloudFront viewer-request view rule", () => {
  it("covers all 101 aircraft/view paths and keeps the copied airplane list current", () => {
    expect(paths).toHaveLength(101);
    expect(runInNewContext(source + "\nAIRCRAFT_IDS;")).toEqual(AIRCRAFT_IDS);
  });

  it.each(paths)("rewrites %s to the exported root with the query untouched", (path) => {
    const query = { fiki: { value: "0" } };
    const { request, result } = run(path, query);
    expect(result).toBe(request);
    expect(result.uri).toBe("/index.html");
    expect(result.querystring).toBe(query);
    expect(result.method).toBe("GET");
  });

  it("keeps the existing any-single-system-segment behavior", () => {
    expect(run("/sr22t/bogus").result.uri).toBe("/index.html");
  });

  it.each(["/sr22t/", "/sr22t/electrical/"])("redirects %s with encoded and repeated queries intact", (uri) => {
    const { request, result } = run(uri, {
      fiki: { value: "0" },
      "a%20b": { value: "x%2Fy", multiValue: [{ value: "x%2Fy" }, { value: "z+q" }] },
      empty: { value: "" },
    });
    expect(result.statusCode).toBe(308);
    expect(result.headers.location.value).toBe(uri.slice(0, -1) + "?fiki=0&a%20b=x%2Fy&a%20b=z+q&empty=");
    expect(request.uri).toBe(uri);
  });

  it("escapes raw query separators and control characters in names and repeated values", () => {
    const { result } = run("/sr22t/", {
      "a&b=\r\n": { value: "x&y=\r\n#% café", multiValue: [{ value: "x&y=\r\n#% café" }, { value: "😀" }] },
      encoded: { value: "x%26y%0D%0A" },
      plus: { value: "+%2B" },
    });
    expect(result.headers.location.value).toBe(
      "/sr22t?a%26b%3D%0D%0A=x%26y%3D%0D%0A%23%25%20caf%C3%A9&a%26b%3D%0D%0A=%F0%9F%98%80&encoded=x%26y%0D%0A&plus=+%2B",
    );
    expect(result.headers.location.value).not.toMatch(/[\r\n]/);
  });

  it.each(AIRCRAFT_IDS)("redirects both trailing-slash forms for %s without an empty query suffix", (ac) => {
    for (const uri of [`/${ac}/`, `/${ac}/bogus/`]) {
      expect(run(uri).result.headers.location.value).toBe(uri.slice(0, -1));
    }
  });

  it.each([
    "/",
    "/nope",
    "/electrical",
    "/sr22t/electrical/extra",
    "/_next/static/chunks/x.js",
    "/index.txt",
    "/icon.svg",
    "/nope/",
    "/nope/electrical/",
    "/sr22t//",
    "/SR22T/electrical",
  ])("passes %s through for DefaultRootObject or origin files/404s", (uri) => {
    const { request, result } = run(uri, { fiki: { value: "0" } });
    expect(result).toBe(request);
    expect(result.uri).toBe(uri);
  });
});
