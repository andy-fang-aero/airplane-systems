# Trusted fork previews

This workflow approves the native Vercel fork deployment for explicitly trusted accounts, waits for the exact Preview to be READY, and publishes a deployment-scoped 24-hour share link in one PR comment.

## Current rollout state

Enabled after the owner saved the project-only token in the main-only environment. Draft PRs qualify. A fresh live canary is used to verify the complete approval and publication path. Set `policy.json` to `enabled: false` to stop new operations. Existing PRs need a new authenticated eligible PR event; they are not grandfathered in. PR38 is permanently excluded from this controller and must not be retried.

The approved numeric GitHub IDs are `11378800` (ligolnik) and `340809365` (andy-fang-aero). Opener, fork owner, and authenticated event actor must be allowlisted. Names, author emails, and contributor labels do not grant trust. The fixed Vercel project is `prj_N5tnGlRaJT3WVu4V4ev0bQZcItDw` in team `team_Coqz1m7hJ3KWZhlNgdpK98Y2`.

## Trust and event flow

1. A trusted `pull_request_target` event records an endorsement check for the exact current SHA, fork, actor, workflow commit, and policy hash.
2. Genuine Vercel bot comments and Vercel status events wake the controller. It re-reads the PR, main-branch policy, endorsement provenance, the exact current SHA status and its full-status Vercel bot creator, and Vercel job-info before acting.
3. Per-PR concurrency and a persistent claim written before the authorization POST prevent automatic replay. Ambiguous responses retain the claim for manual investigation. Do not install a second controller or change the concurrency namespace.
4. Only the upstream workflow commit is checked out, using a pinned checkout action. No fork code or dependencies execute in this workflow. The Vercel token is provided only to the privileged controller step. Reruns are refused.
5. The publisher waits up to 20 minutes and verifies team, project, repository, SHA, immutable host, `target: null`, and `readyState: READY`. A separate persistent claim prevents duplicate sharing/comment operations.
6. A deployment-ID-scoped protection bypass is created with `ttl: 86400`. Only one fresh entry with a bounded expiry is accepted. The comment is created or updated only when owned by the numeric GitHub Actions bot; human lookalike comments are ignored. A stale head after sharing triggers revocation of only the new link.

Links are public bearer URLs: anyone reading the PR can use or forward them. Older links expire naturally; this workflow does not renew links or remove comment history. Project-wide deployment protection remains enabled. Preview code runs with Vercel's configured Preview environment, integrations, and OIDC trust, so changes to those settings require renewed scope review.

## Credential handoff and activation

The approved credential is one non-expiring Vercel project-only read/write token named `airplane-systems-trusted-preview-action`. It can affect production resources in the same project; it is not restricted to the approval endpoint. Never widen it to All Projects or Full Account. Do not reuse the expired PR38 token.

The owner must enter its value directly into the `VERCEL_APPROVAL_TOKEN` environment secret in GitHub environment `trusted-preview-approval`. That environment must allow only the `main` branch. The agent must not inspect, copy, log, transmit, or use the token. No GitHub PAT is required.

The environment secret was confirmed by metadata only. Run a new harmless draft canary from andy-fang-aero; never merge it. Verify the endorsement/check API contract, authorization, exact READY Preview, finite 24-hour expiry, anonymous access, and a single correct comment. Verify a duplicate event does not reapprove and a fresh commit updates the same comment. On failure disable the policy and retain evidence. Never retry an uncertain mutation blindly.

## Checks and limitations

`npm run test:trusted-preview` runs isolated Node tests with mocked HTTP. `npm run check` includes these tests. Actionlint checks the workflow separately. No live credentials or network mutations occur in unit tests.

The authorization endpoint is undocumented, although a controlled PR38 test demonstrated HTTP 200 and the exact SHA reaching READY. Share-response parsing and project-token sharing permission still need the new live canary. There is a small unavoidable race between final metadata reads and remote operations; all operations use the pinned SHA. Interrupted mutations may require manual reconciliation.

Repository maintainers must control main and these workflow/policy files. A main-only environment is not a substitute for branch protection or protection from other main-branch workflows; this change does not alter repository-wide branch rules.

Sources: [GitHub pull_request_target security](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target), [GitHub concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency), [Vercel deployment-scoped bypass API](https://vercel.com/docs/rest-api/aliases/update-the-protection-bypass-for-a-url), [Vercel OpenAPI](https://openapi.vercel.sh).
