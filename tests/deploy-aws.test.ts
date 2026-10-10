/**
 * scripts/deploy-aws.sh without AWS: each test copies the script into a throwaway git repo with a bare "origin", and
 * puts stub `aws` and `npm` commands first on PATH. The stubs log every call and answer from fixed fixtures, so the
 * tests check the argument parsing, the guards, the upload cache headers and the JSON summary, offline. The `npm`
 * stub also records the files of the tree it builds, so tests can check the build used exactly the commit's tree.
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Every test here runs deploy-aws.sh as a subprocess that starts dozens of git and node stub processes. On a loaded
// machine a single deploy took 6.7 s, over vitest's 5 s default; 20 s leaves about 3x that worst case.
vi.setConfig({ testTimeout: 20_000 });

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts");
const SCRIPT = join(SCRIPTS, "deploy-aws.sh");
// Placeholder account and region: the script names neither; each deployer supplies their own.
const ACCOUNT = "123456789012";
const REGION = "us-east-1";
const PARTITION = "aws";
const FUNCTION_NAME = "airplane-systems-site-view-rewrite";
const FUNCTION_ARN = `arn:${PARTITION}:cloudfront::${ACCOUNT}:function/${FUNCTION_NAME}`;
const FUNCTION_CODE = "function handler(event) {\n  return event.request;\n}\n";
const SUMMARY_KEYS = [
  "ok",
  "exit_code",
  "step",
  "error",
  "mode",
  "commit",
  "account",
  "region",
  "stack",
  "bucket",
  "distribution_id",
  "site_url",
  "invalidation_id",
  "smoke",
  "warnings",
];

// `aws` stub: logs its argv as one JSON line, answers by subcommand; STUB_* variables select the failure cases
const AWS_STUB = `#!/usr/bin/env node
const fs = require("fs");
const a = process.argv.slice(2);
fs.appendFileSync(process.env.STUB_LOG, JSON.stringify(["aws", ...a]) + "\\n");
const env = process.env;
const cmd = a[0] + " " + a[1];
if (cmd === "sts get-caller-identity") {
  if (env.STUB_STS_FAIL) { console.error("Unable to locate credentials"); process.exit(255); }
  console.log(env.STUB_ACCOUNT);
} else if (cmd === "cloudformation describe-stacks") {
  if (env.STUB_NO_STACK) { console.error("Stack with id x does not exist"); process.exit(254); }
  const q = a[a.indexOf("--query") + 1];
  const key = /OutputKey=='(\\w+)'/.exec(q)[1];
  const domain = env.STUB_DOMAIN ?? "dtest.cloudfront.net";
  const outputs = { BucketName: "test-bucket", DistributionId: "ETEST123", DistributionDomainName: domain };
  console.log(key === env.STUB_MISSING_OUTPUT ? "None" : outputs[key]);
} else if (cmd === "cloudfront get-distribution-config") {
  if (env.STUB_DIST_CONFIG_FAIL) { console.error("AccessDenied"); process.exit(254); }
  console.log(env.STUB_ASSOC_ARN);
} else if (cmd === "cloudfront get-function") {
  const src = env.STUB_FUNCTIONS + "/" + a[a.indexOf("--name") + 1] + ".js";
  if (!fs.existsSync(src)) { console.error("NoSuchFunctionExists"); process.exit(254); }
  fs.copyFileSync(src, a[a.length - 1]);
  console.log("{}");
} else if (cmd === "s3 sync" || cmd === "s3 cp") {
  if (env.STUB_SYNC_FAIL || (cmd === "s3 cp" && env.STUB_CP_FAIL) || (cmd === "s3 sync" && env.STUB_TYPED_SYNC_FAIL && a[a.indexOf("--include") + 1] === "*." + env.STUB_TYPED_SYNC_FAIL)) process.exit(1);
} else if (cmd === "cloudfront create-invalidation") {
  if (env.STUB_INVALIDATION_FAIL) { console.error("TooManyInvalidationsInProgress"); process.exit(254); }
  console.log("STUB_INVALIDATION_ID" in env ? env.STUB_INVALIDATION_ID : "ITESTINVALIDATION");
} else if (cmd === "cloudfront wait") {
  if (env.STUB_WAIT_FAIL) { console.error("Waiter InvalidationCompleted failed"); process.exit(255); }
} else {
  console.error("aws stub: unexpected call " + a.join(" "));
  process.exit(99);
}
`;

// `npm` stub: \`STATIC_EXPORT=1 npm run build\` writes a minimal static export into out/
const NPM_STUB = `#!/usr/bin/env node
const fs = require("fs");
const a = process.argv.slice(2);
fs.appendFileSync(process.env.STUB_LOG, JSON.stringify(["npm", ...a]) + "\\n");
if (a[0] === "ci" && process.env.STUB_CI_FAIL) process.exit(1);
if (a[0] === "run" && a[1] === "build") {
  if (process.env.STUB_BUILD_FAIL) process.exit(1);
  // a build without STATIC_EXPORT=1 is a server build: it writes no out/
  if (process.env.STATIC_EXPORT !== "1") process.exit(0);
  // record every file of the tree being built (not out/ or node_modules/), path -> content
  const files = {};
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = dir === "." ? e.name : dir + "/" + e.name;
      if (rel === "out" || rel === "node_modules") continue;
      if (e.isDirectory()) walk(rel);
      else files[rel] = fs.readFileSync(rel, "utf8");
    }
  };
  walk(".");
  fs.writeFileSync(process.env.STUB_TREE_LOG, JSON.stringify(files));
  fs.mkdirSync("out/_next/static/chunks", { recursive: true });
  fs.mkdirSync("out/_next/static/media", { recursive: true });
  fs.writeFileSync("out/index.html", "<html></html>");
  fs.writeFileSync("out/404.html", "<html>404</html>");
  fs.writeFileSync("out/_next/static/chunks/a.js", "");
  fs.writeFileSync("out/_next/static/media/f.woff2", "");
}
`;

// the repo's smoke script, replaced by one that logs its argument and prints a fixed summary
const SMOKE_STUB = `import fs from "node:fs";
fs.appendFileSync(process.env.STUB_LOG, JSON.stringify(["smoke", ...process.argv.slice(2)]) + "\\n");
const ok = !process.env.STUB_SMOKE_FAIL;
if (process.env.STUB_SMOKE_INVALID) { console.log("invalid JSON"); process.exit(ok ? 0 : 1); }
console.log(JSON.stringify({ base: process.argv[2], ok, checks: [{ url: process.argv[2] + "/", ok }] }, null, 2));
process.exit(ok ? 0 : 1);
`;

let root: string;
let repo: string;
let env: NodeJS.ProcessEnv;
let liveFunction: string;

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

function commitAll(cwd: string, message: string) {
  git(cwd, "add", "-A");
  git(cwd, "commit", "-q", "-m", message);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "deploy-aws-test-"));
  const bin = join(root, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "aws"), AWS_STUB);
  writeFileSync(join(bin, "npm"), NPM_STUB);
  chmodSync(join(bin, "aws"), 0o755);
  chmodSync(join(bin, "npm"), 0o755);
  mkdirSync(join(root, "functions"));
  liveFunction = join(root, "functions", `${FUNCTION_NAME}.js`);
  writeFileSync(liveFunction, FUNCTION_CODE);
  env = {
    NODE_ENV: "test",
    PATH: `${bin}:${process.env.PATH}`,
    HOME: root,
    GIT_CONFIG_GLOBAL: join(root, "gitconfig"),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@example.com",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@example.com",
    STUB_LOG: join(root, "calls.log"),
    STUB_TREE_LOG: join(root, "built-tree.json"),
    DEPLOY_AWS_ACCOUNT: ACCOUNT,
    DEPLOY_AWS_REGION: REGION,
    STUB_ACCOUNT: ACCOUNT,
    STUB_FUNCTIONS: join(root, "functions"),
    STUB_ASSOC_ARN: FUNCTION_ARN,
  };
  writeFileSync(env.GIT_CONFIG_GLOBAL!, "[init]\n\tdefaultBranch = main\n");
  writeFileSync(env.STUB_LOG!, "");
  git(root, "init", "-q", "--bare", "origin.git");
  repo = join(root, "repo");
  git(root, "clone", "-q", join(root, "origin.git"), "repo");
  mkdirSync(join(repo, "scripts"));
  mkdirSync(join(repo, "infra", "cloudfront"), { recursive: true });
  copyFileSync(SCRIPT, join(repo, "scripts", "deploy-aws.sh"));
  writeFileSync(join(repo, "scripts", "smoke.mjs"), SMOKE_STUB);
  writeFileSync(join(repo, "infra", "cloudfront", "view-rewrite.js"), FUNCTION_CODE);
  writeFileSync(join(repo, ".gitignore"), "out/\n");
  commitAll(repo, "first");
  git(repo, "push", "-q", "origin", "main");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function deploy(...args: string[]) {
  return invokeDeploy(repo, join(repo, "scripts", "deploy-aws.sh"), ...args);
}

function invokeDeploy(cwd: string, script: string, ...args: string[]) {
  const r = spawnSync("bash", [script, ...args], { cwd, env, encoding: "utf8" });
  const lines = r.stdout.trim().split("\n");
  expect(lines, `stdout must be one JSON line; stderr:\n${r.stderr}`).toHaveLength(1);
  const calls = readFileSync(env.STUB_LOG!, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as string[]);
  const summary = JSON.parse(lines[0]);
  expect(Object.keys(summary)).toEqual(SUMMARY_KEYS);
  expect(summary.exit_code, "the summary's exit_code is the process exit code").toBe(r.status);
  expect(summary.ok).toBe(r.status === 0);
  return { code: r.status, summary, stderr: r.stderr, calls };
}

/** Every file of `rev`'s tree in `cwd`'s repository, path -> content; submodule entries are left out. */
function commitTree(rev: string, cwd = repo) {
  const files: Record<string, string> = {};
  for (const line of git(cwd, "ls-tree", "-r", "--full-tree", rev).split("\n")) {
    const [meta, path] = line.split("\t");
    const [, type, blob] = meta.split(" ");
    if (type === "blob") {
      files[path] = execFileSync("git", ["cat-file", "blob", blob], { cwd, env, encoding: "utf8" });
    }
  }
  return files;
}

