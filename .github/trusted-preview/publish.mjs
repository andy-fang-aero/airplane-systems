import {
  Refused,
  validateRuntime,
  currentPolicy,
  validatePr,
  hasEndorsement,
  checks,
  all,
  CLAIM,
  digest,
} from "./controller.mjs";
export const PUBLISH = "Trusted preview: public link publication";
export const COMMENT_MARKER = "<!-- trusted-vercel-preview:v1 -->";
// Only our fixed refusal codes may enter logs; never exception payloads or URLs.
export const safeFailure = (error) =>
  error instanceof Refused && /^[A-Z][A-Z0-9_]{1,80}$/.test(error.message)
    ? error.message
    : "UNEXPECTED_PUBLICATION_ERROR";
const need = (ok, code) => {
  if (!ok) throw new Refused(code);
};
const base = (p) => `/repos/${p.repository}`;
const get = (io, p, path) => io.gh("GET", base(p) + path);
const botComment = (p, c) =>
  c.user?.type === "Bot" &&
  c.user.id === p.githubActionsBotId &&
  c.user.login === "github-actions[bot]" &&
  c.body?.startsWith(COMMENT_MARKER + "\n");
const deploymentPath = (p, id) => `/v13/deployments/${id}?teamId=${p.teamId}`;
const sharePath = (p, id) => `/aliases/${id}/protection-bypass?teamId=${p.teamId}`;

export function deploymentFromStatus(p, status, expected) {
  need(status.sha === expected.sha, "DEPLOYMENT_STATUS_SHA_MISMATCH");
  const states = status.statuses?.filter((s) => s.context === "Vercel") ?? [];
  if (states.length !== 1) return null;
  let u;
  try {
    u = new URL(states[0].target_url);
  } catch {
    return null;
  }
  const match = u.pathname.match(/^\/([^/]+)\/([^/]+)\/([A-Za-z0-9]+)$/);
  if (u.origin !== "https://vercel.com" || u.search || u.hash || !match) return null;
  need(match[1] === p.teamSlug && match[2] === p.projectName, "DEPLOYMENT_URL_SCOPE_MISMATCH");
  return "dpl_" + match[3];
}

export function validateDeployment(p, d, expected, id) {
  need(d?.id === id && /^dpl_[A-Za-z0-9]+$/.test(id), "DEPLOYMENT_ID_MISMATCH");
  need(d.team?.id === p.teamId && (!d.ownerId || d.ownerId === p.teamId), "DEPLOYMENT_TEAM_MISMATCH");
  need(d.project?.id === p.projectId && (!d.projectId || d.projectId === p.projectId), "DEPLOYMENT_PROJECT_MISMATCH");
  need(d.target === null, "NOT_PREVIEW");
  need(
    d.meta?.githubCommitSha === expected.sha && d.meta.githubOrg + "/" + d.meta.githubRepo === p.repository,
    "DEPLOYMENT_SOURCE_MISMATCH",
  );
  need(typeof d.url === "string" && /^[a-z0-9-]+\.vercel\.app$/.test(d.url), "INVALID_IMMUTABLE_HOST");
  return d;
}

async function latest(io, p, expected) {
  await currentPolicy(io, p);
  const pr = await get(io, p, `/pulls/${expected.pr}`);
  validatePr(p, pr, expected);
  need(await hasEndorsement(io, p, pr), "NO_TRUSTED_SHA_ENDORSEMENT");
  return pr;
}

export async function waitForReady(io, p, expected, { polls = 120, intervalMs = 10000 } = {}) {
  for (let i = 0; i < polls; i++) {
    await latest(io, p, expected);
    const id = deploymentFromStatus(p, await get(io, p, `/commits/${expected.sha}/status`), expected);
    if (id) {
      const d = validateDeployment(p, await io.vapi("GET", deploymentPath(p, id)), expected, id);
      if (d.readyState === "READY") return d;
      if (["ERROR", "CANCELED", "BLOCKED"].includes(d.readyState))
        return { terminalFailure: true, id, state: d.readyState };
    }
    if (i + 1 < polls) await io.sleep(intervalMs);
  }
  return null;
}

