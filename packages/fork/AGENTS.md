# Fork-Local Conventions (rzp-labs/oh-my-pi)

This directory contains fork-specific configuration and documentation that
must not be upstreamed. It is invisible to upstream merges — upstream has no
`packages/fork/` directory, so syncing never touches these files.

## Branching

Branch protection on `main` is enabled — direct pushes are blocked, force-push
is allowed for admins only (required for upstream sync rebases).

### Branch model

```
upstream:  A - B - C - D - E   (tracks can1357/oh-my-pi exactly)
                            \
main:                        [patch 1] - [patch 2] - [patch 3]
```

`main` always contains our patches stacked on top of `upstream`. Patches are
regular commits. When upstream advances, we rebase `main` onto the new tip —
patches replay one at a time, conflicts surface per-patch.

### Feature work

For new fork-local features: work on `feature/<name>`, fix on `fix/<name>`.
Push to `origin/feature/<name>`, open a PR targeting `main`, squash-merge when
approved. The squashed commit becomes a new patch in the stack and will replay
cleanly on future rebases. This is a regular fast-forward push — no force needed.

### What 'sync' means

1. Advance `upstream` branch: `git fetch upstream && git merge --ff-only upstream/main`
2. Rebase patches: `git rebase upstream main`
3. Force-push (required after rebase, admin only): `git push --force-with-lease origin main`

See `.omp/commands/sync-upstream.md` for the full procedure.

## Dev Environment

`bun install:dev` runs `bun link` for `coding-agent` and `ai` packages, which
symlinks `~/.bun/bin/omp` to local source (`src/cli.ts`). The `omp-dev` alias
in `~/.zshrc` does the same thing manually and is only needed to switch back
after `omp-release` has overwritten the link.

## Fork Changelog

`packages/fork/CHANGELOG.md` tracks all active local patches with SHAs and
descriptions. Update it after each sync. If a patch gets absorbed by upstream
during a rebase (upstream shipped the same fix), remove its entry and note it
as upstreamed.