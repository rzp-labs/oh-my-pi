# Fork Changelog (rzp-labs/oh-my-pi)

Local patches applied on top of [can1357/oh-my-pi](https://github.com/can1357/oh-my-pi).
This file is gitignored to avoid merge conflicts with upstream CHANGELOG.md.

---

## Synced through upstream `13.9.2` (2026-03-05)

---

## Active Local Patches

### fix(setup-cli): guard resolvePythonRuntime throw on fresh machines (`dd09a2f7`)

On a machine with no managed env and no Python on PATH, `resolvePythonRuntime` throws before
`checkPythonSetup` can reach its early-return guard, crashing `omp setup python` instead of
returning a structured unavailable result. Wrapped in try-catch. Also made `python-runtime`
tests platform-aware (VENV_BIN/VENV_PYTHON constants).

### feat(tools): surface startup notice when Python tools unavailable (`0c2f32eb`)

Added `StartupNotice` interface; changed `createTools` return type to
`Promise<{ tools: Tool[]; notices: StartupNotice[] }>`. When Python tools are configured but
the preflight fails, a warn notice is pushed and surfaced in the TUI before interactive mode
starts. Wired through `CreateAgentSessionResult` and `main.ts` notification loop.

### fix(ipy): prefer managed venv in gateway and preflight checks (`b9a933e3`)

Root cause of WebSocket connection errors in `sync-upstream`: shared gateway was binding to
project-local `.venv` instead of `~/.omp/python-env`. Added `{ preferManaged }` option to
`resolvePythonRuntime`; gateway coordinator and `checkPythonKernelAvailability` now both pass
`{ preferManaged: true }`. Unified `checkPythonSetup` to use the same resolution order.
17 unit tests for `resolvePythonRuntime`.

### feat(coding-agent): instruct model to reuse MCP terminal windows (`2e0b8de9`)

System prompt addition: instructs the model to use `reuseExistingTerminalWindow: true` on
JetBrains terminal tool calls to avoid accumulating open tabs.

### fix(await): suppress/pre-acknowledge deliveries to prevent system-notice spam (`d6504499`, `6d40dd32`)

Two-part fix for stale system-notice spam when awaiting batch async tasks.
1. Pre-suppress watched job IDs via `acknowledgeDeliveries()` before blocking.
2. Replace `Promise.race` with `Promise.allSettled` so all jobs settle before returning.

### fix(extensions): load SSH hosts in extension control center (`f152c9d1`)

`loadAllExtensions()` never called `loadCapability("ssh")`. SSH Config tab appeared with
count=0 and was skipped. Added ssh-host kind to `ExtensionKind` + loading block +
display name mapping.

### fix(discovery): load all AGENTS.md files instead of collapsing to one (`cce0395b`)

Three bugs: (1) dedup key was `file.level` so all project-level files collapsed to one entry;
(2) agents-md provider only walked UP (ancestors), not down into subdirectories; (3) extension
dashboard used `${level}:${filename}` as ID, causing collisions. Fixed all three.

Resolution during 13.9.2 sync: upstream shipped monorepo-friendly discovery (8284bc88) touching
the same files. Synthesized: accepted upstream's depth-keyed dedup for ancestor stacking;
replaced downward walk with explicit `pinnedContextFiles` loading from `.omp/settings.json` (not in
upstream). Key function: `d < 0 ? path:${file.path} : project:${d}` (infrastructure preserved,
downward walk superseded by pinning).

### fix(task): batch async task delivery and bridge subprocess intent to TUI (`1b9fcf18`)

Fixed N completion notifications for N-task batches (now one batch summary). Fixed subprocess
intent fields (`lastIntent`, `currentTool`, etc.) not propagating to TUI in async path by adding
`bridgeUpdate` callback merging subprocess `AgentProgress` into `progressByTaskId`.

### fix(lsp): discover language servers from IDE-managed installations (`c7defbbd`)

`resolveCommand` only checked project-local bin dirs and `$PATH`. Binaries installed by
JetBrains LSP4IJ at `~/.lsp4ij/lsp/<server>/node_modules/.bin/` were never found, causing
`formatOnWrite` and `diagnosticsOnEdit` to silently no-op. Added `IDE_LSP_DIRS` lookup.

### fix(stats): jsonl error resilience, recent errors filter, error rate and performance window (`0f83a99a`, `a5427e16`, `5c4309b6`)

Three stability fixes to the stats package:
- `0f83a99a`: JSONL parsing errors in aggregator no longer crash the process
- `a5427e16`: recent errors filter now correctly excludes stale entries
- `5c4309b6`: error rate calculation and performance window metrics corrected

---

## Fork Infrastructure

### chore(fork): establish packages/fork with conventions, changelog, and sync docs (`94217b47`)

Established `packages/fork/` directory with `AGENTS.md`, `CHANGELOG.md` (gitignored),
`setup.sh`, and branching conventions. Added `/sync-upstream` command.

### chore: add approval gates to sync-upstream command (`d0166823`)

Step-by-step approval gates in the sync-upstream command; divergence report before rebase.

### fix(sync): rebase-based upstream sync workflow (`b8949996`, `666550c0`, `9265eb3c`)

Switched sync procedure from merge to rebase. Corrected install/build steps. Added missing
`git rebase` step to sync command.

### ci: disable push/PR triggers, keep tag + manual only (`f00018c4`)

Fork-specific CI configuration — push and PR triggers disabled to avoid publishing to the
upstream registry on every push.

### MCP configuration and context window limits (`f734dee4`, `a0402709`)

Fork-local MCP server configuration (exclusions for unused servers) and context window
safeguards in session messages.

### fix(test): update tests for createTools return shape (`3e1ae5f7`)

Updated test files to destructure `{ tools }` from `createTools()` after upstream changed
the return type from `Tool[]` to `{ tools: Tool[]; notices: StartupNotice[] }`.
Also fixed `ast-grep.test.ts` which was missed in the original patch.
