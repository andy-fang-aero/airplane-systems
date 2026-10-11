import { createHash } from "node:crypto";
import { readFileSync, appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const ENDORSE = "Trusted preview: SHA endorsement";
export const CLAIM = "Trusted preview: authorization attempt";
export class Refused extends Error {}
const insist = (ok, code) => {
  if (!ok) throw new Refused(code);
};
const integer = (n) => Number.isSafeInteger(n) && n > 0;
const sha = (s) => typeof s === "string" && /^[a-f0-9]{40}$/.test(s);
export const digest = (o) => createHash("sha256").update(JSON.stringify(o)).digest("hex");
const same = (a, b) => digest(a) === digest(b);
const approved = (p, u) => u?.type === "User" && p.approvedUserIds.includes(u.id);
const bot = (p, u) => u?.type === "Bot" && u.id === p.vercelBotId && u.login === "vercel[bot]";
const prefix = (p) => `/repos/${p.repository}`;
const get = (io, p, path) => io.gh("GET", prefix(p) + path);

export function validateRuntime(p, runtime, event) {
  insist(p.enabled === true && p.approvedUserIds.length > 0, "POLICY_DISABLED");
  insist(runtime.actions === "true" && runtime.attempt === "1", "RERUN_OR_LOCAL_REFUSED");
  insist(
    runtime.repository === p.repository &&
      runtime.workflowRef === `${p.repository}/${p.workflowPath}@refs/heads/${p.defaultBranch}`,
    "UNTRUSTED_WORKFLOW_REF",
  );
  insist(sha(runtime.workflowSha) && integer(runtime.runId), "INVALID_RUNTIME");
  insist(
    event.repository?.id === p.repositoryId &&
      event.repository.full_name === p.repository &&
      event.repository.default_branch === p.defaultBranch,
    "WRONG_EVENT_REPOSITORY",
  );
}

export async function currentPolicy(io, p) {
  const file = await get(io, p, `/contents/${p.policyPath}?ref=${p.defaultBranch}`);
  insist(file.encoding === "base64" && typeof file.content === "string", "POLICY_UNREADABLE");
  let current;
  try {
    current = JSON.parse(Buffer.from(file.content, "base64").toString("utf8"));
  } catch {
    throw new Refused("POLICY_INVALID");
  }
  insist(same(p, current), "POLICY_CHANGED");
}

export function validatePr(p, pr, expected) {
  insist(integer(pr.number) && !p.excludedPrs.includes(pr.number), "PR_EXCLUDED");
  insist(pr.state === "open" && !pr.merged && (p.allowDrafts || !pr.draft), "PR_NOT_ELIGIBLE");
  insist(
    pr.base?.repo?.id === p.repositoryId && pr.base.repo.full_name === p.repository && pr.base.ref === p.defaultBranch,
    "WRONG_BASE",
  );
  insist(approved(p, pr.user), "UNTRUSTED_PR_AUTHOR");
  insist(
    pr.head?.repo?.fork === true && integer(pr.head.repo.id) && approved(p, pr.head.repo.owner),
    "UNTRUSTED_FORK_OWNER",
  );
  insist(sha(pr.head.sha), "INVALID_HEAD");
  if (expected)
    insist(
      pr.number === expected.pr && pr.head.sha === expected.sha && pr.head.repo.id === expected.forkId,
      "STALE_HEAD",
    );
  return { pr: pr.number, sha: pr.head.sha, forkId: pr.head.repo.id };
}

export function parseJob(p, url, pr) {
  let u, j;
  try {
    u = new URL(url);
    insist(
      u.origin === "https://vercel.com" && u.pathname === "/git/authorize" && !u.hash && !u.username && !u.password,
      "BAD_GATE_URL",
    );
    for (const key of ["job", "teamId", "type"])
      insist(u.searchParams.getAll(key).length === 1, "DUPLICATE_GATE_PARAMETER");
    insist(u.searchParams.get("teamId") === p.teamId && u.searchParams.get("type") === "github", "WRONG_GATE_TEAM");
    j = JSON.parse(u.searchParams.get("job"));
    insist(
      Object.keys(j).sort().join(",") === "headInfo,id,org,prId,repo" && Object.keys(j.headInfo).join(",") === "sha",
      "UNEXPECTED_JOB_SHAPE",
    );
    insist(
      j.org + "/" + j.repo === p.repository && j.prId === pr.number && j.headInfo.sha === pr.head.sha,
      "WRONG_JOB_IDENTITY",
    );
    insist(typeof j.id === "string" && /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(j.id), "BAD_JOB_ID");
  } catch (e) {
    if (e instanceof Refused) throw e;
    throw new Refused("INVALID_JOB");
  }
  return { headInfo: { sha: j.headInfo.sha }, id: j.id, org: j.org, prId: j.prId, repo: j.repo };
}

export async function all(io, p, path, field) {
  const output = [];
  for (let page = 1; page <= 10; page++) {
    const r = await get(io, p, `${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
    const list = field ? r[field] : r;
    insist(Array.isArray(list), "INVALID_LIST");
    output.push(...list);
    if (list.length < 100) return output;
  }
  throw new Refused("PAGINATION_LIMIT");
}
export const checks = (io, p, head, name) =>
  all(io, p, `/commits/${head}/check-runs?filter=all&check_name=${encodeURIComponent(name)}`, "check_runs");

function receipt(p, pr, runtime, actor) {
  return {
    version: 1,
    ...validatePr(p, pr),
    policy: digest(p),
    actorId: actor.id,
    runId: runtime.runId,
    workflowSha: runtime.workflowSha,
  };
}

async function endorse(io, p, runtime, event) {
  insist(["opened", "synchronize", "reopened", "ready_for_review"].includes(event.action), "BAD_PR_EVENT");
  insist(approved(p, event.sender) && event.sender.id === runtime.actorId, "UNTRUSTED_EVENT_SENDER");
  const original = validatePr(p, event.pull_request);
  const pr = await get(io, p, `/pulls/${original.pr}`);
  validatePr(p, pr, original);
  await currentPolicy(io, p);
  const data = receipt(p, pr, runtime, event.sender);
  const encoded = "tpe-v1:" + digest(data);
  const existing = await checks(io, p, pr.head.sha, ENDORSE);
  if (
    !existing.some((c) => c.app?.id === p.githubActionsAppId && c.external_id === encoded && c.conclusion === "success")
  ) {
    await io.gh("POST", prefix(p) + "/check-runs", {
      name: ENDORSE,
      head_sha: pr.head.sha,
      status: "completed",
      conclusion: "success",
      external_id: encoded,
      details_url: `https://github.com/${p.repository}/actions/runs/${runtime.runId}`,
      output: {
        title: "Allowlisted actor endorsed this exact SHA",
        summary: `PR #${pr.number}; account ID ${event.sender.id}; policy ${digest(p)}. No fork code was executed.`,
        text: JSON.stringify(data),
      },
    });
  }
  return original;
}

