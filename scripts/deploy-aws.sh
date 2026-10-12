#!/usr/bin/env bash
# Optional: deploys the site as static files to S3 + CloudFront from this machine, with your own AWS CLI credentials,
# to a stack created from infra/aws/site.json. It never builds your working tree: it builds a clean static export
# (STATIC_EXPORT=1) of a commit of origin/main, so the deployed files are exactly that commit's tree.
#
# Configuration (no account, bucket or host is built in):
#   DEPLOY_AWS_ACCOUNT=<12-digit id>   required (or --account): the AWS account the stack lives in; any other refuses
#   DEPLOY_AWS_REGION=<region>         required (or --region, or AWS_REGION): the stack's and the bucket's region
#
#   scripts/deploy-aws.sh                        deploy main's tip, freshly fetched
#   scripts/deploy-aws.sh --rollback-to <sha>    deploy an earlier main commit (see Rollback below)
#
# Options (defaults in brackets):
#   --account <id>           the expected AWS account id [$DEPLOY_AWS_ACCOUNT]
#   --stack <name>           CloudFormation stack holding the site [airplane-systems-site]
#   --region <region>        the stack's and the bucket's region [$DEPLOY_AWS_REGION, else $AWS_REGION]
#   --rollback-to <sha>      deploy <sha>, a commit on origin/main's first-parent history, instead of main's tip
#   -h, --help               print this header
#
# Steps, in order; each refuses (exits) before anything later runs:
#   1. `aws sts get-caller-identity` must report the expected account.
#   2. Git: no inherited GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, GIT_REPLACE_REF_BASE, GIT_GRAFT_FILE,
#      GIT_CONFIG_PARAMETERS, GIT_CONFIG_COUNT, GIT_TEMPLATE_DIR or similar variable. Every git call then runs with
#      replace objects, grafts files and the commit-graph cache ignored (GIT_NO_REPLACE_OBJECTS=1,
#      GIT_GRAFT_FILE=/dev/null, core.commitGraph=false), no system or user gitattributes (GIT_ATTR_NOSYSTEM=1,
#      core.attributesFile=/dev/null, core.autocrlf=false) and hooks off (core.hooksPath=/dev/null).
#      main is fetched explicitly into origin/main (`git fetch origin +refs/heads/main:refs/remotes/origin/main`,
#      whatever remote.origin.fetch says); any refs/replace/ ref, info/grafts or info/attributes file refuses. The
#      deployed commit is origin/main, or the --rollback-to <sha> on its first-parent history (a commit main itself
#      pointed at). Any git error, including a missing remote main, refuses.
#      Working-tree state only WARNS, on stderr and in "warnings": HEAD not the deployed commit, local changes or
#      untracked files, assume-unchanged or skip-worktree entries, sparse checkout. None of it is deployed.
#   3. `git archive` exports the commit into a scratch directory. Every exported file is hashed with
#      `git hash-object --no-filters` and, with its mode, must list exactly as `git ls-tree -r <commit>` (submodules
#      aside): the export is the commit's bytes, or the script refuses (exit 4). In deploy mode, a working-tree copy
#      of this script that differs from the commit's warns. In rollback mode, the running script must match
#      freshly fetched main.
#      The bucket, distribution id and domain are then read from the stack outputs BucketName, DistributionId and
#      DistributionDomainName.
#   4. The viewer-request Function associated with that distribution's default cache behavior (read from
#      `aws cloudfront get-distribution-config`, never from an option) must exist, and its LIVE stage must equal the
#      commit's infra/cloudfront/view-rewrite.js byte for byte and not be a PLACEHOLDER (which would 404
#      every /<aircraft>/<view> path). The commit must have scripts/smoke.mjs.
#   5. In the export: `npm ci` and `STATIC_EXPORT=1 npm run build` (static export to out/).
#   6. Upload the export's out/ without ever deleting (aws s3 sync/cp, no delete flag):
#      pass 1, out/_next/static/ with "public, max-age=31536000, immutable" (.woff2, .js and .css each typed in
#      its own sync, since SecurityHeadersPolicy sends nosniff);
#      pass 2, unconditionally copy everything else (HTML, RSC .txt, icon.svg) with "public, max-age=60".
#   7. One CloudFront invalidation of "/*" (the HTML at every view path; the hashed assets it also covers are
#      unchanged), then `aws cloudfront wait invalidation-completed`.
#   8. The commit's `node scripts/smoke.mjs https://<domain>`.
# The scratch directory (${TMPDIR:-/tmp}/deploy-aws.XXXXXX) is removed on every exit.
#
# Output: one JSON object on stdout, always (except --help):
#   { "ok", "exit_code", "step", "error", "mode", "commit", "account", "region", "stack", "bucket",
#     "distribution_id", "site_url", "invalidation_id", "smoke", "warnings" }
# "commit" is the deployed commit; "smoke" is the smoke script's own JSON summary, or null; "warnings" lists the
# working-tree warnings; "exit_code" always equals the process exit code. The summary is encoded by node's
# JSON.stringify; if node fails, a fixed fallback with "step": "summary" is printed and a would-be success exits 1.
# A failure to remove the scratch directory only warns on stderr; it never changes the exit code. Progress and
# diagnostics go to stderr.
#
# Exit codes:
#   0 deployed and smoke-tested    5 stack outputs missing           9 invalidation failed
#   1 unexpected error             6 CloudFront Function not ready 10 smoke test failed
#   2 bad usage                    7 npm ci or build failed
#   3 wrong or unknown AWS account 8 upload failed
#   4 git guard or clean export refused
#
# Rollback: production is whatever the last run uploaded, so roll back by deploying an earlier main commit; no
# checkout is needed, from any up-to-date checkout of main:
#   git fetch origin && git log --first-parent --oneline origin/main     pick the last good commit <sha>
#   scripts/deploy-aws.sh --rollback-to <sha>
# A commit without the static export, the Function file or the smoke script cannot be deployed; fix forward instead.
# Threat model: this guards against accidental, misconfigured and ordinary-tooling states; an attacker who can write
# your git config, the repository's .git, the environment or this script is out of scope.
# Deploys never delete, so the newer build's hashed files stay in the bucket, harmlessly.
set -euo pipefail