/** The files the `npm` stub saw when `npm run build` ran. */
const builtTree = () => JSON.parse(readFileSync(env.STUB_TREE_LOG!, "utf8")) as Record<string, string>;

/** Asserts the build used exactly `rev`'s tree, byte for byte. */
function expectBuiltFrom(rev: string) {
  expect(builtTree()).toEqual(commitTree(rev));
}

const awsCalls = (calls: string[][], sub: string) => calls.filter((c) => c[0] === "aws" && c[1] + " " + c[2] === sub);
const flag = (call: string[], name: string) => call[call.indexOf(name) + 1];
const flags = (call: string[], name: string) => call.flatMap((a, i) => (a === name ? [call[i + 1]] : []));

describe("a normal deploy", () => {
  it("uploads hashed assets as immutable and everything else with a short cache, never deleting", () => {
    const { calls } = deploy();
    const [assets, ...typedAndRest] = awsCalls(calls, "s3 sync");
    const [rest] = awsCalls(calls, "s3 cp");
    expect(rest).toContain("--recursive");
    expect(assets.slice(3, 5)).toEqual(["out/_next/static", "s3://test-bucket/_next/static"]);
    expect(flag(assets, "--cache-control")).toBe("public, max-age=31536000, immutable");
    expect(flags(assets, "--exclude")).toEqual(["*.woff2", "*.js", "*.css"]);
    // SecurityHeadersPolicy sends nosniff, so fonts, scripts and stylesheets carry an explicit type.
    expect(typedAndRest.map((c) => [flag(c, "--include"), flag(c, "--content-type")])).toEqual([
      ["*.woff2", "font/woff2"],
      ["*.js", "text/javascript"],
      ["*.css", "text/css"],
    ]);
    for (const typed of typedAndRest) {
      expect(typed.slice(3, 5)).toEqual(["out/_next/static", "s3://test-bucket/_next/static"]);
      expect(flag(typed, "--exclude")).toBe("*");
      expect(flag(typed, "--cache-control")).toBe("public, max-age=31536000, immutable");
    }
    expect(rest.slice(3, 5)).toEqual(["out", "s3://test-bucket"]);
    expect(flag(rest, "--exclude")).toBe("_next/static/*");
    expect(flag(rest, "--cache-control")).toBe("public, max-age=60");
    expect(calls.flat()).not.toContain("--delete");
    expect(calls.some((c) => c.join(" ").includes("delete"))).toBe(false);
  });

  it("invalidates and waits for that invalidation", () => {
    const { calls } = deploy();
    const [create] = awsCalls(calls, "cloudfront create-invalidation");
    expect(flag(create, "--distribution-id")).toBe("ETEST123");
    expect(flag(create, "--paths")).toBe("/*");
    const [wait] = awsCalls(calls, "cloudfront wait");
    expect(wait[3]).toBe("invalidation-completed");
    expect(flag(wait, "--distribution-id")).toBe("ETEST123");
    expect(flag(wait, "--id")).toBe("ITESTINVALIDATION");
  });

  it("checks the LIVE stage of the Function associated with the stack's distribution", () => {
    const { calls } = deploy();
    const [config] = awsCalls(calls, "cloudfront get-distribution-config");
    expect(flag(config, "--id")).toBe("ETEST123");
    expect(flag(config, "--query")).toMatch(/DefaultCacheBehavior\.FunctionAssociations.*viewer-request/);
    const [get] = awsCalls(calls, "cloudfront get-function");
    expect(flag(get, "--name")).toBe(FUNCTION_NAME);
    expect(flag(get, "--stage")).toBe("LIVE");
  });
});

