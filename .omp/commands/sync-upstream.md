# Sync Upstream

Rebase local patches onto the latest `can1357/oh-my-pi` upstream.

## Branch model

```
upstream:  A - B - C - D - E - F - G   (tracks can1357/oh-my-pi exactly)
                                    \
main:                                [patch 1] - [patch 2] - [patch 3]
```

`main` always contains our patches stacked on top of `upstream/main`. Syncing
fetches the latest upstream, then rebases `main` onto the new tip. Patches
replay one at a time; conflicts surface per-patch, not as a tangled merge.

## Arguments

- `$ARGUMENTS`: Optional flags. `--dry-run` to report divergence without rebasing.

## Steps

### 1. Setup upstream remote

Ensure the `upstream` remote exists:

```bash
git remote add upstream https://github.com/can1357/oh-my-pi.git
```

Fetch latest:

```bash
git fetch upstream main
```

### 2. Report divergence

Count commits ahead/behind:

```bash
git rev-list --count main..upstream/main    # behind (incoming upstream)
git rev-list --count upstream/main..main    # ahead (our local patches)
```

Present a structured report:

**Local patches (ahead of upstream):** List each with short SHA, subject line,
and files touched. These are the commits that will be replayed during rebase.

**Upstream incoming (behind):** List commits grouped by package/area. Highlight
any that touch the same files as local patches — these are conflict risks.

**Conflict risk assessment:** For each local patch that touches the same file as
an incoming upstream commit, flag it. These patches will likely need manual
resolution during the rebase.

**Stop here and ask the user for approval.** Present options:
- Proceed with full rebase
- Abort (just wanted the report)

Do NOT continue to step 3 without explicit approval.

If `--dry-run` was passed, stop here regardless of response.

### 3. Stash, advance upstream, rebase

Stash any uncommitted changes:

```bash
git stash
```

Fetch latest upstream commits:

```bash
git fetch upstream
```

### 4. Resolve conflicts

If a patch conflicts, rebase pauses at that commit. For each conflict:

- Show the user the patch subject and files affected
- Show both sides of the conflict
- Recommend a resolution with rationale

**Ask the user to approve each resolution before applying it.**

Standing rules:
- **NEVER modify upstream CHANGELOG.md** — accept upstream's version entirely
  (`git checkout --theirs <file>`) and carry fork-local changes in
  `packages/fork/CHANGELOG.md` instead.
- For code conflicts: apply the patch's intent onto upstream's new structure.
  The goal is to preserve what the patch was doing, not preserve its exact lines.

After resolving each conflicted file: `git add <file>` then `git rebase --continue`.

If a patch becomes a no-op after resolution (upstream already incorporated the
same change), drop it: `git rebase --skip`.

### 5. Pop stash

If work was stashed in step 3:

```bash
git stash pop
```

### 6. Install and verify

```bash
bun install:dev
bun build:native
bun check:ts
```

If `crates/` or `Cargo.lock` changed in the incoming commits, the native addon
must be rebuilt before tests run — a stale binary will fail at runtime with a
confusing "missing export" error. `bun build:native` is fast when nothing changed
(Cargo skips in ~1s), so run it unconditionally.

Fix any type errors or lint failures before proceeding.

### 7. Run tests for changed areas

Run tests that cover files touched by the incoming commits. At minimum:

```bash
bun test test/async-job-manager.test.ts    # if async/job-manager.ts changed
```

Do not run the full test suite unless asked.

### 8. Update packages/fork/CHANGELOG.md

Ensure all local patches are documented in `packages/fork/CHANGELOG.md`. Each
entry should include:

- The short SHA
- The conventional commit subject
- A brief description of what it changes

If any patch was dropped during rebase (upstream absorbed it), remove its entry
from the changelog and note it as upstreamed.

### 9. Push

```bash
git push --force-with-lease --no-verify origin main
```

`--force-with-lease` is required because rebase rewrites history. It fails safely
if the remote has commits you haven't seen — preventing accidental overwrites.

`--no-verify` bypasses the LFS pre-push hook (git-lfs is not installed here).

### 10. Suggest upstreaming

After syncing, review the local patches. For each one, assess whether it should
be submitted as a PR to `can1357/oh-my-pi`. Patches that fix genuine bugs (not
fork-specific customizations) should be upstreamed to eliminate divergence.
Report your assessment.