EXPECTED_ACCOUNT="${DEPLOY_AWS_ACCOUNT:-}"
readonly HASHED_CACHE="public, max-age=31536000, immutable"
# Hashed-asset extensions uploaded with an explicit Content-Type, not the CLI's guess: the managed SecurityHeadersPolicy
# sends X-Content-Type-Options: nosniff, so a mistyped script or stylesheet would not load.
# https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-response-headers-policies.html#managed-response-headers-policies-security
readonly TYPED_ASSETS=("woff2:font/woff2" "js:text/javascript" "css:text/css")
readonly SHORT_CACHE="public, max-age=60"
readonly FUNCTION_FILE="infra/cloudfront/view-rewrite.js"
readonly SMOKE_SCRIPT="scripts/smoke.mjs"
readonly PLACEHOLDER_MARKER="PLACEHOLDER"
readonly INVALIDATION_PATHS="/*"

STACK="airplane-systems-site"
REGION="${DEPLOY_AWS_REGION:-${AWS_REGION:-}}"
ROLLBACK_TO=""
MODE="deploy"
STEP="args"
COMMIT=""
SRC=""
SELF=""
WARNINGS=""
ACCOUNT=""
BUCKET=""
DIST_ID=""
DOMAIN=""
INVALIDATION_ID=""
SMOKE_JSON=""
SUMMARY_DONE=0
EXIT_CODE=""
TMP_DIR=""

log() { printf 'deploy-aws: %s\n' "$*" >&2; }

# Encodes the summary: argv is code, then the string fields in SUMMARY_KEYS order (empty means null), then the smoke
# JSON (already validated, or empty).
# shellcheck disable=SC2016 # JavaScript source, not a shell expansion
readonly SUMMARY_JS='
const [code, step, error, mode, commit, account, region, stack, bucket, dist, site, inv, smoke, warnings] =
  process.argv.slice(1);
