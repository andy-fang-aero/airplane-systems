# Trusted fork previews

This workflow approves the native Vercel fork deployment for explicitly trusted accounts, waits for the exact Preview to be READY, and publishes a deployment-scoped share link with no expiration date in one PR comment.

## Current rollout state

Enabled after the owner saved the project-only token in the main-only environment. Draft PRs qualify. A fresh live canary is used to verify the complete approval and publication path. Set `policy.json` to `enabled: false` to stop new operations. Existing PRs need a new authenticated eligible PR event; they are not grandfathered in. PR38 is permanently excluded from this controller and must not be retried.

The approved numeric GitHub IDs are `11378800` (ligolnik) and `340809365` (andy-fang-aero). The PR opener and fork owner must remain on that contributor allowlist. The separate update-sender allowlist contains `3586644` (andyfangdz, verified through the GitHub user API). That owner may endorse only `synchronize`, `reopened`, and `ready_for_review` events on existing eligible contributor PRs; it does not permit owner-authored PRs, owner forks, or owner `opened` events. Names, author emails, and contributor labels do not grant trust. The fixed Vercel project is `prj_N5tnGlRaJT3WVu4V4ev0bQZcItDw` in team `team_Coqz1m7hJ3KWZhlNgdpK98Y2`.

## Trust and event flow

1. A trusted `pull_request_target` event records an endorsement check for the exact current SHA, fork, actor, event action, workflow commit, and policy hash. Its digest is also recorded as a successful step name in the trusted `prepare` job. The controller verifies the receipt against that run’s attempt-1 job metadata, including the workflow path, actor, repository, fork and SHA. Custom checks may attach to another workflow’s check suite, so suite equality and caller-supplied URLs are not provenance. A missing proof fails the approval job visibly. Older receipts without this proof require a fresh eligible event; rerunning a job remains forbidden.
2. Genuine Vercel bot comments and Vercel status events wake the controller. It re-reads the PR, main-branch policy, endorsement provenance, the exact current SHA status and its full-status Vercel bot creator, and Vercel job-info before acting.
3. Per-PR concurrency and a persistent claim written before the authorization POST prevent automatic replay. Ambiguous responses retain the claim for manual investigation. Do not install a second controller or change the concurrency namespace.
4. Only the upstream workflow commit is checked out, using a pinned checkout action. No fork code or dependencies execute in this workflow. The Vercel token is provided only to the privileged controller step. Reruns are refused.
5. The publisher waits up to 20 minutes and verifies team, project, repository, SHA, immutable host, `target: null`, and `readyState: READY`. A separate persistent claim prevents duplicate sharing/comment operations.
6. A deployment-ID-scoped shareable link is created with an empty request body: Vercel documents that omitting `ttl` creates a non-expiring link. Policy explicitly sets `shareTtlSeconds: null`; an absent or invalid policy value is rejected. Only one newly created entry with no expiration is accepted. The bounded-TTL parser remains available for an explicitly finite policy; Vercel's `expires` uses Unix seconds and `createdAt` uses milliseconds. The comment is created or updated only when owned by the numeric GitHub Actions bot; human lookalike comments are ignored. A stale head after sharing triggers revocation of only the new link.

Links are public bearer URLs: anyone reading the PR can use or forward them. New links have no scheduled expiration, but can stop working if revoked or if their deployment is deleted, including by Vercel retention policies. Non-expiring links do not guarantee permanent hosting. Existing 24-hour links retain their original expiry; this workflow does not automatically renew old links or remove comment history. Project-wide deployment protection remains enabled. Preview code runs with Vercel's configured Preview environment, integrations, and OIDC trust, so changes to those settings require renewed scope review.

The privileged job uses `pull-requests: write` for its PR comment and `issues: read` for comment discovery. Publication failures report only a fixed stage and sanitized refusal code; raw API responses, bearer links, and credentials are never included. A failed comment/check operation still retains its publication claim and is not automatically replayed.

## Credential handoff and activation

The approved credential is one non-expiring Vercel project-only read/write token named `airplane-systems-trusted-preview-action`. It can affect production resources in the same project; it is not restricted to the approval endpoint. Never widen it to All Projects or Full Account. Do not reuse the expired PR38 token.

The owner must enter its value directly into the `VERCEL_APPROVAL_TOKEN` environment secret in GitHub environment `trusted-preview-approval`. That environment must allow only the `main` branch. The agent must not inspect, copy, log, transmit, or use the token. No GitHub PAT is required.

The environment secret was confirmed by metadata only. Use a harmless, unmerged draft canary authored by an allowlisted contributor, then push an exact new commit as andyfangdz to verify the owner update path. Verify the endorsement/check API contract, authorization, exact READY Preview, omitted/null expiry, anonymous access, and a single correct comment. Verify a duplicate event does not reapprove and a fresh commit updates the same comment. On failure retain evidence and stop uncertain mutations; do not replay an existing claim. Never retry an uncertain mutation blindly.

## Checks and limitations

`npm run test:trusted-preview` runs isolated Node tests with mocked HTTP. `npm run check` includes these tests. Actionlint checks the workflow separately. No live credentials or network mutations occur in unit tests.

The authorization endpoint is undocumented. The PR41 canary demonstrated automatic approval and the exact SHA reaching READY with the project-only token. It also created a deployment-scoped link with a 24-hour expiry, but the original parser rejected the seconds-valued expiry before posting a comment. Subsequent canaries verified timed-link publication and anonymous access. The owner-update and non-expiring-link changes require a fresh canary commit; previous publication claims must not be replayed. There is a small unavoidable race between final metadata reads and remote operations; all operations use the pinned SHA. Interrupted mutations may require manual reconciliation.

Repository maintainers must control main and these workflow/policy files. A main-only environment is not a substitute for branch protection or protection from other main-branch workflows; this change does not alter repository-wide branch rules.

Sources: [GitHub pull_request_target security](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target), [GitHub concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency), [Vercel deployment-scoped bypass API](https://vercel.com/docs/rest-api/aliases/update-the-protection-bypass-for-a-url), [Vercel OpenAPI](https://openapi.vercel.sh).
