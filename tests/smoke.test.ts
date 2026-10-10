// scripts/smoke.mjs: the pure helpers against fixed fixtures, then the whole script against an
// in-process node:http server on 127.0.0.1 that answers like the S3 + CloudFront site should ("good") or like a
// misconfigured host ("bad"). No external network and no deploy.
import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assetUrls, evaluate, HTML_CACHE, parseBase, summarize } from "../scripts/smoke.mjs";

const SCRIPT = fileURLToPath(new URL("../scripts/smoke.mjs", import.meta.url));

// The shape of the exported index.html (the static export): assets by absolute path.
const INDEX_HTML = [
  "<!DOCTYPE html><html><head>",
  '<link rel="preload" href="/_next/static/media/inter.p.woff2" as="font" crossorigin="" type="font/woff2"/>',
  '<link rel="stylesheet" href="/_next/static/css/app.css" data-precedence="next"/>',
  '<script src="/_next/static/chunks/089cv_5n2ifmm.js" async=""></script>',
  '<script src="/_next/static/chunks/089cv_5n2ifmm.js" async=""></script>',
  '<link rel="icon" href="/icon.svg"/>',
  "</head><body><div>airplane systems</div></body></html>",
].join("");
const ASSETS = [
  "/_next/static/media/inter.p.woff2",
  "/_next/static/css/app.css",
  "/_next/static/chunks/089cv_5n2ifmm.js",
];
const NOT_FOUND_HTML = "<!DOCTYPE html><html><body><h1>404</h1>This page could not be found.</body></html>";
const HTML = "text/html; charset=utf-8";
const IMMUTABLE = "public, max-age=31536000, immutable";

const res = (status: number, headers: Record<string, string> = {}, body = "") => ({ status, headers, body });

describe("assetUrls", () => {
  it("finds script, stylesheet and font preload URLs under /_next/static/, once each", () => {
    expect(assetUrls(INDEX_HTML)).toEqual(ASSETS);
  });

  it("ignores non-static links and URLs that only appear in text", () => {
    expect(assetUrls('<link href="/icon.svg"/><p>see /_next/static/chunks/x.js</p>')).toEqual([]);
  });

  it("decodes &amp; in an attribute", () => {
    expect(assetUrls('<script src="/_next/static/chunks/a.js?v=1&amp;w=2"></script>')).toEqual([
      "/_next/static/chunks/a.js?v=1&w=2",
    ]);
  });
});

describe("evaluate", () => {
  const cases: [string, object, ReturnType<typeof res>, ReturnType<typeof res>][] = [
    ["status", { status: 404 }, res(404), res(200)],
    [
      "content-type prefix",
      { contentType: "text/html" },
      res(200, { "content-type": HTML }),
      res(200, { "content-type": "application/xml" }),
    ],
    ["body includes", { bodyIncludes: "/_next/static/" }, res(200, {}, INDEX_HTML), res(200, {}, NOT_FOUND_HTML)],
    ["body equals", { bodyEquals: NOT_FOUND_HTML }, res(404, {}, NOT_FOUND_HTML), res(404, {}, INDEX_HTML)],
    [
      "short HTML cache, any order",
      { cacheControl: HTML_CACHE },
      res(200, { "cache-control": "max-age=60, public" }),
      res(200, { "cache-control": "s-maxage=31536000" }),
    ],
    [
      "short HTML cache, nothing extra",
      { cacheControl: HTML_CACHE },
      res(200, { "cache-control": "public, max-age=60" }),
      res(200, { "cache-control": "public, max-age=60, immutable" }),
    ],
    [
      "immutable asset",
      { cacheIncludes: "immutable" },
      res(200, { "cache-control": IMMUTABLE }),
      res(200, { "cache-control": "public, max-age=60" }),
    ],
    [
      "308 to /sr22t",
      { status: 308, locationEndsWith: "/sr22t" },
      res(308, { location: "/sr22t" }),
      res(308, { location: "/sr22t/" }),
    ],
    // The HTTP-to-HTTPS row: the in-process server is plain HTTP, so only this fixture covers it.
    [
      "HTTP to HTTPS",
      { status: 301, location: "https://d1.cloudfront.net/" },
      res(301, { location: "https://d1.cloudfront.net/" }),
      res(200, {}, INDEX_HTML),
    ],
  ];

  it.each(cases)("%s: passes on the good response, fails on the bad one", (_name, expectation, good, bad) => {
    expect(evaluate({ expect: expectation }, good)).toEqual({ ok: true, problems: [] });
    const failed = evaluate({ expect: expectation }, bad);
    expect(failed.ok).toBe(false);
    expect(failed.problems.length).toBeGreaterThan(0);
  });

  it("reports every unmet expectation of one check", () => {
    const failed = evaluate(
      { expect: { status: 404, contentType: "text/html", bodyEquals: NOT_FOUND_HTML } },
      res(200, { "content-type": "application/json" }, "{}"),
    );
    expect(failed.problems).toHaveLength(3);
  });
});