const v = (s) => (s === "" ? null : s);
const summary = {
  ok: code === "0", exit_code: Number(code), step, error: v(error), mode, commit: v(commit), account: v(account),
  region, stack, bucket: v(bucket), distribution_id: v(dist), site_url: v(site), invalidation_id: v(inv),
  smoke: smoke === "" ? null : JSON.parse(smoke), warnings: warnings.split("\n").filter(Boolean),
};
process.stdout.write(JSON.stringify(summary) + "\n");
'

# Prints the summary object on stdout and sets EXIT_CODE, the code the script exits with; $1 exit code, $2 error
# message (empty on success). If node cannot encode it, a fixed fallback object is printed instead, and a success
# becomes exit 1 (an unexpected error), so the process never exits 0 with "ok": false.
emit_summary() {
  local code=$1 err=$2 site_url=""
  if [[ -n "$DOMAIN" ]]; then site_url="https://$DOMAIN"; fi
  SUMMARY_DONE=1
  EXIT_CODE=$code
  if ! node -e "$SUMMARY_JS" -- "$code" "$STEP" "$err" "$MODE" "$COMMIT" "$ACCOUNT" "$REGION" "$STACK" "$BUCKET" \
    "$DIST_ID" "$site_url" "$INVALIDATION_ID" "$SMOKE_JSON" "$WARNINGS"; then
    if [[ "$EXIT_CODE" -eq 0 ]]; then EXIT_CODE=1; fi
    # only fixed text below, so it is valid JSON without an encoder
    log "error: node could not encode the summary (step '$STEP', outcome exit $code); install Node (the repo needs it) and rerun"
    printf '{"ok":false,"exit_code":%d,"step":"summary","error":"node could not encode the summary; see stderr",' "$EXIT_CODE"
    printf '"mode":null,"commit":null,"account":null,"region":null,"stack":null,"bucket":null,"distribution_id":null,'
    printf '"site_url":null,"invalidation_id":null,"smoke":null,"warnings":[]}\n'
  fi
}

# fail <exit code> <actionable message>
fail() {
  log "error: $2"
  emit_summary "$1" "$2"
  exit "$EXIT_CODE"
}

# Removes the scratch directory. A failure only warns: cleanup never changes the outcome already chosen.
cleanup() {
  if [[ -n "$TMP_DIR" ]] && ! { cd / && rm -rf "$TMP_DIR"; }; then
    log "warning: could not remove $TMP_DIR; delete it by hand"
  fi
  return 0
}

# Runs on every exit. The outcome is fixed first: EXIT_CODE from the summary already printed (fail(), --help or the
# final success), or, when no summary was printed, an unexpected error (set -e), which prints its summary with exit 1
# whatever status the failing command had. Then cleanup runs, and the script exits with that outcome.
on_exit() {
  local status=$?
  if [[ "$SUMMARY_DONE" -eq 0 ]]; then
    log "error: unexpected failure in step '$STEP' (exit $status); see the messages above"
    emit_summary 1 "unexpected failure in step '$STEP' (exit $status)"
  fi
  if [[ -z "$EXIT_CODE" ]]; then EXIT_CODE=$status; fi
  cleanup
  exit "$EXIT_CODE"
}

usage() { sed -n '2,/^set -euo pipefail$/p' "${BASH_SOURCE[0]}" | sed -e '$d' -e 's/^# \{0,1\}//'; }

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -h | --help)
        usage
        SUMMARY_DONE=1
        EXIT_CODE=0
        exit 0
        ;;
      --account | --stack | --region | --rollback-to)
        if [[ $# -lt 2 || -z "$2" || "$2" == -* ]]; then
          fail 2 "$1 needs a value; run scripts/deploy-aws.sh --help for usage"
        fi
        case "$1" in
          --account) EXPECTED_ACCOUNT=$2 ;;
          --stack) STACK=$2 ;;
          --region) REGION=$2 ;;
          --rollback-to)
            ROLLBACK_TO=$2
            MODE="rollback"
            ;;
        esac
        shift 2
        ;;
      *) fail 2 "unknown argument '$1'; run scripts/deploy-aws.sh --help for usage" ;;
    esac
  done
  if [[ ! "$EXPECTED_ACCOUNT" =~ ^[0-9]{12}$ ]]; then
    fail 2 "set DEPLOY_AWS_ACCOUNT (or --account) to the 12-digit AWS account id the stack lives in; got '$EXPECTED_ACCOUNT'"
  fi
  if [[ -z "$REGION" ]]; then
    fail 2 "set DEPLOY_AWS_REGION (or --region) to the stack's region, e.g. us-east-1"
  fi
}

