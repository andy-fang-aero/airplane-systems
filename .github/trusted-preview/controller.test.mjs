import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prepare, approve, validateRuntime, parseJob, makeIO, ENDORSE, CLAIM } from "./controller.mjs";
const template = JSON.parse(readFileSync(new URL("./policy.json", import.meta.url)));
const clone = (x) => structuredClone(x);
export function harness() {
  const p = { ...clone(template), enabled: true, approvedUserIds: [11378800] };
  const user = { id: 11378800, type: "User", login: "ligolnik" };
  const pr = {
    number: 40,
    state: "open",
    merged: false,
    draft: false,
    user,
    base: { ref: "main", repo: { id: p.repositoryId, full_name: p.repository } },
    head: { sha: "a".repeat(40), repo: { id: 1409202847, fork: true, owner: user } },
  };
  const runtime = {
    actions: "true",
    attempt: "1",
    repository: p.repository,
    workflowRef: `${p.repository}/${p.workflowPath}@refs/heads/main`,
    workflowSha: "b".repeat(40),
    runId: 9001,
    actorId: user.id,
    eventName: "pull_request_target",
  };
  const event = {
    repository: { id: p.repositoryId, full_name: p.repository, default_branch: "main" },
    action: "synchronize",
    sender: user,
    pull_request: clone(pr),
  };
  const job = {
    headInfo: { sha: pr.head.sha },
    id: "Qm" + "A".repeat(44),
    org: "andyfangdz",
    prId: 40,
    repo: "airplane-systems",
  };
  const url =
    "https://vercel.com/git/authorize?" +
    new URLSearchParams({ teamId: p.teamId, type: "github", job: JSON.stringify(job) });
  const comment = {
    id: 100,
    user: { id: p.vercelBotId, type: "Bot", login: "vercel[bot]" },
    issue_url: `https://api.github.com/repos/${p.repository}/issues/40`,
    body: `Please [authorize it](${url}).`,
  };
  const state = {
    pr,
    checks: [],
    comments: [comment],
    status: {
      sha: pr.head.sha,
      statuses: [
        {
          id: 501,
          creator: { id: p.vercelBotId, type: "Bot", login: "vercel[bot]" },
          context: "Vercel",
          state: "failure",
          description: "Authorization required to deploy.",
          target_url: url,
        },
      ],
    },
    remotePolicy: clone(p),
    vercelInfo: { accountId: p.teamId, projectId: p.projectId },
    posts: [],
    writes: [],
    sleeps: 0,
    prReads: 0,
    failPost: false,
  };
  const io = {
    gh: async (method, path, body) => {
      if (method === "POST" && path.endsWith("/check-runs")) {
        const c = {
          id: state.checks.length + 1000,
          app: { id: p.githubActionsAppId },
          ...clone(body),
          check_suite: { id: 8001 },
        };
        c.details_url = `https://github.com/${p.repository}/runs/${c.id}`;
        state.checks.push(c);
        state.writes.push(clone(c));
        if (state.injectDuplicateClaim && body.name === CLAIM) state.checks.push({ ...clone(c), id: c.id + 100 });
        return clone(c);
      }
      if (method === "PATCH") {
        Object.assign(
          state.checks.find((c) => path.endsWith("/" + c.id)),
          body,
        );
        return {};
      }
      assert.equal(method, "GET");
      if (path.includes("/contents/"))
        return { encoding: "base64", content: Buffer.from(JSON.stringify(state.remotePolicy)).toString("base64") };
      if (path.endsWith("/pulls/40")) {
        state.prReads++;
        state.onPrRead?.();
        return clone(state.pr);
      }
      if (path.includes("/check-runs?"))
        return {
          check_runs: clone(
            state.checks.filter(
              (c) => c.name === new URL("https://api.github.com" + path).searchParams.get("check_name"),
            ),
          ),
        };
      if (path.endsWith("/status")) {
        const combined = clone(state.status);
        for (const s of combined.statuses) delete s.creator;
        return combined;
      }
      if (path.includes("/statuses?")) return clone(state.fullStatuses ?? state.status.statuses);
      if (path.includes("/issues/40/comments?")) return clone(state.comments);
      if (path.includes("/issues/comments/100")) return clone(state.comments[0]);
      if (path.includes("/actions/runs/"))
        return {
          id: runtime.runId,
          check_suite_id: 8001,
          head_repository: { id: pr.head.repo.id },
          event: "pull_request_target",
          path: p.workflowPath,
          run_attempt: 1,
          actor: { id: user.id },
          repository: { id: p.repositoryId },
          head_sha: pr.head.sha,
          ...state.runOverride,
        };
      if (path.includes("/commits/") && path.includes("/pulls?")) return [clone(state.pr)];
      throw new Error("Unexpected fake path " + path);
    },
    vercel: async (method, path, body) => {
      if (method === "GET") return clone(state.vercelInfo);
      assert.equal(method, "POST");
      state.posts.push({ path, body: clone(body) });
      if (state.failPost) throw new Error("Simulated timeout");
      return {};
    },
    sleep: async () => {
      state.sleeps++;
      state.onSleep?.();
    },
  };
  return { p, pr, runtime, event, job, url, comment, state, io };
}
const candidate = (h) => ({ pr: 40, sha: h.event.pull_request.head.sha, forkId: 1409202847 });
const endorse = (h) => prepare(h.io, h.p, h.runtime, h.event);
const run = (h) => approve(h.io, h.p, h.runtime, h.event, candidate(h));
const fail = async (h, fn = () => run(h)) => {
  await assert.rejects(fn);
  assert.equal(h.state.posts.length, 0);
};