export async function prepare(io, p, runtime, event) {
  validateRuntime(p, runtime, event);
  await currentPolicy(io, p);
  if (runtime.eventName === "pull_request_target") return [await endorse(io, p, runtime, event)];
  if (runtime.eventName === "issue_comment") {
    insist(
      ["created", "edited"].includes(event.action) && event.issue?.pull_request && integer(event.issue.number),
      "NOT_PR_COMMENT",
    );
    insist(bot(p, event.comment?.user) && integer(event.comment.id), "SPOOFED_COMMENT_EVENT");
    const c = await get(io, p, `/issues/comments/${event.comment.id}`);
    insist(
      bot(p, c.user) &&
        c.id === event.comment.id &&
        c.issue_url === `https://api.github.com/repos/${p.repository}/issues/${event.issue.number}`,
      "SPOOFED_COMMENT_API",
    );
    const pr = await get(io, p, `/pulls/${event.issue.number}`);
    return [validatePr(p, pr)];
  }
  if (runtime.eventName === "status") {
    // Wake-up hint only: all authorization evidence is independently re-read below.
    insist(
      event.context === "Vercel" && ["failure", "pending", "success"].includes(event.state) && sha(event.sha),
      "IRRELEVANT_STATUS",
    );
    const prs = await all(io, p, `/commits/${event.sha}/pulls`);
    return prs
      .filter((pr) => pr.head?.sha === event.sha)
      .flatMap((pr) => {
        try {
          return [validatePr(p, pr)];
        } catch (e) {
          if (e instanceof Refused) return [];
          throw e;
        }
      });
  }
  throw new Refused("EVENT_NOT_SUPPORTED");
}