check_account() {
  STEP="account"
  if ! ACCOUNT=$(aws sts get-caller-identity --query Account --output text); then
    ACCOUNT=""
    fail 3 "aws sts get-caller-identity failed; log in to account $EXPECTED_ACCOUNT (e.g. aws sso login) and retry"
  fi
  if [[ "$ACCOUNT" != "$EXPECTED_ACCOUNT" ]]; then
    fail 3 "AWS credentials are for account '$ACCOUNT', not $EXPECTED_ACCOUNT; switch profile (AWS_PROFILE) and retry"
  fi
  log "account $ACCOUNT"
}

# Inherited git environment variables that would point git at another repository, index, object store, replace ref
# base, grafts file or config than this checkout's; any of them refuses.
readonly GIT_ENV_VARS="GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_COMMON_DIR GIT_NAMESPACE GIT_REPLACE_REF_BASE GIT_NO_REPLACE_OBJECTS GIT_GRAFT_FILE GIT_CONFIG_PARAMETERS GIT_CONFIG_COUNT GIT_TEMPLATE_DIR"

# Sets the environment every later git call runs under: replace objects, grafts files and the commit-graph cache are
# ignored (history comes from the commit objects themselves), hooks never run, no system or user gitattributes file
# applies, and the working-tree warnings see real file contents (no fsmonitor, full stat checks).
git_environment() {
  local var
  for var in $GIT_ENV_VARS; do
    if [[ -n "${!var+set}" ]]; then
      fail 4 "$var is set in the environment, so git would not read this checkout as it is; unset it and retry"
    fi
  done
  export GIT_NO_REPLACE_OBJECTS=1 GIT_GRAFT_FILE=/dev/null GIT_ATTR_NOSYSTEM=1
  export GIT_CONFIG_COUNT=8
  export GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/dev/null
  export GIT_CONFIG_KEY_1=core.fsmonitor GIT_CONFIG_VALUE_1=false
  export GIT_CONFIG_KEY_2=core.checkStat GIT_CONFIG_VALUE_2=default
  export GIT_CONFIG_KEY_3=core.trustctime GIT_CONFIG_VALUE_3=true
  # GIT_GRAFT_FILE=/dev/null makes git print its grafts-deprecation hint on every call
  export GIT_CONFIG_KEY_4=advice.graftFileDeprecated GIT_CONFIG_VALUE_4=false
  export GIT_CONFIG_KEY_5=core.attributesFile GIT_CONFIG_VALUE_5=/dev/null
  export GIT_CONFIG_KEY_6=core.commitGraph GIT_CONFIG_VALUE_6=false
  export GIT_CONFIG_KEY_7=core.autocrlf GIT_CONFIG_VALUE_7=false
}

# Refuses a repository with replace refs or a grafts file: either can make a commit's history or tree look different
# from what origin/main holds.
check_history_overrides() {
  local refs common
  if ! refs=$(git for-each-ref --format='%(refname)' refs/replace/); then
    fail 4 "git for-each-ref refs/replace/ failed; see the git error above"
  fi
  if [[ -n "$refs" ]]; then
    fail 4 "the repository has replace refs ($(printf '%s' "$refs" | head -n 1) ...); remove them (git replace -d) or deploy from a fresh clone"
  fi
  if ! common=$(git rev-parse --git-common-dir); then
    fail 4 "git rev-parse --git-common-dir failed; run the script from a git checkout of the repo"
  fi
  if [[ -e "$common/info/grafts" ]]; then
    fail 4 "$common/info/grafts exists; remove it or deploy from a fresh clone"
  fi
  # git archive applies info/attributes conversions and filters to the exported files
  if [[ -e "$common/info/attributes" ]]; then
    fail 4 "$common/info/attributes exists, and its attributes would change the exported files; remove it or deploy from a fresh clone"
  fi
}

