#!/usr/bin/env bash
# Merge a new upstream T3 Code release into the fork's integration branch.
#
# Usage: scripts/fork/sync-upstream.sh [ref]
#   ref  upstream ref to merge. Defaults to the newest stable tag (vX.Y.Z).
#        Pass upstream/main to follow nightly instead.
#
# What it does:
#   1. Fetches upstream and fast-forwards the `main` mirror to upstream/main.
#   2. Merges <ref> into `fork/main` on a throwaway `fork/sync-<ref>` branch,
#      so a bad merge never touches fork/main until you finish it yourself.
#   3. Reports which fork seams upstream changed, even when nothing conflicted.
set -euo pipefail

FORK_BRANCH="fork/main"
MIRROR_BRANCH="main"

cd "$(git rev-parse --show-toplevel)"

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "Working tree has uncommitted changes. Commit or stash them first." >&2
  exit 1
fi

git fetch upstream --tags --prune --quiet
git fetch origin --prune --quiet

ref="${1:-$(git tag -l 'v*' --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -1)}"
if ! git rev-parse --verify --quiet "${ref}^{commit}" >/dev/null; then
  echo "Unknown ref: ${ref}" >&2
  exit 1
fi

# Keep `main` an exact mirror of upstream. It never carries fork commits.
git switch --quiet "$MIRROR_BRANCH"
git merge --ff-only --quiet upstream/main
git push --quiet origin "$MIRROR_BRANCH"

if git merge-base --is-ancestor "$ref" "$FORK_BRANCH"; then
  git switch --quiet "$FORK_BRANCH"
  echo "${FORK_BRANCH} already contains ${ref}. Nothing to merge."
  exit 0
fi

base="$(git merge-base "$FORK_BRANCH" "$ref")"
sync_branch="fork/sync-${ref//\//-}"
git switch --quiet -C "$sync_branch" "$FORK_BRANCH"

echo "Merging ${ref} into ${sync_branch} (from ${FORK_BRANCH})..."
merge_ok=1
git merge --no-ff --no-edit -m "chore(fork): merge upstream ${ref}" "$ref" || merge_ok=0

echo
echo "Fork seams upstream changed since the last sync:"
scripts/fork/fork-diff.sh --seams-changed-between "$base" "$ref" || true

if [[ "$merge_ok" -eq 0 ]]; then
  echo
  echo "Conflicts to resolve:"
  git diff --name-only --diff-filter=U | sed 's/^/  /'
  cat <<EOF

Resolve them, following FORK.md:
  - pnpm-lock.yaml: take upstream's copy, then run \`pnpm install\` to rebuild it.
  - i18n catalogs: take upstream's copy, then run \`vp run i18n:generate\`.
  - Files with FORK(...) markers: keep upstream's change, then re-add the marked lines.
Then \`git commit\`, run the checks in FORK.md, and fast-forward ${FORK_BRANCH}:
  git switch ${FORK_BRANCH} && git merge --ff-only ${sync_branch} && git push origin ${FORK_BRANCH}
EOF
  exit 2
fi

cat <<EOF

Merge is clean. Review the seams above, run the checks in FORK.md, then:
  git switch ${FORK_BRANCH} && git merge --ff-only ${sync_branch} && git push origin ${FORK_BRANCH}
EOF