export async function hasEndorsement(io, p, pr) {
  const candidates = await checks(io, p, pr.head.sha, ENDORSE);
  for (const c of candidates) {
    if (
      c.app?.id !== p.githubActionsAppId ||
      c.name !== ENDORSE ||
      c.head_sha !== pr.head.sha ||
      c.conclusion !== "success"
    )
      continue;
    let r;
    try {
      r = JSON.parse(c.output?.text);
    } catch {
      continue;
    }
    if (c.external_id !== "tpe-v1:" + digest(r)) continue;
    if (
      r.version !== 1 ||
      r.pr !== pr.number ||
      r.sha !== pr.head.sha ||
      r.forkId !== pr.head.repo.id ||
      r.policy !== digest(p) ||
      !p.approvedUserIds.includes(r.actorId) ||
      !integer(r.runId) ||
      !sha(r.workflowSha)
    )
      continue;
    // GitHub rewrites custom check URLs to /runs/<check-id>. Bind the check
    // to its actual Actions check suite instead of trusting a caller-supplied URL.
    if (!integer(c.check_suite?.id)) continue;
    const run = await get(io, p, `/actions/runs/${r.runId}`);
    if (
      run.id === r.runId &&
      run.check_suite_id === c.check_suite.id &&
      run.event === "pull_request_target" &&
      run.path === p.workflowPath &&
      run.run_attempt === 1 &&
      run.actor?.id === r.actorId &&
      run.repository?.id === p.repositoryId &&
      run.head_repository?.id === pr.head.repo.id &&
      run.head_sha === pr.head.sha
    )
      return true;
  }
  return false;
}

async function gate(io, p, pr) {
  const state = await get(io, p, `/commits/${pr.head.sha}/status`);
  insist(state.sha === pr.head.sha, "STATUS_SHA_MISMATCH");
  const list = state.statuses?.filter((s) => s.context === "Vercel") ?? [];
  if (list.length !== 1 || list[0].state !== "failure" || list[0].description !== "Authorization required to deploy.")
    return null;
  // The combined status omits creator. Vercel may leave its PR authorization
  // comment on an older commit, so authenticate the latest full status instead.
  const full = (await all(io, p, `/commits/${pr.head.sha}/statuses`)).find((s) => s.context === "Vercel");
  if (
    !full ||
    !integer(full.id) ||
    full.id !== list[0].id ||
    !bot(p, full.creator) ||
    full.state !== list[0].state ||
    full.description !== list[0].description ||
    full.target_url !== list[0].target_url
  )
    return null;
  return parseJob(p, full.target_url, pr);
}

async function preflight(io, p, job) {
  const body = await io.vercel(
    "GET",
    "job-info?" + new URLSearchParams({ teamId: p.teamId, job: JSON.stringify(job) }),
  );
  insist(body?.accountId === p.teamId && body?.projectId === p.projectId, "VERCEL_SCOPE_MISMATCH");
}
const claimId = (p, job) => "trusted-preview-attempt-v1:" + digest({ repo: p.repositoryId, project: p.projectId, job });
const matchingClaims = (p, list, id) =>
  list.filter((c) => c.app?.id === p.githubActionsAppId && c.name === CLAIM && c.external_id === id);