describe("summarize", () => {
  const passed = { url: "http://h/", label: "200", status: 200, ok: true };
  const skipped = { url: "http://h/", label: "301", status: null, ok: true, skipped: true };
  const failed = { url: "http://h/nope", label: "404", status: 200, ok: false };

  it("is ok when every check passed or was skipped", () => {
    expect(summarize("http://h", [passed, skipped])).toEqual({
      base: "http://h",
      ok: true,
      checks: [
        { url: "http://h/", expect: "200", status: 200, ok: true },
        { url: "http://h/", expect: "301", status: null, ok: true, skipped: true },
      ],
    });
  });

  it("is not ok when any check failed", () => {
    expect(summarize("http://h", [passed, failed]).ok).toBe(false);
  });
});

describe("parseBase", () => {
  it("accepts http and https URLs and drops a trailing slash", () => {
    expect(parseBase("https://d1.cloudfront.net/")).toBe("https://d1.cloudfront.net");
    expect(parseBase("http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000");
  });

  it("rejects a missing, malformed or non-http argument", () => {
    expect(parseBase(undefined)).toBeNull();
    expect(parseBase("not a url")).toBeNull();
    expect(parseBase("ftp://d1.cloudfront.net")).toBeNull();
  });
});

type Mode = "good" | "bad" | "no404" | "badmime";

/**
 * Answers like the S3 + CloudFront site (see infra/cloudfront/README.md), or, in "bad" mode, like a misconfigured host. In
 * "no404" mode the site is good except that /404.html itself is missing (404), as when the page was never uploaded.
 */
function answer(mode: Mode, path: string): [number, Record<string, string>, string] {
  const page: [number, Record<string, string>, string] = [
    200,
    { "content-type": HTML, "cache-control": mode === "bad" ? "s-maxage=31536000" : "public, max-age=60" },
    INDEX_HTML,
  ];
  if (path === "/" || ["/sr22t", "/sr22t/electrical", "/sr22t/bogus"].includes(path)) return page;
  if (ASSETS.includes(path))
    return [
      200,
      {
        "content-type":
          mode === "badmime"
            ? "application/octet-stream"
            : path.endsWith(".js")
              ? "text/javascript"
              : path.endsWith(".css")
                ? "text/css"
                : "font/woff2",
        "cache-control": IMMUTABLE,
      },
      "x",
    ];
  if (path === "/sr22t/") return [308, { location: "/sr22t" }, ""];
  if (path === "/404.html") return [mode === "no404" ? 404 : 200, { "content-type": HTML }, NOT_FOUND_HTML];
  if (mode === "bad" && path === "/nope") return page; // a host that maps errors to index.html
  if (mode === "bad" && path === "/sr22t/electrical/extra") return [404, { "content-type": HTML }, "Not Found"];
  return [404, { "content-type": HTML }, NOT_FOUND_HTML];
}

const serve = (mode: Mode) =>
  createServer((req, out) => {
    const [status, headers, body] = answer(mode, req.url ?? "");
    out.writeHead(status, headers).end(body);
  });
const servers: Record<Mode, Server> = {
  good: serve("good"),
  bad: serve("bad"),
  no404: serve("no404"),
  badmime: serve("badmime"),
};
const baseOf = (mode: Mode) => `http://127.0.0.1:${(servers[mode].address() as AddressInfo).port}`;

beforeAll(async () => {
  for (const s of Object.values(servers)) await new Promise<void>((ok) => s.listen(0, "127.0.0.1", ok));
});
afterAll(async () => {
  for (const s of Object.values(servers)) await new Promise((done) => s.close(done));
});

/** Runs the script asynchronously (a sync spawn would block this process's server) and returns exit code and output. */
function smoke(...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((done) =>
    execFile(process.execPath, [SCRIPT, ...args], (err, stdout, stderr) =>
      done({ code: err ? Number(err.code) : 0, stdout, stderr }),
    ),
  );
}

describe("scripts/smoke.mjs end to end", () => {
  it("passes against the good server: exit 0 and ok true", async () => {
    const { code, stdout, stderr } = await smoke(baseOf("good"));
    const summary = JSON.parse(stdout);
    expect({ code, ok: summary.ok, stderr }).toEqual({ code: 0, ok: true, stderr: "" });
    expect(summary.base).toBe(baseOf("good"));
    const urls = summary.checks.map((c: { url: string }) => c.url.replace(baseOf("good"), ""));
    for (const path of [
      "/",
      "/sr22t",
      "/sr22t/electrical",
      "/sr22t/bogus",
      ...ASSETS,
      "/sr22t/",
      "/nope",
      "/sr22t/electrical/extra",
    ])
      expect(urls).toContain(path);
    // Plain HTTP base: the HTTP-to-HTTPS row is recorded as skipped.
    expect(summary.checks.at(-1)).toMatchObject({ url: `${baseOf("good")}/`, ok: true, skipped: true, status: null });
  });

  it("fails against the bad server: exit 1, naming the /nope status, the / cache header and the 404 body", async () => {
    const base = baseOf("bad");
    const { code, stdout, stderr } = await smoke(base);
    const summary = JSON.parse(stdout);
    expect(code).toBe(1);
    expect(summary.ok).toBe(false);
    const failing = summary.checks
      .filter((c: { ok: boolean }) => !c.ok)
      .map((c: { url: string; status: number }) => [c.url.replace(base, ""), c.status]);
    expect(failing).toEqual([
      ["/", 200], // cache-control
      ["/nope", 200],
      ["/sr22t/electrical/extra", 404],
    ]);
    expect(stderr).toContain(`FAIL ${base}/ (cache-control: public, max-age=60): cache-control "s-maxage=31536000"`);
    expect(stderr).toContain(`FAIL ${base}/nope (404 text/html, body equals /404.html): status 200, want 404`);
    expect(stderr).toContain(
      `FAIL ${base}/sr22t/electrical/extra (404 text/html, body equals /404.html): body differs from /404.html`,
    );
  });

  it("fails when /404.html itself does not answer 200: the 404 rows name the missing page", async () => {
    const base = baseOf("no404");
    const { code, stdout, stderr } = await smoke(base);
    const summary = JSON.parse(stdout);
    expect({ code, ok: summary.ok }).toEqual({ code: 1, ok: false });
    const failing = summary.checks
      .filter((c: { ok: boolean }) => !c.ok)
      .map((c: { url: string; status: number }) => [c.url.replace(base, ""), c.status]);
    expect(failing).toEqual([
      ["/nope", 404],
      ["/sr22t/electrical/extra", 404],
    ]);
    expect(stderr).toContain(`FAIL ${base}/nope (404 text/html, body equals /404.html): body differs from /404.html`);
  });

  it("fails on an unavailable reserved destination: exit 1, every row without a status", async () => {
    // Listen on a free port, then close it: nothing answers there, so each request is refused.
    // TCP port zero is reserved: no other worker can acquire this destination.
    const base = "http://127.0.0.1:0";
    const { code, stdout, stderr } = await smoke(base);
    const summary = JSON.parse(stdout);
    expect({ code, ok: summary.ok }).toEqual({ code: 1, ok: false });
    expect(summary.checks.every((c: { status: number | null }) => c.status === null)).toBe(true);
    // Every check except the skipped HTTP-to-HTTPS row fails, each with an actionable line naming the error.
    const failed = summary.checks.filter((c: { ok: boolean }) => !c.ok);
    expect(failed.length).toBe(summary.checks.length - 1);
    for (const c of failed) {
      const line = stderr.split("\n").find((line) => line.startsWith(`FAIL ${c.url} (`));
      expect(line).toMatch(/EADDRNOTAVAIL|ECONNREFUSED/);
    }
  });

  it("rejects referenced assets with incorrect MIME types", async () => {
    const { code, stdout, stderr } = await smoke(baseOf("badmime"));
    expect(code).toBe(1);
    const failed = JSON.parse(stdout).checks.filter((c: { ok: boolean }) => !c.ok);
    expect(failed.map((c: { url: string }) => new URL(c.url).pathname)).toEqual(ASSETS);
    expect(stderr).toContain("content-type");
  });

  it("exits 2 without a base URL", async () => {
    const { code, stdout, stderr } = await smoke();
    expect({ code, stdout }).toEqual({ code: 2, stdout: "" });
    expect(stderr).toContain("usage: npm run smoke -- <base-url>");
  });
});
