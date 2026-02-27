# Sync Upstream

Merge upstream changes from `can1357/oh-my-pi` into this fork, resolve conflicts, verify, and push.

## Arguments

- `$ARGUMENTS`: Optional flags. `--dry-run` to report divergence without merging.

## Steps

### 1. Setup upstream remote

Ensure the `upstream` remote exists. If not, add it:

```bash
git remote add upstream https://github.com/can1357/oh-my-pi.git
```

Fetch upstream main:

```bash
git fetch upstream main
```

### 2. Report divergence

Count commits ahead/behind:

```bash
git rev-list --count main..upstream/main    # behind
git rev-list --count upstream/main..main    # ahead (local patches)
```

Present a structured report to the user:

**Local patches (ahead of upstream):** List each with short SHA, subject line, and files touched.

**Upstream incoming (behind):** List all commits grouped by package/area (e.g., `packages/ai`, `packages/coding-agent`, `packages/tui`). For each group, show commit count and the subjects. Highlight any commits that touch the same files as local patches — these are conflict risks.

**Conflict risk assessment:** Run `git merge-tree $(git merge-base HEAD upstream/main) HEAD upstream/main` or a dry merge to identify files that will conflict. Report them explicitly.

**Stop here and ask the user for approval.** Present options:
- Proceed with full merge
- Cherry-pick specific commits only
- Abort (just wanted the report)

Do NOT continue to step 3 without explicit approval.

If `--dry-run` was passed, stop here regardless of response.

### 3. Stash and merge

Only after approval in step 2.

If there are uncommitted changes, stash them:

```bash
git stash
```

```bash
git merge upstream/main
```

### 4. Resolve conflicts

If there are conflicts, present each conflicted file to the user with:
- The file path
- Both sides of the conflict (ours vs theirs)
- A recommended resolution with rationale

**Ask the user to approve each resolution before applying it.** Do not batch-resolve without review.

Standing rules:
- **NEVER modify upstream CHANGELOG.md** — fork-local changes belong in `FORK_CHANGELOG.md` (gitignored). If the conflict is in a CHANGELOG, accept upstream's version entirely (`git checkout --theirs <file>`).
- For code conflicts: prefer upstream's structure when the local change can be cleanly reapplied on top.

After all conflicts are resolved and approved: `git add` the resolved files and `git merge --continue`.

### 5. Pop stash

If work was stashed in step 3, pop it:

```bash
git stash pop
```

If the stash pop has conflicts, resolve them. Our working changes should apply cleanly on top of the merged state since they target different code than upstream typically changes.

### 6. Install and verify

```bash
bun install
bun check:ts
```

If type errors or lint failures appear, fix them before proceeding.

### 7. Run tests for changed areas

Run tests that cover files touched by the merge. At minimum:

```bash
bun test test/async-job-manager.test.ts    # if async/job-manager.ts changed
```

Do not run the full test suite unless asked.

### 8. Update FORK_CHANGELOG.md

If there are local patches ahead of upstream (from step 2), ensure they are documented in `FORK_CHANGELOG.md` at the repo root. Each entry should include:

- The short SHA
- The conventional commit subject
- A brief description of what it changes

This file is gitignored and exists only for local traceability.

### 9. Push

```bash
git push --no-verify origin main
```

The `--no-verify` bypasses the LFS pre-push hook (git-lfs is not installed in this environment).

### 10. Suggest upstreaming

After syncing, review the local patches (ahead commits). For each one, assess whether it should be submitted as a PR to `can1357/oh-my-pi`. Patches that fix genuine bugs (not fork-specific customizations) should be upstreamed to eliminate divergence. Report your assessment.