test("positive: genuine actor endorsement -> exact single POST, final response is not deployment success", async () => {
  const h = harness();
  assert.deepEqual(await endorse(h), [candidate(h)]);
  assert.equal((await run(h)).result, "approval_http_success_deployment_unverified");
  assert.deepEqual(h.state.posts, [{ path: "authorize-job?teamId=" + h.p.teamId, body: { job: h.job } }]);
  assert.equal(h.state.checks.find((c) => c.name === CLAIM).conclusion, "success");
});
test("approved policy is enabled; the emergency disable switch fails closed", () => {
  assert.equal(template.enabled, true);
  assert.deepEqual(template.approvedUserIds, [11378800, 340809365]);
  assert.deepEqual(template.proposedUserIdsPendingApproval, []);
  const h = harness();
  assert.throws(() => validateRuntime({ ...template, enabled: false }, h.runtime, h.event), /POLICY_DISABLED/);
});
for (const [name, change] of [
  [
    "untrusted sender",
    (h) => {
      h.event.sender = { id: 777, type: "User" };
    },
  ],
  [
    "untrusted opener despite CONTRIBUTOR association",
    (h) => {
      h.event.pull_request.user = { id: 777, type: "User" };
      h.event.pull_request.author_association = "CONTRIBUTOR";
    },
  ],
  [
    "untrusted fork owner",
    (h) => {
      h.event.pull_request.head.repo.owner = { id: 777, type: "User" };
    },
  ],
  [
    "rerun",
    (h) => {
      h.runtime.attempt = "2";
    },
  ],
  [
    "fork workflow ref",
    (h) => {
      h.runtime.workflowRef = "evil/repo/.github/workflows/trusted-preview-approval.yml@refs/heads/main";
    },
  ],
  [
    "wrong event repo",
    (h) => {
      h.event.repository.id = 123;
    },
  ],
  [
    "draft explicitly disabled by policy",
    (h) => {
      h.p.allowDrafts = false;
      h.state.remotePolicy = clone(h.p);
      h.event.pull_request.draft = true;
    },
  ],
  [
    "closed PR",
    (h) => {
      h.state.pr.state = "closed";
    },
  ],
  [
    "stale event SHA",
    (h) => {
      h.state.pr.head.sha = "c".repeat(40);
    },
  ],
  [
    "changed fork",
    (h) => {
      h.state.pr.head.repo.id = 444;
    },
  ],
  [
    "wrong base",
    (h) => {
      h.state.pr.base.ref = "other";
    },
  ],
  [
    "successful PR38 excluded",
    (h) => {
      h.event.pull_request.number = 38;
    },
  ],
])
  test("reject " + name, async () => {
    const h = harness();
    change(h);
    await fail(h, () => endorse(h));
  });
