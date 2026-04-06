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

### 3. Stash, advance upstream, rebase

Stash any uncommitted changes:

```bash
git stash
```

Fetch and rebase onto the new upstream tip:

```bash
git fetch upstream
git rebase upstream/main
```

### 4. Resolve conflicts

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
- **Lock files (`bun.lock`)** — take either side and mark resolved; `bun install` in step 6 regenerates the lock unconditionally. Convention: `git checkout --theirs bun.lock` (consistent with past syncs).
- **For code conflicts**: apply the patch's intent onto upstream's new structure. The goal is to preserve what the patch was doing, not preserve its exact lines.
- **Check for later patches on the same file** before resolving. Run `git log REBASE_HEAD..ORIG_HEAD -- <file>` to see queued patches that also touch it. Resolve in a shape those patches can apply cleanly to — don't satisfy only the current patch.

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

### 7a. Review for semantic conflicts

A clean rebase and passing tests do not mean every fork feature is still coherent.
For each substantive incoming upstream commit, cross-check against `packages/fork/FEATURES.md`:

- **Functional duplication**: did upstream ship what a fork patch does? If so, drop the patch (`git rebase -i` to remove it from the stack) and mark it upstreamed in the CHANGELOG.
- **Interface assumption violated**: does a fork patch reference an API, parameter, or file that upstream restructured? Update the patch to the new structure.
- **Prompt/guidance staleness**: do any fork system-prompt patches reference tool parameters or behaviours that upstream changed? Update the guidance.
- **Intentional gaps**: if a fork feature was skipped (taken `--ours`) due to the upstream-first policy, record the gap explicitly in FEATURES.md under the feature's entry.

This step is especially important when incoming upstream commits touch files that appear in FEATURES.md.

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
git push --force-with-lease origin main
```

`--force-with-lease` is required because rebase rewrites history. It fails safely
if the remote has commits you haven't seen — preventing accidental overwrites.


### 10. Summarise upstream changes

After pushing, produce a plain-English summary of the substantive upstream commits
so the user understands what changed in their tool without having to read diffs.

**Filter first.** Exclude commits whose subject matches any of:
- `chore: bump version`
- `chore: regen`
- `chore: stale`
- `style:`
- `refactor:` (internal restructuring with no behaviour change)

For the remaining commits, collect their SHAs:

```bash
git log <old-upstream-tip>..<new-upstream-tip> --oneline --no-merges
```

Dispatch a single `explore` sub-agent with the full list of substantive SHAs.
Only split into 2 agents if the substantive commit count exceeds ~30.

The agent runs `git show <sha>` for each commit and returns a concise summary:
what changed, why it matters to the user, any action required (new env var,
config key, removed tool, etc.).

Roll up into a single grouped response by theme (new providers, tool changes,
bug fixes, LSP, etc.). Omit anything with no user-visible impact.

Do not pull raw diffs into the root agent context — that is what the sub-agent is for.