export async function approve(io, p, runtime, event, expected) {
  validateRuntime(p, runtime, event);
  insist(integer(expected?.pr) && sha(expected?.sha) && integer(expected?.forkId), "BAD_CANDIDATE");
  await currentPolicy(io, p);
  let pr = await get(io, p, `/pulls/${expected.pr}`);
  validatePr(p, pr, expected);
  if (!(await hasEndorsement(io, p, pr))) return { result: "no_trusted_sha_endorsement" };
  let job = null;
  // Read-only polling handles the authenticated status arriving after the PR event.
  for (let attempt = 0; attempt < 4; attempt++) {
    job = await gate(io, p, pr);
    if (job) break;
    if (attempt < 3) await io.sleep(5000);
  }
  if (!job) return { result: "no_corroborated_pending_gate" };
  const id = claimId(p, job);
  const claimData = JSON.stringify({
    pr: expected.pr,
    sha: expected.sha,
    forkId: expected.forkId,
    job,
    repo: p.repositoryId,
    project: p.projectId,
  });
  if (matchingClaims(p, await checks(io, p, expected.sha, CLAIM), id).length)
    return { result: "already_claimed_no_retry" };
  await preflight(io, p, job);
  await currentPolicy(io, p);
  pr = await get(io, p, `/pulls/${expected.pr}`);
  validatePr(p, pr, expected);
  insist(await hasEndorsement(io, p, pr), "ENDORSEMENT_REVOKED");
  insist(same(await gate(io, p, pr), job), "GATE_CHANGED");
  // Job-level per-PR GitHub concurrency is REQUIRED. This check is a durable fail-closed
  // marker, not a general-purpose atomic lock for independently installed workflows.
  const claim = await io.gh("POST", prefix(p) + "/check-runs", {
    name: CLAIM,
    head_sha: expected.sha,
    status: "in_progress",
    external_id: id,
    details_url: `https://github.com/${p.repository}/actions/runs/${runtime.runId}`,
    output: {
      title: "Approval attempt claimed; never retry automatically",
      text: claimData,
      summary: `PR #${expected.pr}; SHA ${expected.sha}; job ${job.id}. An interrupted run needs manual investigation.`,
    },
  });
  insist(integer(claim.id), "CLAIM_NOT_SAVED");
  const saved = matchingClaims(p, await checks(io, p, expected.sha, CLAIM), id);
  insist(saved.length === 1 && saved[0].id === claim.id, "CLAIM_NOT_UNIQUE");
  // Final current-head and scope reads after the durable claim. If any read fails,
  // the claim remains: this deliberately favors a missed preview over replay.
  await currentPolicy(io, p);
  validatePr(p, await get(io, p, `/pulls/${expected.pr}`), expected);
  insist(same(await gate(io, p, pr), job), "GATE_CHANGED_AFTER_CLAIM");
  await preflight(io, p, job);
  try {
    await io.vercel("POST", "authorize-job?" + new URLSearchParams({ teamId: p.teamId }), { job });
  } catch {
    // Network errors, 4xx, 5xx and cancellation all retain the marker. No POST retry.
    return { result: "approval_outcome_uncertain_or_rejected", pr: expected.pr, sha: expected.sha };
  }
  await io.gh("PATCH", prefix(p) + `/check-runs/${claim.id}`, {
    status: "completed",
    conclusion: "success",
    output: {
      title: "Approval API accepted; deployment not verified",
      text: claimData,
      summary: `Exact SHA ${expected.sha}. Check Vercel for build result. HTTP success is not deployment success.`,
    },
  });
  return { result: "approval_http_success_deployment_unverified", pr: expected.pr, sha: expected.sha };
}

