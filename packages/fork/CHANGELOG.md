# Fork Changelog (rzp-labs/oh-my-pi)

Local patches applied on top of [can1357/oh-my-pi](https://github.com/can1357/oh-my-pi).
This file is gitignored to avoid merge conflicts with upstream CHANGELOG.md.

---

## Synced through upstream `14.0.1` (`15fc3b153`) (2026-04-09)

---

## Active Local Patches

~~### hashline-edit-queue~~

**Dropped** — upstream's hashline mode now returns self-correcting anchor errors (showing updated `LINE#ID` refs inline) when anchors are stale. The queue's "prevent the error" approach is superseded. Feature removed from FEATURES.md. History preserved in git at the patches that implemented it.

~~### lsp-auto-detect-always (`a624d91e1`)~~
~~### lsp-ide-managed-discovery (`5f8d8d856`)~~
~~### ty-lsp-server (`c0f2fb21a`)~~

**Absorbed** — upstream v14.0.1 now ships unconditional auto-detection + IDE-managed LSP binary discovery + `ty` as a default server. All three patches dropped.


~~### fix(session): default thinkingLevel to "off" in buildSessionContext (`2dedc985`)~~

**Upstreamed** — absorbed by `b6a51462` (feat(ai): added incremental history for remote compact). Patch dropped during 13.9.7 rebase.


### fix(setup-cli): guard resolvePythonRuntime throw on fresh machines (`3b4e566d`)

On a machine with no managed env and no Python on PATH, `resolvePythonRuntime` throws before
`checkPythonSetup` can reach its early-return guard, crashing `omp setup python` instead of
returning a structured unavailable result. Wrapped in try-catch. Also made `python-runtime`
tests platform-aware (VENV_BIN/VENV_PYTHON constants).

### feat(tools): surface startup notice when Python tools unavailable (`15c393c7`)

Added `StartupNotice` interface; changed `createTools` return type to
`Promise<{ tools: Tool[]; notices: StartupNotice[] }>`. When Python tools are configured but
the preflight fails, a warn notice is pushed and surfaced in the TUI before interactive mode
starts. Wired through `CreateAgentSessionResult` and `main.ts` notification loop.

### fix(ipy): prefer managed venv in gateway and preflight checks (`a5346f14`)

Root cause of WebSocket connection errors in `sync-upstream`: shared gateway was binding to
project-local `.venv` instead of `~/.omp/python-env`. Added `{ preferManaged }` option to
`resolvePythonRuntime`; gateway coordinator and `checkPythonKernelAvailability` now both pass
`{ preferManaged: true }`. Unified `checkPythonSetup` to use the same resolution order.
17 unit tests for `resolvePythonRuntime`.

### feat(coding-agent): instruct model to reuse MCP terminal windows (`2a0d6809`)

System prompt addition: instructs the model to use `reuseExistingTerminalWindow: true` on
JetBrains terminal tool calls to avoid accumulating open tabs.

### fix(await): suppress/pre-acknowledge deliveries to prevent system-notice spam (`a1f1dc5b`, `18d2b088`)

Two-part fix for stale system-notice spam when awaiting batch async tasks.
1. Pre-suppress watched job IDs via `acknowledgeDeliveries()` before blocking.
2. Replace `Promise.race` with `Promise.allSettled` so all jobs settle before returning.

### fix(extensions): load SSH hosts in extension control center (`c30a9b5c`)

`loadAllExtensions()` never called `loadCapability("ssh")`. SSH Config tab appeared with
count=0 and was skipped. Added ssh-host kind to `ExtensionKind` + loading block +
display name mapping.

### fix(discovery): load all AGENTS.md files instead of collapsing to one (`e8acd301`)

Three bugs: (1) dedup key was `file.level` so all project-level files collapsed to one entry;
(2) agents-md provider only walked UP (ancestors), not down into subdirectories; (3) extension
dashboard used `${level}:${filename}` as ID, causing collisions. Fixed all three.

Resolution during 13.9.2 sync: upstream shipped monorepo-friendly discovery (8284bc88) touching
the same files. Synthesized: accepted upstream's depth-keyed dedup for ancestor stacking;
replaced downward walk with explicit `pinnedContextFiles` loading from `.omp/settings.json` (not in
upstream). Key function: `d < 0 ? path:${file.path} : project:${d}` (infrastructure preserved,
downward walk superseded by pinning).

### fix(task): batch async task delivery and bridge subprocess intent to TUI (`885c0170`)

Fixed N completion notifications for N-task batches (now one batch summary). Fixed subprocess
intent fields (`lastIntent`, `currentTool`, etc.) not propagating to TUI in async path by adding
`bridgeUpdate` callback merging subprocess `AgentProgress` into `progressByTaskId`.

### fix(lsp): discover language servers from IDE-managed installations (`3b7a15b3`)

`resolveCommand` only checked project-local bin dirs and `$PATH`. Binaries installed by
JetBrains LSP4IJ at `~/.lsp4ij/lsp/<server>/node_modules/.bin/` were never found, causing
`formatOnWrite` and `diagnosticsOnEdit` to silently no-op. Added `IDE_LSP_DIRS` lookup.

### fix(stats): jsonl error resilience, recent errors filter, error rate and performance window (`7a7e13f7`, `4e9e7947`, `a3f22823`)

Three stability fixes to the stats package:
- `7a7e13f7`: JSONL parsing errors in aggregator no longer crash the process
- `4e9e7947`: recent errors filter now correctly excludes stale entries
- `a3f22823`: error rate calculation and performance window metrics corrected

---

## Fork Infrastructure

### chore(fork): establish packages/fork with conventions, changelog, and sync docs (`390f4899`)

Established `packages/fork/` directory with `AGENTS.md`, `CHANGELOG.md` (gitignored),
`setup.sh`, and branching conventions. Added `/sync-upstream` command.

### chore: add approval gates to sync-upstream command (`180dc4a1`)

Step-by-step approval gates in the sync-upstream command; divergence report before rebase.

### fix(sync): rebase-based upstream sync workflow (`1366f83c`, `a4f6f886`, `afe42625`)

Switched sync procedure from merge to rebase. Corrected install/build steps. Added missing
`git rebase` step to sync command.

### ci: disable push/PR triggers, keep tag + manual only (`31eb824e`)

Fork-specific CI configuration — push and PR triggers disabled to avoid publishing to the
upstream registry on every push.

### MCP configuration and context window limits (`0b622068`, `c22b6ffb`)

Fork-local MCP server configuration (exclusions for unused servers) and context window
safeguards in session messages.

### fix(test): update tests for createTools return shape (`5a30cf2c`, `36b0cdc9`)

Updated test files to destructure `{ tools }` from `createTools()` after upstream changed
the return type from `Tool[]` to `{ tools: Tool[]; notices: StartupNotice[] }`.
During 13.9.7 sync: upstream AST tool refactor (`0433900c`) and lowercase normalization (`1acd2816`)
left three more bare `createTools()` calls in `ast-edit.test.ts`, `ast-grep.test.ts`, and
`index.test.ts`. Fixed all three during rebase.