describe("configuration", () => {
  it("refuses without an expected account (exit 2) before calling AWS", () => {
    delete env.DEPLOY_AWS_ACCOUNT;
    const { code, summary, calls, stderr } = deploy();
    expect(code).toBe(2);
    expect(summary).toMatchObject({ ok: false, step: "args" });
    expect(stderr).toContain("DEPLOY_AWS_ACCOUNT");
    expect(calls).toEqual([]);
  });

  it("refuses an account id that is not 12 digits (exit 2)", () => {
    const { code, calls } = deploy("--account", "my-account");
    expect(code).toBe(2);
    expect(calls).toEqual([]);
  });

  it("refuses without a region (exit 2) before calling AWS", () => {
    delete env.DEPLOY_AWS_REGION;
    delete env.AWS_REGION;
    const { code, stderr, calls } = deploy();
    expect(code).toBe(2);
    expect(stderr).toContain("DEPLOY_AWS_REGION");
    expect(calls).toEqual([]);
  });

  it("takes the account and region from options over the environment", () => {
    env.DEPLOY_AWS_ACCOUNT = "999999999999";
    const { code, summary, calls } = deploy("--account", ACCOUNT, "--region", "eu-west-1");
    expect(code).toBe(0);
    expect(summary).toMatchObject({ account: ACCOUNT, region: "eu-west-1" });
    for (const call of awsCalls(calls, "cloudformation describe-stacks"))
      expect(flag(call, "--region")).toBe("eu-west-1");
  });

  it("builds the static export (STATIC_EXPORT=1)", () => {
    const { code, calls } = deploy();
    expect(code).toBe(0);
    expect(calls.some((c) => c[0] === "npm" && c[1] === "run" && c[2] === "build")).toBe(true);
  });

  it("refuses a viewer-request Function that belongs to another account (exit 6)", () => {
    env.STUB_ASSOC_ARN = `arn:${PARTITION}:cloudfront::111111111111:function/${FUNCTION_NAME}`;
    const { code, summary } = deploy();
    expect(code).toBe(6);
    expect(summary).toMatchObject({ ok: false, step: "function" });
  });
});