# Adds a working-tree warning: printed on stderr now, listed in the summary's "warnings".
warn() {
  log "warning: $1"
  WARNINGS+="$1"$'\n'
}

# The working tree is not what gets deployed (the build uses a clean export of COMMIT), so its state only warns.
warn_working_tree() {
  local head status flagged rc=0 sparse
  if ! head=$(git rev-parse --verify --quiet HEAD); then
    warn "could not read HEAD; the deploy still builds $COMMIT"
  elif [[ "$head" != "$COMMIT" ]]; then
    warn "HEAD ($head) is not the deployed commit ($COMMIT); the deploy builds $COMMIT, not your checkout"
  fi
  if ! status=$(git status --porcelain --untracked-files=all --ignore-submodules=none); then
    warn "git status failed; the deploy still builds $COMMIT"
  elif [[ -n "$status" ]]; then
    warn "the working tree has local changes or untracked files; they are not deployed"
  fi
  if ! flagged=$(git ls-files -v); then
    warn "git ls-files failed; the deploy still builds $COMMIT"
  else
    flagged=$(grep -m 1 -E '^([a-z]|S) ' <<<"$flagged") || rc=$?
    case "$rc" in
      0) warn "'${flagged:2}' is marked assume-unchanged or skip-worktree; local changes to it are not deployed" ;;
      1) ;;
      *) warn "checking git ls-files -v failed (grep exit $rc)" ;;
    esac
  fi
  rc=0
  sparse=$(git config --bool core.sparseCheckout) || rc=$?
  if [[ "$rc" -eq 0 && "$sparse" == "true" ]]; then
    warn "sparse checkout is on; the deploy still builds every file of $COMMIT"
  fi
}

# Resolves COMMIT, the commit to deploy, from a freshly fetched main; the checkout itself is never built.
check_git() {
  STEP="git"
  git_environment
  # fetch main explicitly into origin/main, whatever remote.origin.fetch says, so nothing below uses a stale
  # origin/main; a missing remote main fails the fetch
  if ! git fetch --quiet --no-tags --refmap= origin +refs/heads/main:refs/remotes/origin/main; then
    fail 4 "git fetch of main from origin failed; check the network, your GitHub access and that origin has a main branch, then retry"
  fi
  check_history_overrides
  local main
  if ! main=$(git rev-parse --verify --quiet "refs/remotes/origin/main^{commit}"); then
    fail 4 "origin/main not found after git fetch; check the remote named origin"
  fi
  if [[ "$MODE" == "deploy" ]]; then
    COMMIT=$main
  else
    # Compare against the freshly fetched tip, not the older rollback target.
    if ! git show "$main:scripts/deploy-aws.sh" >"$TMP_DIR/main-deploy-aws.sh"; then
      fail 4 "cannot read scripts/deploy-aws.sh from origin/main; update your checkout or use a fresh clone"
    fi
    local compare=0
    cmp -s "$TMP_DIR/main-deploy-aws.sh" "$SELF" || compare=$?
    case "$compare" in
      0) ;;
      1)
        fail 4 "this scripts/deploy-aws.sh differs from origin/main; update your checkout or use a fresh clone before rolling back"
        ;;
      *) fail 4 "cannot compare scripts/deploy-aws.sh with origin/main (cmp exit $compare); check file access or use a fresh clone" ;;
    esac
    local target first_parent
    if ! target=$(git rev-parse --verify --quiet "$ROLLBACK_TO^{commit}"); then
      fail 4 "--rollback-to '$ROLLBACK_TO' is not a commit; pick one from git log --first-parent origin/main"
    fi
    if ! first_parent=$(git rev-list --first-parent "$main"); then
      fail 4 "git rev-list --first-parent origin/main failed; see the git error above"
    fi
    case $'\n'"$first_parent"$'\n' in
      *$'\n'"$target"$'\n'*) ;;
      *) fail 4 "rollback commit $target is not on origin/main's first-parent history; pick one from git log --first-parent origin/main" ;;
    esac
    COMMIT=$target
  fi
  log "$MODE of commit $COMMIT"
  warn_working_tree
}

