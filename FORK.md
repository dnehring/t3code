# dnehring/t3code fork

A personal fork of [pingdotgg/t3code](https://github.com/pingdotgg/t3code) that adds features upstream doesn't ship. The first one planned is ElevenLabs audio playback for assistant messages.

The goal is that merging a new upstream release takes minutes. Every rule below exists to keep the fork's footprint in upstream files small and easy to find.

## Branches

| Branch | Purpose |
| --- | --- |
| `main` | Exact mirror of `upstream/main`. Never commit to it. The sync script fast-forwards it. |
| `fork/main` | Integration branch: an upstream release plus the fork's changes. Build from here. |
| `fork/<feature>` | Feature work. Branch from `fork/main` and merge back into it. |
| `fork/sync-<tag>` | Throwaway branch the sync script creates for each upstream merge. |

`fork/main` tracks stable upstream tags (`vX.Y.Z`), not nightly `main`. It started from `v0.1.10`.

Local setup this checkout already has:

- `upstream` push URL is disabled, so nothing can be pushed to pingdotgg by accident.
- `gh repo set-default dnehring/t3code`, so `gh pr create` targets the fork.
- `rerere` is on, so git replays conflict resolutions it has seen before.
- `merge.conflictstyle zdiff3` shows the common ancestor inside conflict markers.
- GitHub Actions are disabled on the fork. Upstream's release, relay deploy, and mobile production workflows would otherwise run on push and fail without upstream's secrets.

A fresh clone needs the same setup:

```sh
git remote add upstream https://github.com/pingdotgg/t3code.git
git remote set-url --push upstream DISABLED-do-not-push-to-upstream
git config rerere.enabled true
git config rerere.autoupdate true
git config merge.conflictstyle zdiff3
gh repo set-default dnehring/t3code
```

## Rules for fork code

1. **New code goes in new files.** Use `apps/web/src/fork/<feature>/` and `apps/server/src/fork/<feature>/`. Upstream never touches these paths, so they never conflict.
2. **Upstream files get wiring only.** An import plus a call, route registration, or JSX element. Put logic in the fork file, not inline.
3. **Mark every edited line in an upstream file** with `FORK(<feature>)`, using `// FORK(tts): <reason>` in TypeScript and `{/* FORK(tts): <reason> */}` in JSX. `scripts/fork/fork-diff.sh --markers` lists them.
4. **Add lines. Don't move or reformat upstream code.** Insert at the end of an import block or a list rather than the middle, and don't run a formatter over whole upstream files.
5. **No dependency changes.** `pnpm-lock.yaml` changes on almost every upstream release, so any fork entry in it conflicts constantly. Call external APIs such as ElevenLabs with `fetch`, not an SDK.
6. **No new workspace packages.** They also land in `pnpm-lock.yaml`.
7. **Regenerate generated files instead of merging them.** That covers `pnpm-lock.yaml` and the i18n translation catalogs.
8. **Follow upstream's `AGENTS.md`** for code style, tests, and commit messages. Fork code that looks like upstream code is easier to offer back as a PR.

## Syncing an upstream release

```sh
scripts/fork/sync-upstream.sh            # newest stable tag
scripts/fork/sync-upstream.sh v0.1.11    # a specific tag
```

The script fast-forwards `main`, merges the tag into a `fork/sync-<tag>` branch, and lists any fork seams upstream changed in that release. It never moves `fork/main` itself.

If it reports conflicts:

- `pnpm-lock.yaml`: `git checkout --theirs pnpm-lock.yaml`, then `pnpm install`.
- i18n catalogs: take upstream's copy, then `vp run i18n:generate`.
- Files with `FORK(...)` markers: keep upstream's version of the surrounding code, then re-add the marked lines.

Then run the checks below and fast-forward `fork/main` with the command the script prints.

### Checks after a sync

- `vp run check:changed` for format, lint, knip, and typecheck on the files that changed.
- `vp test run apps/web/src/fork apps/server/src/fork` for the fork's own tests.
- A quick run of the app (`vp run dev`), playing one assistant message aloud.

`scripts/fork/fork-diff.sh` with no arguments prints everything the fork adds and every upstream file it edits.

## Building the desktop app

The installed app updates itself from pingdotgg/t3code releases, which would replace a fork build. To build a fork app that doesn't do that, set the update source to the fork:

```sh
T3CODE_DESKTOP_UPDATE_REPOSITORY=dnehring/t3code
```

With no releases published on the fork, the app finds no updates. Signing is a separate step: a local build isn't signed with upstream's Apple team, so Touch ID passkeys and other features tied to that team ID may not work. See `docs/operations/development.md` for build prerequisites, which include Node 26.13.1, pnpm 12.14, Vite+ (`vp`), and Rust.

## Fork features

| Feature | Status | Fork paths | Upstream seams |
| --- | --- | --- | --- |
| `tts`: ElevenLabs playback of assistant messages | Planned | `apps/web/src/fork/tts/`, `apps/server/src/fork/tts/` | To be listed as they're added |

## Offering features upstream

Upstream request [#3964](https://github.com/pingdotgg/t3code/issues/3964) asks for a per-message read-aloud action. If upstream accepts a version of `tts`, the fork can drop it. To open an upstream PR, branch from `upstream/main`, not `fork/main`, so no fork scaffolding comes along.