export function makeIO(env, fetchImpl = fetch) {
  async function request(host, method, path, body, token) {
    insist(typeof token === "string" && token.length > 0, "TOKEN_MISSING");
    insist(!path.includes("..") && !path.startsWith("//"), "INVALID_API_PATH");
    const url = new URL(path, host);
    insist(url.origin === new URL(host).origin, "WRONG_API_HOST");
    let r;
    try {
      r = await fetchImpl(url, {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(20000),
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "trusted-preview-controller",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new Refused("API_TRANSPORT_FAILURE");
    }
    insist(r.ok, `API_HTTP_${r.status}`);
    const bytes = await r.arrayBuffer();
    insist(bytes.byteLength <= 2_000_000, "RESPONSE_TOO_LARGE");
    try {
      return JSON.parse(Buffer.from(bytes).toString("utf8"));
    } catch {
      throw new Refused("API_JSON_INVALID");
    }
  }
  return {
    gh: (method, path, body) => request("https://api.github.com", method, path, body, env.GH_TOKEN),
    vercel: (method, path, body) => {
      insist(/^(job-info|authorize-job)\?teamId=/.test(path), "VERCEL_ROUTE_REFUSED");
      return request("https://api.vercel.com", method, "/v1/integrations/" + path, body, env.VERCEL_APPROVAL_TOKEN);
    },
    vapi: (method, path, body) => {
      insist(
        (method === "GET" && /^\/v13\/deployments\/dpl_[A-Za-z0-9]+\?teamId=/.test(path)) ||
          (method === "PATCH" && /^\/aliases\/dpl_[A-Za-z0-9]+\/protection-bypass\?teamId=/.test(path)),
        "VERCEL_ROUTE_REFUSED",
      );
      return request("https://api.vercel.com", method, path, body, env.VERCEL_APPROVAL_TOKEN);
    },
    now: () => Date.now(),
    mask: (secret) => console.log("::add-mask::" + secret),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}

async function main() {
  const p = JSON.parse(readFileSync(new URL("./policy.json", import.meta.url), "utf8"));
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const runtime = {
    actions: process.env.GITHUB_ACTIONS,
    attempt: process.env.GITHUB_RUN_ATTEMPT,
    repository: process.env.GITHUB_REPOSITORY,
    workflowRef: process.env.TRUSTED_WORKFLOW_REF,
    workflowSha: process.env.TRUSTED_WORKFLOW_SHA,
    runId: Number(process.env.GITHUB_RUN_ID),
    actorId: Number(process.env.GITHUB_ACTOR_ID),
    eventName: process.env.GITHUB_EVENT_NAME,
  };
  const io = makeIO(process.env);
  if (process.argv[2] === "prepare") {
    const candidates = await prepare(io, p, runtime, event);
    appendFileSync(process.env.GITHUB_OUTPUT, "candidates=" + JSON.stringify(candidates) + "\n");
    console.log(`Validated ${candidates.length} candidate(s); no Vercel credential used.`);
  } else if (process.argv[2] === "approve") {
    const result = await approve(io, p, runtime, event, JSON.parse(process.env.CANDIDATE));
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, JSON.stringify(result) + "\n");
    console.log(JSON.stringify(result));
    if (
      [
        "approval_http_success_deployment_unverified",
        "already_claimed_no_retry",
        "no_corroborated_pending_gate",
      ].includes(result.result)
    ) {
      const { publishPreview } = await import("./publish.mjs");
      const publication = await publishPreview(io, p, runtime, event, JSON.parse(process.env.CANDIDATE));
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, JSON.stringify(publication) + "\n");
      console.log(JSON.stringify(publication));
      if (
        [
          "deployment_wait_timeout_no_link",
          "deployment_failed_no_link",
          "share_outcome_uncertain_no_retry",
          "comment_outcome_uncertain_no_retry",
          "stale_link_revoke_uncertain_manual_attention",
        ].includes(publication.result)
      )
        process.exitCode = 1;
    }
    if (result.result === "approval_outcome_uncertain_or_rejected") process.exitCode = 1;
  } else throw new Refused("UNKNOWN_MODE");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e instanceof Refused ? e.message : "CONTROLLER_FAILED_NO_PAYLOAD_LOGGED");
    process.exitCode = 1;
  });
}