# Prints every exported file of SRC as "<mode> blob <sha>\t<path>", the format of git ls-tree -r, sorted. Each file is
# hashed with --no-filters, so no eol, ident, encoding or filter attribute can make changed bytes hash as the commit's
# blob. A symlink hashes its target text (mode 120000); the exec bit sets 100755.
export_listing() {
  (
    cd "$SRC" || exit 1
    find . -type f -print | sed 's|^\./||' >"$TMP_DIR/files" || exit 1
    git hash-object --no-filters --stdin-paths <"$TMP_DIR/files" >"$TMP_DIR/blobs" || exit 1
    # Permission bits, not effective access: -x can be false on a noexec mount.
    # Read all modes in one Node process, using the same path order as the blob hashes.
    node -e '
      const fs = require("fs");
      const paths = fs.readFileSync(process.argv[1], "utf8").split("\n").filter(Boolean);
      for (const path of paths) console.log((fs.statSync(path).mode & 0o100) ? "100755" : "100644");
    ' -- "$TMP_DIR/files" >"$TMP_DIR/modes" || exit 1
    while IFS= read -r path <&3 && IFS= read -r blob <&4 && IFS= read -r mode <&5; do
      printf '%s blob %s\t%s\n' "$mode" "$blob" "$path"
    done 3<"$TMP_DIR/files" 4<"$TMP_DIR/blobs" 5<"$TMP_DIR/modes"
    find . -type l -print | sed 's|^\./||' | while IFS= read -r path; do
      blob=$(readlink "$path" | tr -d '\n' | git hash-object --no-filters --stdin) || exit 1
      printf '120000 blob %s\t%s\n' "$blob" "$path"
    done
  ) | LC_ALL=C sort
}

# Writes COMMIT's tree to SRC with git archive, then proves the export is byte for byte that tree: every exported file
# hashed without filters, with its mode, must list exactly as git ls-tree -r lists the commit.
export_commit() {
  STEP="export"
  SRC="$TMP_DIR/src"
  local want got
  if ! mkdir "$SRC"; then fail 4 "cannot create $SRC for the clean export"; fi
  if ! git archive --format=tar "$COMMIT" | tar -x -f - -C "$SRC"; then
    fail 4 "git archive of $COMMIT failed; see the error above"
  fi
  if ! want=$(git ls-tree -r -z --full-tree "$COMMIT" | tr '\0' '\n'); then fail 4 "git ls-tree $COMMIT failed"; fi
  # submodule entries (mode 160000) are left out: git archive exports them as empty directories
  want=$(printf '%s\n' "$want" | awk '$1 != "160000"' | LC_ALL=C sort)
  if ! got=$(export_listing); then
    fail 4 "hashing the export of $COMMIT failed; see the error above"
  fi
  if [[ "$got" != "$want" ]]; then
    fail 4 "the export of $COMMIT does not match its tree byte for byte (an eol, ident, encoding, filter or export attribute?); deploy from a fresh clone"
  fi
  log "exported $COMMIT to $SRC; every file matches the commit's tree byte for byte"
  # the script running now is the checkout's copy; say so when it is not the deployed commit's
  if [[ "$MODE" == "deploy" ]]; then
    local compare=0
    cmp -s "$SRC/scripts/deploy-aws.sh" "$SELF" || compare=$?
    case "$compare" in
      0) ;;
      1) warn "this scripts/deploy-aws.sh differs from the deployed commit's copy; the checks ran with your local version" ;;
      *) fail 4 "cannot compare scripts/deploy-aws.sh with the deployed commit (cmp exit $compare); check file access or use a fresh clone" ;;
    esac
  fi
}

stack_output() {
  aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue | [0]" --output text
}