describe("guards", () => {
  it("refuses another AWS account (exit 3) before touching git or the stack", () => {
    env.STUB_ACCOUNT = "111111111111";
    const { code, summary, calls } = deploy();
    expect(code).toBe(3);
    expect(summary).toMatchObject({ ok: false, step: "account", account: "111111111111" });
    expect(calls).toHaveLength(1);
  });

  function advanceMain(file = "new.txt") {
    const other = join(root, "other");
    if (!existsSync(other)) git(root, "clone", "-q", join(root, "origin.git"), "other");
    git(other, "pull", "-q", "--ff-only");
    writeFileSync(join(other, file), "x");
    commitAll(other, "advance main");
    git(other, "push", "-q", "origin", "main");
    return git(other, "rev-parse", "HEAD");
  }

  it("refuses when git fetch fails (exit 4)", () => {
    git(repo, "remote", "set-url", "origin", join(root, "missing.git"));
    const { code, summary } = deploy();
    expect(code).toBe(4);
    expect(summary.error).toMatch(/git fetch of main from origin failed/);
  });

  it("fetches main even when remote.origin.fetch leaves it out, and deploys it, not the stale HEAD", () => {
    git(repo, "push", "-q", "origin", "HEAD:refs/heads/other");
    git(repo, "config", "remote.origin.fetch", "+refs/heads/other:refs/remotes/origin/other");
    const newer = advanceMain();
    git(repo, "fetch", "-q", "origin");
    expect(git(repo, "rev-parse", "origin/main")).not.toBe(newer);
    const { code, summary } = deploy();
    expect(code).toBe(0);
    expect(summary.commit).toBe(newer);
    expect(summary.warnings.join("\n")).toMatch(/HEAD \(\w+\) is not the deployed commit/);
    expectBuiltFrom(newer);
  });
});