test("approved policy allows drafts and remains policy-bound", async () => {
  const h = harness();
  assert.equal(template.allowDrafts, true);
  h.state.remotePolicy = clone(h.p);
  h.event.pull_request.draft = h.state.pr.draft = true;
  await endorse(h);
  assert.equal((await run(h)).result, "approval_http_success_deployment_unverified");
});
test("bot wakeup before endorsement cannot approve; later PR event catches already-present gate", async () => {
  const h = harness();
  h.runtime.eventName = "issue_comment";
  const e = { ...h.event, action: "created", issue: { number: 40, pull_request: {} }, comment: h.comment };
  assert.deepEqual(await prepare(h.io, h.p, h.runtime, e), [candidate(h)]);
  assert.equal((await run(h)).result, "no_trusted_sha_endorsement");
  h.runtime.eventName = "pull_request_target";
  await endorse(h);
  assert.equal((await run(h)).result, "approval_http_success_deployment_unverified");
});
test("PR event before bot gate waits read-only; delayed bot comment triggers approval", async () => {
  const h = harness();
  const pending = clone(h.state.status.statuses);
  h.state.status.statuses = [];
  await endorse(h);
  assert.equal((await run(h)).result, "no_corroborated_pending_gate");
  h.state.status.statuses = pending;
  h.runtime.eventName = "issue_comment";
  const e = { ...h.event, action: "edited", issue: { number: 40, pull_request: {} }, comment: h.comment };
  await prepare(h.io, h.p, h.runtime, e);
  assert.equal((await run(h)).result, "approval_http_success_deployment_unverified");
});
test("comment/status race resolves via read-only polling", async () => {
  const h = harness();
  await endorse(h);
  h.state.status.statuses = [];
  h.state.onSleep = () => {
    h.state.status.statuses = [
      {
        id: 501,
        creator: { id: h.p.vercelBotId, type: "Bot", login: "vercel[bot]" },
        context: "Vercel",
        state: "failure",
        description: "Authorization required to deploy.",
        target_url: h.url,
      },
    ];
  };
  assert.equal((await run(h)).result, "approval_http_success_deployment_unverified");
  assert.equal(h.state.sleeps, 1);
});
test("late status wakeup resolves current PR", async () => {
  const h = harness();
  await endorse(h);
  h.runtime.eventName = "status";
  const e = {
    ...h.event,
    sha: h.pr.head.sha,
    context: "Vercel",
    state: "failure",
    description: "Authorization required to deploy.",
  };
  assert.deepEqual(await prepare(h.io, h.p, h.runtime, e), [candidate(h)]);
  assert.equal((await run(h)).result, "approval_http_success_deployment_unverified");
});
for (const location of ["event", "api"])
  test("reject spoofed comment " + location, async () => {
    const h = harness();
    h.runtime.eventName = "issue_comment";
    const e = { ...h.event, action: "created", issue: { number: 40, pull_request: {} }, comment: clone(h.comment) };
    if (location === "event") e.comment.user.id = 123;
    else h.state.comments[0].user.id = 123;
    await fail(h, () => prepare(h.io, h.p, h.runtime, e));
  });