read_stack() {
  STEP="stack"
  local key value
  for key in BucketName DistributionId DistributionDomainName; do
    if ! value=$(stack_output "$key"); then
      fail 5 "cannot read stack '$STACK' in $REGION; check --stack and --region (aws cloudformation describe-stacks)"
    fi
    if [[ -z "$value" || "$value" == "None" ]]; then
      fail 5 "stack '$STACK' has no output $key; was it created from infra/aws/site.json?"
    fi
    case "$key" in
      BucketName) BUCKET=$value ;;
      DistributionId) DIST_ID=$value ;;
      DistributionDomainName) DOMAIN=$value ;;
    esac
  done
  log "bucket $BUCKET, distribution $DIST_ID, https://$DOMAIN"
}

# Whether file $1 holds the placeholder marker; an unreadable file refuses (grep exit 2 is not "no marker").
has_placeholder() {
  local rc=0
  grep -q "$PLACEHOLDER_MARKER" "$1" || rc=$?
  case "$rc" in
    0) return 0 ;;
    1) return 1 ;;
    *) fail 6 "cannot read $1 to check it for the placeholder (grep exit $rc)" ;;
  esac
}

# The name of the viewer-request Function on the distribution's default cache behavior, or nothing.
associated_function() {
  aws cloudfront get-distribution-config --id "$DIST_ID" \
    --query "DistributionConfig.DefaultCacheBehavior.FunctionAssociations.Items[?EventType=='viewer-request'].FunctionARN | [0]" \
    --output text
}