describe("the export is the commit's bytes, whatever the attributes (T5)", () => {
  function pushData(content: string, extra: Record<string, string> = {}) {
    writeFileSync(join(repo, "data.txt"), content);
    for (const [path, text] of Object.entries(extra)) writeFileSync(join(repo, path), text);
    commitAll(repo, "data");
    git(repo, "push", "-q", "origin", "main");
  }

  it("refuses a committed ident attribute, which git archive expands (exit 4 at export)", () => {
    pushData("version $Id$\n", { ".gitattributes": "data.txt ident\n" });
    const { code, summary, calls } = deploy();
    expect(code).toBe(4);
    expect(summary).toMatchObject({ step: "export" });
    expect(summary.error).toMatch(/does not match its tree byte for byte/);
    expect(calls).toHaveLength(1);
  });
});

describe("the working tree only warns, and the build is the commit's tree", () => {
  const expectWarnedAndClean = (pattern: RegExp) => {
    const { code, summary, stderr } = deploy();
    expect(code, stderr).toBe(0);
    expect(summary.warnings.join("\n")).toMatch(pattern);
    expect(stderr).toMatch(/warning: /);
    expectBuiltFrom("origin/main");
    return summary;
  };

  it("deploys origin/main, not an unpushed local commit, and warns", () => {
    writeFileSync(join(repo, "scripts", "smoke.mjs"), "// local commit\n");
    commitAll(repo, "local only");
    const summary = expectWarnedAndClean(/is not the deployed commit/);
    expect(summary.commit).toBe(git(repo, "rev-parse", "origin/main"));
  });

  describe("removes its scratch directory", () => {
    let scratch: string;

    beforeEach(() => {
      scratch = join(root, "scratch");
      mkdirSync(scratch);
      env.TMPDIR = scratch;
    });

    it("after a success", () => {
      expect(deploy().code).toBe(0);
      expect(readdirSync(scratch)).toEqual([]);
    });

    it("after a build failure", () => {
      env.STUB_BUILD_FAIL = "1";
      expect(deploy().code).toBe(7);
      expect(readdirSync(scratch)).toEqual([]);
    });
  });
});