test("untrusted status author cannot be corroborated by a genuine bot comment", async () => {
  const h = harness();
  await endorse(h);
  h.state.status.statuses[0].creator.id = 123;
  assert.equal((await run(h)).result, "no_corroborated_pending_gate");
  assert.equal(h.state.posts.length, 0);
});
test("wrong job SHA/team/repo/PR and redirect hosts rejected", () => {
  const h = harness();
  for (const change of [
    (j) => {
      j.headInfo.sha = "d".repeat(40);
    },
    (j) => {
      j.org = "evil";
    },
    (j) => {
      j.prId = 41;
    },
  ]) {
    const j = clone(h.job);
    change(j);
    assert.throws(() =>
      parseJob(
        h.p,
        "https://vercel.com/git/authorize?" +
          new URLSearchParams({ teamId: h.p.teamId, type: "github", job: JSON.stringify(j) }),
        h.pr,
      ),
    );
  }
  assert.throws(() => parseJob(h.p, h.url.replace("vercel.com", "evil.example"), h.pr));
  assert.throws(() => parseJob(h.p, h.url.replace(h.p.teamId, "team_wrong"), h.pr));
});
test("wrong Vercel project blocks before claim/POST", async () => {
  const h = harness();
  await endorse(h);
  h.state.vercelInfo.projectId = "prj_other";
  await fail(h);
  assert.equal(h.state.checks.filter((c) => c.name === CLAIM).length, 0);
});
test("revoked policy or forged endorsement provenance rejected", async () => {
  const h = harness();
  await endorse(h);
  h.state.remotePolicy.approvedUserIds = [];
  await fail(h);
  h.state.remotePolicy = clone(h.p);
  h.state.runOverride = { path: ".github/workflows/evil.yml" };
  assert.equal((await run(h)).result, "no_trusted_sha_endorsement");
  assert.equal(h.state.posts.length, 0);
});
test("head changes immediately before POST -> no POST, claim retained", async () => {
  const h = harness();
  await endorse(h);
  h.state.onPrRead = () => {
    if (h.state.checks.some((c) => c.name === CLAIM)) h.state.pr.head.sha = "e".repeat(40);
  };
  await fail(h);
  assert.equal(h.state.checks.filter((c) => c.name === CLAIM).length, 1);
});
test("serialized duplicate events and duplicate endorsements produce one POST", async () => {
  const h = harness();
  await endorse(h);
  await endorse(h);
  assert.equal(h.state.checks.filter((c) => c.name === ENDORSE).length, 1);
  await run(h);
  assert.equal((await run(h)).result, "already_claimed_no_retry");
  assert.equal(h.state.posts.length, 1);
});
test("uncertain timeout retains claim and suppresses duplicate POST", async () => {
  const h = harness();
  await endorse(h);
  h.state.failPost = true;
  assert.equal((await run(h)).result, "approval_outcome_uncertain_or_rejected");
  assert.equal((await run(h)).result, "already_claimed_no_retry");
  assert.equal(h.state.posts.length, 1);
});
test("ambiguous competing claim aborts before POST", async () => {
  const h = harness();
  await endorse(h);
  h.state.injectDuplicateClaim = true;
  await fail(h);
});
test("HTTP adapter fixed destination, no redirects, correct token separation, no auto retry", async () => {
  const calls = [];
  const io = makeIO({ GH_TOKEN: "FAKE_GH", VERCEL_APPROVAL_TOKEN: "FAKE_VERCEL" }, async (url, opts) => {
    calls.push({ url: String(url), ...opts });
    return { ok: true, status: 200, arrayBuffer: async () => Buffer.from("{}") };
  });
  await io.gh("GET", "/repos/andyfangdz/airplane-systems/pulls/40");
  await io.vercel("GET", "job-info?teamId=team_test");
  assert.equal(calls[0].headers.Authorization, "Bearer FAKE_GH");
  assert.equal(calls[1].headers.Authorization, "Bearer FAKE_VERCEL");
  assert.ok(calls.every((c) => c.redirect === "error"));
  await assert.rejects(() => io.gh("GET", "https://evil.example/path"));
  assert.throws(() => io.vercel("POST", "https://evil.example"));
  const denied = makeIO({ VERCEL_APPROVAL_TOKEN: "FAKE" }, async () => {
    throw new Error("secret transport payload");
  });
  await assert.rejects(() => denied.vercel("POST", "authorize-job?teamId=x"), /^Error: API_TRANSPORT_FAILURE$/);
});