check_function() {
  STEP="function"
  local committed="$SRC/$FUNCTION_FILE"
  if [[ ! -f "$committed" ]]; then
    fail 6 "$FUNCTION_FILE is missing from commit $COMMIT; deploy a commit that has the view-rewrite Function"
  fi
  if has_placeholder "$committed"; then
    fail 6 "$FUNCTION_FILE in commit $COMMIT is still a placeholder; commit the real Function first"
  fi
  local arn name live="$TMP_DIR/live-function.js"
  if ! arn=$(associated_function); then
    fail 6 "cannot read the config of distribution $DIST_ID (aws cloudfront get-distribution-config); check your access"
  fi
  name=${arn##*:function/}
  if [[ "$arn" != *":cloudfront::$EXPECTED_ACCOUNT:function/$name" || ! "$name" =~ ^[A-Za-z0-9_-]{1,64}$ ]]; then
    fail 6 "distribution $DIST_ID has no viewer-request CloudFront Function of account $EXPECTED_ACCOUNT on its default behavior (got '$arn'); update the stack from infra/aws/site.json"
  fi
  if ! aws cloudfront get-function --name "$name" --stage LIVE "$live" >/dev/null; then
    fail 6 "cannot read the LIVE stage of CloudFront Function '$name', associated with distribution $DIST_ID"
  fi
  if has_placeholder "$live"; then
    fail 6 "the LIVE CloudFront Function '$name' is still the PLACEHOLDER; update the stack with the real Function (a change set from infra/aws/site.json) first"
  fi
  if ! cmp -s "$live" "$committed"; then
    fail 6 "the LIVE CloudFront Function '$name' differs from $FUNCTION_FILE in commit $COMMIT; update the stack (a change set from infra/aws/site.json) or deploy the matching commit"
  fi
  if [[ ! -f "$SRC/$SMOKE_SCRIPT" ]]; then
    fail 6 "$SMOKE_SCRIPT is missing from commit $COMMIT; deploy a commit that has the smoke test"
  fi
  log "LIVE Function '$name' of distribution $DIST_ID matches $FUNCTION_FILE"
}

# Builds the clean export; from here on the working directory is SRC, so out/ is the export's build.
build_site() {
  STEP="build"
  if ! cd "$SRC"; then fail 7 "cannot enter the export $SRC"; fi
  if ! npm ci >&2; then fail 7 "npm ci failed; see the npm output above"; fi
  if ! STATIC_EXPORT=1 npm run build >&2; then fail 7 "STATIC_EXPORT=1 npm run build failed; see the build output above"; fi
  if [[ ! -f out/index.html || ! -d out/_next/static ]]; then
    fail 7 "the build wrote no out/index.html or out/_next/static; does this commit's next.config.ts support STATIC_EXPORT=1?"
  fi
}

upload() {
  STEP="upload"
  local dest="s3://$BUCKET"
  log "pass 1: out/_next/static -> $dest/_next/static ($HASHED_CACHE)"
  local typed excludes=()
  for typed in "${TYPED_ASSETS[@]}"; do excludes+=(--exclude "*.${typed%%:*}"); done
  if ! aws s3 sync out/_next/static "$dest/_next/static" --region "$REGION" --no-progress \
    "${excludes[@]}" --cache-control "$HASHED_CACHE" >&2; then
    fail 8 "uploading the hashed assets failed; nothing was deleted, fix the cause and rerun"
  fi
  for typed in "${TYPED_ASSETS[@]}"; do
    if ! aws s3 sync out/_next/static "$dest/_next/static" --region "$REGION" --no-progress \
      --exclude "*" --include "*.${typed%%:*}" --content-type "${typed#*:}" --cache-control "$HASHED_CACHE" >&2; then
      fail 8 "uploading the .${typed%%:*} assets failed; nothing was deleted, fix the cause and rerun"
    fi
  done
  log "pass 2: out -> $dest, except _next/static ($SHORT_CACHE)"
  if ! aws s3 cp out "$dest" --recursive --region "$REGION" --no-progress \
    --exclude "_next/static/*" --cache-control "$SHORT_CACHE" >&2; then
    fail 8 "uploading the HTML failed; the new hashed assets are up but harmless, fix the cause and rerun"
  fi
}

invalidate() {
  STEP="invalidate"
  if ! INVALIDATION_ID=$(aws cloudfront create-invalidation --distribution-id "$DIST_ID" \
    --paths "$INVALIDATION_PATHS" --query Invalidation.Id --output text); then
    INVALIDATION_ID=""
    fail 9 "create-invalidation failed; the files are uploaded, so rerun or wait up to 300 s for the HTML cache to expire"
  fi
  if [[ -z "$INVALIDATION_ID" || "$INVALIDATION_ID" == "None" ]]; then
    INVALIDATION_ID=""
    fail 9 "create-invalidation returned no Id; check the distribution in the CloudFront console"
  fi
  log "invalidation $INVALIDATION_ID; waiting for it to complete"
  if ! aws cloudfront wait invalidation-completed --distribution-id "$DIST_ID" --id "$INVALIDATION_ID"; then
    fail 9 "waiting for invalidation $INVALIDATION_ID failed; check it with aws cloudfront get-invalidation"
  fi
}

smoke() {
  STEP="smoke"
  local out code=0
  out=$(node "$SMOKE_SCRIPT" "https://$DOMAIN") || code=$?
  # keep the smoke summary only if it is one JSON value, compacted, so stdout stays a single valid object
  if ! SMOKE_JSON=$(printf '%s' "$out" | node -e \
    'process.stdout.write(JSON.stringify(JSON.parse(require("fs").readFileSync(0, "utf8"))))' 2>/dev/null); then
    SMOKE_JSON=""
    log "warning: the smoke test printed no valid JSON summary; its stderr above has the details"
  fi
  if [[ "$code" -ne 0 ]]; then
    fail 10 "the smoke test failed (exit $code) against https://$DOMAIN; roll back with --rollback-to <last good sha> (see --help)"
  fi
  if [[ -z "$SMOKE_JSON" ]]; then
    fail 10 "the smoke test printed no valid JSON summary; check its stderr above and rerun"
  fi
}

main() {
  trap on_exit EXIT
  parse_args "$@"
  STEP="setup"
  SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
  cd "$(dirname "$SELF")/.."
  local tmp_base=${TMPDIR:-/tmp}
  TMP_DIR=$(mktemp -d "${tmp_base%/}/deploy-aws.XXXXXX")
  check_account
  check_git
  export_commit
  read_stack
  check_function
  build_site
  upload
  invalidate
  smoke
  STEP="done"
  log "deployed $COMMIT to https://$DOMAIN"
  emit_summary 0 ""
  exit "$EXIT_CODE"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