describe("stack and Function guards", () => {
  it("refuses an unreadable stack (exit 5)", () => {
    env.STUB_NO_STACK = "1";
    expect(deploy().code).toBe(5);
  });

  it("refuses a LIVE Function that differs from the committed file (exit 6)", () => {
    writeFileSync(liveFunction, FUNCTION_CODE + "// other\n");
    const { code, summary } = deploy();
    expect(code).toBe(6);
    expect(summary.error).toMatch(/differs/);
  });
});

describe("failures after the guards", () => {
  it("stops on a failed build (exit 7) without uploading", () => {
    env.STUB_BUILD_FAIL = "1";
    const { code, summary, calls } = deploy();
    expect(code).toBe(7);
    expect(summary).toMatchObject({ ok: false, step: "build" });
    expect(awsCalls(calls, "s3 sync")).toEqual([]);
  });

  it("stops on a failed upload (exit 8) without invalidating", () => {
    env.STUB_SYNC_FAIL = "1";
    const { code, summary, calls } = deploy();
    expect(code).toBe(8);
    expect(summary).toMatchObject({ ok: false, step: "upload" });
    expect(awsCalls(calls, "cloudfront create-invalidation")).toEqual([]);
  });

  it("stops when create-invalidation fails (exit 9), without waiting or smoke-testing", () => {
    env.STUB_INVALIDATION_FAIL = "1";
    const { code, summary, calls } = deploy();
    expect(code).toBe(9);
    expect(summary).toMatchObject({ step: "invalidate", invalidation_id: null, smoke: null });
    expect(awsCalls(calls, "s3 sync")).toHaveLength(4);
    expect(awsCalls(calls, "s3 cp")).toHaveLength(1);
    expect(awsCalls(calls, "cloudfront wait")).toEqual([]);
    expect(calls.some((c) => c[0] === "smoke")).toBe(false);
  });

  it("reports a failed smoke test (exit 10) with its summary", () => {
    env.STUB_SMOKE_FAIL = "1";
    const { code, summary } = deploy();
    expect(code).toBe(10);
    expect(summary).toMatchObject({ ok: false, step: "smoke", invalidation_id: "ITESTINVALIDATION" });
    expect(summary.smoke).toMatchObject({ ok: false });
    expect(summary.error).toMatch(/--rollback-to/);
  });
});

describe("arguments", () => {
  it.each([[["--function-name", "other-fn"]]])("rejects %j with exit 2 before any AWS call", (args) => {
    const { code, summary, calls } = deploy(...args);
    expect(code).toBe(2);
    expect(summary).toMatchObject({ ok: false, exit_code: 2, step: "args" });
    expect(summary.error).toMatch(/--help/);
    expect(calls).toEqual([]);
  });
});

describe("--rollback-to", () => {
  let previous: string;

  beforeEach(() => {
    previous = git(repo, "rev-parse", "HEAD");
    writeFileSync(join(repo, "new.txt"), "x");
    commitAll(repo, "newer");
    git(repo, "push", "-q", "origin", "main");
  });

  it("refuses a commit that is not on origin/main (exit 4)", () => {
    git(repo, "switch", "-q", "-c", "side", previous);
    writeFileSync(join(repo, "side.txt"), "x");
    commitAll(repo, "side");
    const side = git(repo, "rev-parse", "HEAD");
    const { code, summary } = deploy("--rollback-to", side);
    expect(code).toBe(4);
    expect(summary.error).toMatch(/not on origin\/main/);
  });
});