// End-to-end publication mocks. No real links, credentials or HTTP calls.
import { publishPreview, extractShare, COMMENT_MARKER, PUBLISH } from "./publish.mjs";
async function publicationHarness() {
  const h = harness();
  await endorse(h);
  await run(h);
  h.expected = candidate(h);
  h.now = 1791687000000;
  h.deployment = {
    id: "dpl_MockDeployment123",
    team: { id: h.p.teamId },
    ownerId: h.p.teamId,
    project: { id: h.p.projectId },
    projectId: h.p.projectId,
    target: null,
    readyState: "READY",
    url: "airplane-systems-mock-andyfangs-projects.vercel.app",
    meta: { githubCommitSha: h.expected.sha, githubOrg: "andyfangdz", githubRepo: "airplane-systems" },
  };
  h.state.status.statuses = [
    {
      context: "Vercel",
      state: "success",
      description: "Deployment has completed",
      target_url: `https://vercel.com/${h.p.teamSlug}/${h.p.projectName}/MockDeployment123`,
    },
  ];
  h.shareWrites = [];
  h.commentWrites = [];
  h.masked = [];
  h.state.publishedComments = [];
  const gh = h.io.gh;
  h.io.gh = async (method, path, body) => {
    if (
      (method === "POST" && path.endsWith("/issues/40/comments")) ||
      (method === "PATCH" && path.includes("/issues/comments/"))
    ) {
      h.commentWrites.push({ method, path, body });
      if (h.commentFailure) throw Error("Simulated ambiguous comment response");
      const id = method === "PATCH" ? Number(path.split("/").at(-1)) : 7000;
      h.state.publishedComments.push({ id, ...body });
      return { id };
    }
    return gh(method, path, body);
  };
  h.io.vapi = async (method, path, body) => {
    if (method === "GET") return clone(h.deployment);
    h.shareWrites.push({ method, path, body });
    if (h.shareFailure) throw Error("Simulated share timeout");
    if (body.revoke) return {};
    h.onShare?.();
    return (
      h.shareResponse ?? {
        protectionBypass: {
          FAKE_SHARE_VALUE_123: {
            scope: "shareable-link",
            createdAt: h.now,
            expires: Math.floor(h.now / 1000) + h.p.shareTtlSeconds,
          },
        },
      }
    );
  };
  h.io.now = () => h.now;
  h.io.mask = (s) => h.masked.push(s);
  h.publish = () => publishPreview(h.io, h.p, h.runtime, h.event, h.expected, { polls: 2, intervalMs: 1 });
  return h;
}
test("share positive: exact READY Preview, deployment-scoped TTL and one bot comment", async () => {
  const h = await publicationHarness();
  const result = await h.publish();
  assert.equal(result.result, "preview_link_published");
  assert.equal(result.commentId, 7000);
  assert.equal(result.expires, new Date(Math.floor(h.now / 1000) * 1000 + 86400000).toISOString());
  assert.deepEqual(h.shareWrites, [
    {
      method: "PATCH",
      path: `/aliases/${h.deployment.id}/protection-bypass?teamId=${h.p.teamId}`,
      body: { ttl: 86400 },
    },
  ]);
  assert.equal(h.commentWrites.length, 1);
  assert.ok(h.commentWrites[0].body.body.includes(h.expected.sha));
  assert.ok(h.commentWrites[0].body.body.includes("?_vercel_share=FAKE_SHARE_VALUE_123"));
  assert.ok(h.commentWrites[0].body.body.includes("Anyone with this link"));
  assert.equal(h.masked[0], "FAKE_SHARE_VALUE_123");
  assert.ok(!JSON.stringify(result).includes("FAKE_SHARE_VALUE_123"));
  assert.equal((await h.publish()).result, "publication_already_claimed_no_retry");
  assert.equal(h.shareWrites.length, 1);
  assert.equal(h.commentWrites.length, 1);
});
test("share updates the one owned bot comment instead of adding another", async () => {
  const h = await publicationHarness();
  h.state.comments.push({
    id: 55,
    user: { id: h.p.githubActionsBotId, type: "Bot", login: "github-actions[bot]" },
    body: COMMENT_MARKER + "\nOld preview",
  });
  assert.equal((await h.publish()).commentId, 55);
  assert.equal(h.commentWrites[0].method, "PATCH");
  assert.ok(h.commentWrites[0].path.endsWith("/issues/comments/55"));
});
test("spoofed marker comment by another account is never edited", async () => {
  const h = await publicationHarness();
  h.state.comments.push({
    id: 55,
    user: { id: 777, type: "User", login: "imposter" },
    body: COMMENT_MARKER + "\nFake preview",
  });
  await h.publish();
  assert.equal(h.commentWrites[0].method, "POST");
});
for (const [label, mutation] of [
  [
    "production",
    (h) => {
      h.deployment.target = "production";
    },
  ],
  [
    "wrong project",
    (h) => {
      h.deployment.project.id = "prj_wrong";
    },
  ],
  [
    "wrong team",
    (h) => {
      h.deployment.team.id = "team_wrong";
    },
  ],
  [
    "wrong SHA",
    (h) => {
      h.deployment.meta.githubCommitSha = "f".repeat(40);
    },
  ],
  [
    "wrong repository",
    (h) => {
      h.deployment.meta.githubOrg = "evil";
    },
  ],
  [
    "nonimmutable hostname",
    (h) => {
      h.deployment.url = "systems.flyingclub.org";
    },
  ],
  [
    "changed head",
    (h) => {
      h.state.pr.head.sha = "d".repeat(40);
    },
  ],
  [
    "closed PR",
    (h) => {
      h.state.pr.state = "closed";
    },
  ],
])
  test("share rejects " + label, async () => {
    const h = await publicationHarness();
    mutation(h);
    await assert.rejects(h.publish);
    assert.equal(h.shareWrites.length, 0);
    assert.equal(h.commentWrites.length, 0);
  });
