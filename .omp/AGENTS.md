# Fork-Local Conventions (rzp-labs/oh-my-pi)

This directory contains fork-specific configuration and documentation that
must not be upstreamed. It is invisible to upstream merges — upstream has no
`.omp/` directory, so rebasing never produces conflicts in these files.

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

### Feature and fix work

Always use git-flow commands — they enforce squash-merge onto `main` and rebase
when updating from `main`, keeping the patch stack linear.

```bash
# Start
git flow feature start <name>   # new feature
git flow fix start <name>        # bug fix

# During work — keep branch current with main
git flow update                  # rebases branch from main

# When done
git flow publish                 # push branch to origin
git flow finish                  # squash-merges into main, deletes branch
```

After `finish`, push main:

```bash
git push origin main
```

The squashed commit becomes a new patch in the stack and will replay cleanly
on future upstream rebases. This is a regular fast-forward push — no force needed.

### What 'sync' means

1. Fetch upstream: `git fetch upstream`
2. Rebase patches: `git rebase upstream/main main`
3. Force-push (required after rebase, admin only): `git push --force-with-lease origin main`

See `.omp/commands/sync-upstream.md` for the full procedure.

## New Machine Setup

After cloning, run the setup script from the repo root:

```bash
packages/fork/setup.sh
```

This adds the `upstream` remote, fetches it, and configures git-flow-next
(requires `brew install gittower/tap/git-flow-next`). No local `upstream`
branch is created — `upstream/main` (the remote tracking ref) is used directly.

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