export function extractShare(p, response, createdAfter, now) {
  const entries = Object.entries(response?.protectionBypass ?? {}).filter(([, v]) => v?.scope === "shareable-link");
  need(entries.length === 1, "AMBIGUOUS_SHARE_RESPONSE");
  const [secret, entry] = entries[0];
  need(/^[A-Za-z0-9_-]{8,256}$/.test(secret), "INVALID_SHARE_SECRET");
  // Vercel returns `expires` in Unix seconds, but `createdAt` in milliseconds.
  // Normalize expiry before comparing with the clock and formatting the comment.
  // Never silently publish a permanent/reused link.
  const expires = entry.expires * 1000;
  need(
    Number.isSafeInteger(entry.expires) &&
      Number.isSafeInteger(expires) &&
      expires > now &&
      expires <= createdAfter + p.shareTtlSeconds * 1000 + 30000,
    "UNBOUNDED_OR_EXPIRED_SHARE",
  );
  need(Number.isFinite(entry.createdAt) && entry.createdAt >= createdAfter - 5000, "PREEXISTING_SHARE_REFUSED");
  return { secret, expires };
}

export async function upsertPreviewComment(io, p, expected, d, share, onStage = () => {}) {
  onStage("revalidate_pr");
  await latest(io, p, expected);
  onStage("revalidate_deployment");
  const fresh = validateDeployment(p, await io.vapi("GET", deploymentPath(p, d.id)), expected, d.id);
  need(fresh.readyState === "READY" && fresh.url === d.url, "DEPLOYMENT_CHANGED_BEFORE_COMMENT");
  onStage("read_comments");
  const comments = await all(io, p, `/issues/${expected.pr}/comments`);
  const owned = comments.filter((c) => botComment(p, c));
  need(owned.length <= 1, "AMBIGUOUS_BOT_COMMENTS");
  const url = new URL("https://" + d.url + "/");
  url.searchParams.set("_vercel_share", share.secret);
  const body = `${COMMENT_MARKER}\nPreview for commit \`${expected.sha}\` is ready.\n\n[Open preview](${url})\n\nAnyone with this link can access this deployment. The link expires ${new Date(share.expires).toISOString()}.\n\nDeployment: \`${d.id}\`. This is a Preview deployment.\n`;
  // Do not log the link. Its only publication is the authorized PR comment.
  onStage("write_comment");
  const result = owned.length
    ? await io.gh("PATCH", base(p) + `/issues/comments/${owned[0].id}`, { body })
    : await io.gh("POST", base(p) + `/issues/${expected.pr}/comments`, { body });
  need(Number.isSafeInteger(result.id), "COMMENT_WRITE_UNCONFIRMED");
  return result.id;
}