test("failed build and bounded timeout never create a link", async () => {
  const h = await publicationHarness();
  h.deployment.readyState = "ERROR";
  assert.equal((await h.publish()).result, "deployment_failed_no_link");
  h.deployment.readyState = "BUILDING";
  assert.equal((await h.publish()).result, "deployment_wait_timeout_no_link");
  assert.equal(h.shareWrites.length, 0);
});
test("wait transitions BUILDING to READY before sharing", async () => {
  const h = await publicationHarness();
  h.deployment.readyState = "BUILDING";
  h.io.sleep = async () => {
    h.deployment.readyState = "READY";
  };
  assert.equal((await h.publish()).result, "preview_link_published");
});
test("live Vercel expiry seconds normalize to the correct 24-hour UTC timestamp", () => {
  const h = harness();
  const createdAt = 1791691475158;
  const expires = 1791777875;
  const share = extractShare(
    h.p,
    {
      protectionBypass: { FAKE_SECRET: { scope: "shareable-link", createdAt, expires } },
    },
    createdAt - 100,
    createdAt + 100,
  );
  assert.equal(share.expires, 1791777875000);
  assert.equal(new Date(share.expires).toISOString(), "2026-10-12T04:04:35.000Z");
});
test("permanent, expired, invalid, preexisting and ambiguous share results fail closed", () => {
  const h = harness();
  const now = 1791687000000;
  const entry = { scope: "shareable-link", createdAt: now, expires: now / 1000 + 86400 };
  for (const map of [
    { FAKE_SECRET: { ...entry, expires: undefined } },
    { FAKE_SECRET: { ...entry, expires: null } },
    { FAKE_SECRET: { ...entry, expires: String(entry.expires) } },
    { FAKE_SECRET: { ...entry, expires: entry.expires + 0.5 } },
    { FAKE_SECRET: { ...entry, expires: now / 1000 } },
    { FAKE_SECRET: { ...entry, expires: now / 1000 - 1 } },
    { FAKE_SECRET: { ...entry, expires: now + 86400000 } },
    { FAKE_SECRET: { ...entry, createdAt: now - 100000 } },
    { FAKE_SECRET: { ...entry, expires: now / 1000 + 2 * 86400 } },
    { FAKE_SECRET: entry, SECOND_SECRET: entry },
  ])
    assert.throws(() => extractShare(h.p, { protectionBypass: map }, now, now));
});
test("newly stale head after share creation revokes only that new link and never comments", async () => {
  const h = await publicationHarness();
  h.onShare = () => {
    h.state.pr.head.sha = "e".repeat(40);
  };
  assert.equal((await h.publish()).result, "stale_link_revoked_not_published");
  assert.equal(h.commentWrites.length, 0);
  assert.deepEqual(h.shareWrites[1].body, { revoke: { secret: "FAKE_SHARE_VALUE_123", regenerate: false } });
});
test("ambiguous comment response suppresses replay on duplicate event", async () => {
  const h = await publicationHarness();
  h.commentFailure = true;
  assert.equal((await h.publish()).result, "comment_outcome_uncertain_no_retry");
  assert.equal((await h.publish()).result, "publication_already_claimed_no_retry");
  assert.equal(h.commentWrites.length, 1);
  assert.equal(h.shareWrites.length, 1);
});
test("share creation timeout suppresses replay on duplicate event", async () => {
  const h = await publicationHarness();
  h.shareFailure = true;
  assert.equal((await h.publish()).result, "share_outcome_uncertain_no_retry");
  assert.equal((await h.publish()).result, "publication_already_claimed_no_retry");
  assert.equal(h.shareWrites.length, 1);
  assert.equal(h.commentWrites.length, 0);
});
test("no claim or different PR claim never grants sharing permission", async () => {
  const h = await publicationHarness();
  h.state.checks = h.state.checks.filter((c) => c.name !== CLAIM);
  assert.equal((await h.publish()).result, "no_controller_approval_claim");
  assert.equal(h.shareWrites.length, 0);
});
test("public sharing must be explicitly allowed in current policy", async () => {
  const h = await publicationHarness();
  h.p.publishPublicLinks = false;
  h.state.remotePolicy = clone(h.p);
  await assert.rejects(h.publish, /PUBLIC_AUDIENCE_NOT_APPROVED/);
  assert.equal(h.shareWrites.length, 0);
});

