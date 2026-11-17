#!/usr/bin/env bash
# Show what the fork changes relative to upstream.
#
# Usage:
#   scripts/fork/fork-diff.sh                 Fork-only files and edited upstream files.
#   scripts/fork/fork-diff.sh --markers       Every FORK(...) marker line in edited upstream files.
#   scripts/fork/fork-diff.sh --seams-changed-between <old> <new>
#                                             Edited upstream files that upstream also changed
#                                             between <old> and <new>. Review these after a sync.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

FORK_BRANCH="${FORK_BRANCH:-fork/main}"
base="$(git merge-base "$FORK_BRANCH" upstream/main)"

# Files the fork added (fork/ directories, FORK.md, scripts/fork/). These never conflict.
added_files() { git diff --name-only --diff-filter=A "$base" "$FORK_BRANCH"; }
# Upstream files the fork edited. These are the seams that can conflict.
edited_files() { git diff --name-only --diff-filter=MRD "$base" "$FORK_BRANCH"; }

case "${1:-}" in
  "")
    echo "Fork base: $(git log -1 --format='%h %s' "$base")"
    echo
    echo "Added by the fork:"
    added_files | sed 's/^/  /'
    echo
    echo "Upstream files the fork edits (seams):"
    edited_files | sed 's/^/  /'
    ;;
  --markers)
    edited_files | while read -r f; do
      [[ -f "$f" ]] && grep -n 'FORK(' "$f" | sed "s|^|$f:|" || true
    done
    ;;
  --seams-changed-between)
    old="${2:?old ref required}"
    new="${3:?new ref required}"
    upstream_changed="$(git diff --name-only "$old" "$new")"
    hits="$(comm -12 <(edited_files | sort) <(sort <<<"$upstream_changed"))"
    if [[ -z "$hits" ]]; then
      echo "  none"
    else
      sed 's/^/  /' <<<"$hits"
    fi
    ;;
  *)
    echo "Unknown option: $1" >&2
    exit 1
    ;;
esac