export async function publishPreview(io, p, runtime, event, expected, options = {}) {
  validateRuntime(p, runtime, event);
  need(p.publishPublicLinks === true, "PUBLIC_AUDIENCE_NOT_APPROVED");
  need(Number.isInteger(p.shareTtlSeconds) && p.shareTtlSeconds > 0 && p.shareTtlSeconds <= 86400, "INVALID_SHARE_TTL");
  await latest(io, p, expected);
  // Only deployments whose approval this controller claimed are eligible. A bot
  // comment/status alone never grants publication rights for unrelated previews.
  const attempts = (await checks(io, p, expected.sha, CLAIM)).filter((c) => {
    let r;
    try {
      r = JSON.parse(c.output?.text);
    } catch {
      return false;
    }
    return (
      c.app?.id === p.githubActionsAppId &&
      c.head_sha === expected.sha &&
      r.pr === expected.pr &&
      r.sha === expected.sha &&
      r.forkId === expected.forkId &&
      r.repo === p.repositoryId &&
      r.project === p.projectId &&
      r.job?.prId === expected.pr &&
      r.job?.headInfo?.sha === expected.sha &&
      r.job.org + "/" + r.job.repo === p.repository &&
      c.external_id ===
        "trusted-preview-attempt-v1:" + digest({ repo: p.repositoryId, project: p.projectId, job: r.job })
    );
  });
  if (!attempts.length) return { result: "no_controller_approval_claim" };
  const d = await waitForReady(io, p, expected, options);
  if (!d) return { result: "deployment_wait_timeout_no_link" };
  if (d.terminalFailure) return { result: "deployment_failed_no_link", deployment: d.id, state: d.state };
  const externalId =
    "trusted-preview-publish-v1:" +
    digest({ project: p.projectId, pr: expected.pr, sha: expected.sha, deployment: d.id });
  if (
    (await checks(io, p, expected.sha, PUBLISH)).some(
      (c) => c.app?.id === p.githubActionsAppId && c.external_id === externalId,
    )
  )
    return { result: "publication_already_claimed_no_retry", deployment: d.id };
  await latest(io, p, expected);
  need(
    validateDeployment(p, await io.vapi("GET", deploymentPath(p, d.id)), expected, d.id).readyState === "READY",
    "DEPLOYMENT_NOT_READY",
  );
  const claim = await io.gh("POST", base(p) + "/check-runs", {
    name: PUBLISH,
    head_sha: expected.sha,
    status: "in_progress",
    external_id: externalId,
    output: {
      title: "Public link operation claimed; no automatic replay",
      summary: `PR #${expected.pr}; SHA ${expected.sha}; deployment ${d.id}. Interrupted sharing/comment operations require manual investigation.`,
    },
  });
  need(Number.isSafeInteger(claim.id), "PUBLICATION_CLAIM_UNCONFIRMED");
  const saved = (await checks(io, p, expected.sha, PUBLISH)).filter(
    (c) => c.app?.id === p.githubActionsAppId && c.external_id === externalId,
  );
  need(saved.length === 1 && saved[0].id === claim.id, "PUBLICATION_CLAIM_NOT_UNIQUE");
  await latest(io, p, expected);
  const began = io.now();
  let response;
  try {
    response = await io.vapi("PATCH", sharePath(p, d.id), { ttl: p.shareTtlSeconds });
  } catch {
    return { result: "share_outcome_uncertain_no_retry", deployment: d.id };
  }
  const share = extractShare(p, response, began, io.now());
  io.mask(share.secret);
  let stage = "revalidate_pr";
  try {
    // Recheck exact current PR immediately before publishing a bearer URL.
    const commentId = await upsertPreviewComment(io, p, expected, d, share, (value) => {
      stage = value;
    });
    stage = "complete_publication_check";
    await io.gh("PATCH", base(p) + `/check-runs/${claim.id}`, {
      status: "completed",
      conclusion: "success",
      output: {
        title: "Preview link published",
        summary: `PR #${expected.pr}; SHA ${expected.sha}; deployment ${d.id}; comment ${commentId}; expires ${new Date(share.expires).toISOString()}.`,
      },
    });
    return {
      result: "preview_link_published",
      deployment: d.id,
      commentId,
      expires: new Date(share.expires).toISOString(),
    };
  } catch (error) {
    if (
      error instanceof Refused &&
      ["STALE_HEAD", "PR_NOT_ELIGIBLE", "POLICY_CHANGED", "NO_TRUSTED_SHA_ENDORSEMENT"].includes(error.message)
    ) {
      // Revoke only the just-created link, never a preexisting link or project rule.
      try {
        await io.vapi("PATCH", sharePath(p, d.id), { revoke: { secret: share.secret, regenerate: false } });
      } catch {
        return { result: "stale_link_revoke_uncertain_manual_attention", deployment: d.id };
      }
      return { result: "stale_link_revoked_not_published", deployment: d.id };
    }
    return { result: "comment_outcome_uncertain_no_retry", deployment: d.id, stage, reason: safeFailure(error) };
  }
}