test("approved machine-account ID can endorse and authorize its own fork PR", async () => {
  const h = harness();
  h.p.approvedUserIds = [11378800, 340809365];
  h.state.remotePolicy = clone(h.p);
  const account = { id: 340809365, type: "User", login: "andy-fang-aero" };
  h.runtime.actorId = account.id;
  h.event.sender = account;
  h.state.pr.user = account;
  h.state.pr.head.repo.owner = account;
  h.event.pull_request = clone(h.state.pr);
  h.state.runOverride = { actor: { id: account.id } };
  await endorse(h);
  assert.equal((await run(h)).result, "approval_http_success_deployment_unverified");
});

for (const [name, runOverride] of [
  ["different check suite", { check_suite_id: 9999 }],
  ["different run ID", { id: 9999 }],
  ["different head SHA", { head_sha: "c".repeat(40) }],
  ["different source fork", { head_repository: { id: 9999 } }],
  ["different event", { event: "pull_request" }],
  ["rerun", { run_attempt: 2 }],
  ["different actor", { actor: { id: 9999 } }],
])
  test("endorsement rejects " + name, async () => {
    const h = harness();
    await endorse(h);
    h.state.runOverride = runOverride;
    assert.equal((await run(h)).result, "no_trusted_sha_endorsement");
    assert.equal(h.state.posts.length, 0);
  });

test("stale authorization comment does not block a genuine current-SHA Vercel status", async () => {
  const h = harness();
  await endorse(h);
  h.state.comments[0].body = "An older commit requires authorization.";
  assert.equal((await run(h)).result, "approval_http_success_deployment_unverified");
  assert.equal(h.state.posts.length, 1);
});
for (const [name, edit] of [
  [
    "missing creator",
    (s) => {
      delete s.creator;
    },
  ],
  [
    "different status ID",
    (s) => {
      s.id++;
    },
  ],
  [
    "different URL",
    (s) => {
      s.target_url += "&changed=true";
    },
  ],
  [
    "different state",
    (s) => {
      s.state = "success";
    },
  ],
])
  test("full status refuses " + name, async () => {
    const h = harness();
    await endorse(h);
    h.state.fullStatuses = clone(h.state.status.statuses);
    edit(h.state.fullStatuses[0]);
    assert.equal((await run(h)).result, "no_corroborated_pending_gate");
    assert.equal(h.state.posts.length, 0);
  });
