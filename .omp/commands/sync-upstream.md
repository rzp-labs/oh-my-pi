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

### 2. Check divergence

```bash
git rev-list --count main..upstream/main    # behind (incoming)
git rev-list --count upstream/main..main    # ahead (local patches)
```

If behind=0, report "already up to date" and stop.
If `--dry-run` was passed, report the counts and stop.

### 3. Pre-rebase semantic analysis

**Do not start the rebase yet.** First analyse the incoming upstream commits
against every active feature in `packages/fork/FEATURES.md`.

Collect all incoming commits:

```bash
git log upstream/main...<old-upstream-tip> --oneline --no-merges
```

Filter out noise commits whose subject matches any of:
- `chore: bump version`
- `chore: regen`
- `chore: stale`
- `style:`

Dispatch a single `explore` sub-agent with the full list of substantive SHAs
(split into 2 agents only if the count exceeds ~30). The agent runs
`git show <sha>` for each commit and returns, for each FEATURES.md entry:

- **Absorbed**: upstream shipped equivalent behaviour — patch can be dropped.
- **Structurally invalidated**: upstream restructured files the patch touches —
  the patch needs rewriting before or during replay.
- **Semantically stale**: upstream changed an API, parameter, or prompt the
  patch references — guidance or logic needs updating.
- **Unaffected**: no overlap with incoming commits.

Also flag any incoming commits that touch files listed in FEATURES.md but do
not clearly map to an existing feature — these may represent new upstream
behaviour that conflicts with fork intent in ways not yet documented.

#### Pre-rebase recommendation

After the analysis, produce a structured report in this format:

```
## Pre-rebase analysis: <old-tip>..<new-tip>  (<N> incoming commits)

### Incoming changes summary
<grouped plain-English summary of substantive upstream changes by theme>

### Fork feature status
| Feature                  | Status              | Action required |
|--------------------------|---------------------|-----------------|
| mcp-exclusions           | Unaffected          | None            |
| hashline-edit-queue      | Structurally invalid| Rewrite against new edit/ layout |
| ...                      | ...                 | ...             |

### Patches recommended for drop
- <sha> <subject> — reason upstream absorbed it

### Patches requiring rewrite
- <sha> <subject> — what changed and what the rewrite must do

### Recommendation
<One paragraph: overall assessment of rebase complexity, which patches can
replay cleanly, which require work, and whether any fork features should be
retired or redesigned before rebasing.>
```

**Stop here and wait for approval.** Do not proceed to step 4 until the user
responds with the exact string `Proceed with rebasing`.

### 4. Stash, advance upstream, rebase

Stash any uncommitted changes:

```bash
git stash
```

Fetch and rebase onto the new upstream tip:

```bash
git fetch upstream
git rebase upstream/main
```

### 5. Resolve conflicts

If a patch conflicts, rebase pauses at that commit. For each conflict:
- Show the user the patch subject and files affected
- Show both sides of the conflict
- Recommend a resolution with rationale

**Ask the user to approve each resolution before applying it.**

**Reading conflict markers**

During a rebase, conflict markers always mean the same thing — no need to reason about `--ours`/`--theirs`:

```
<<<<<<< HEAD          ← upstream's version (current state being built onto)
||||||| parent of <sha>  ← base (what both sides started from)
=======
              ← fork's commit being replayed
>>>>>>> <sha>
```

When you want upstream's version of a file, look at the `HEAD` section. When you want the fork's version, look at the bottom section.

**Standing rules:**
- **NEVER modify upstream `CHANGELOG.md`** — the `HEAD` section is upstream's version; accept it entirely and carry fork-local changes in `packages/fork/CHANGELOG.md` instead.
- **Lock files (`bun.lock`)** — take either side and mark resolved; `bun install` in step 7 regenerates the lock unconditionally. Convention: `git checkout --theirs bun.lock` (consistent with past syncs).
- **For code conflicts**: apply the patch's intent onto upstream's new structure. The goal is to preserve what the patch was doing, not preserve its exact lines.
- **Check for later patches on the same file** before resolving. Run `git log REBASE_HEAD..ORIG_HEAD -- <file>` to see queued patches that also touch it. Resolve in a shape those patches can apply cleanly to — don't satisfy only the current patch.
- **If analysis flagged a patch for drop or rewrite**, act on that recommendation at replay time: skip no-op patches (`git rebase --skip`) and apply rewrites informed by the pre-rebase analysis.

After resolving each conflicted file: `git add <file>` then `git rebase --continue`.

If a patch becomes a no-op after resolution (upstream already incorporated the
same change), drop it: `git rebase --skip`.

### 6. Pop stash

If work was stashed in step 4:

```bash
git stash pop
```

### 7. Install and verify

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

### 8. Run tests for changed areas

Run tests that cover files touched by the incoming commits. At minimum:

```bash
bun test test/async-job-manager.test.ts    # if async/job-manager.ts changed
```

Do not run the full test suite unless asked.

### 9. Update packages/fork/CHANGELOG.md

Ensure all local patches are documented in `packages/fork/CHANGELOG.md`. Each
entry should include:
- The short SHA
- The conventional commit subject
- A brief description of what it changes

For any patch dropped during rebase (upstream absorbed it), remove its entry
from the changelog and note it as upstreamed.

Update FEATURES.md for any feature whose status changed: mark absorbed features
as `upstreamed`, update file paths for structurally rewritten patches, and
record any new intentional gaps discovered during conflict resolution.

### 10. Push

```bash
git push --force-with-lease origin main
```

`--force-with-lease` is required because rebase rewrites history. It fails safely
if the remote has commits you haven't seen — preventing accidental overwrites.

### 11. Summarise upstream changes

Produce a plain-English summary of the substantive upstream commits for the
user, grouped by theme (new providers, tool changes, bug fixes, LSP, etc.).
Base this on the analysis already done in step 3 — do not re-fetch diffs.
Omit anything with no user-visible impact.
