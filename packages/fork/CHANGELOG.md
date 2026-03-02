# Fork Changelog (rzp-labs/oh-my-pi)

Local patches applied on top of [can1357/oh-my-pi](https://github.com/can1357/oh-my-pi).
This file is gitignored to avoid merge conflicts with upstream CHANGELOG.md.

---

## Synced through upstream `13.5.6` (2026-03-01)

---

## Active Local Patches

### fix(setup-cli): guard resolvePythonRuntime throw on fresh machines (`28381e010`)

On a machine with no managed env and no Python on PATH, `resolvePythonRuntime` throws before
`checkPythonSetup` can reach its early-return guard, crashing `omp setup python` instead of
returning a structured unavailable result. Wrapped in try-catch. Also made `python-runtime`
tests platform-aware (VENV_BIN/VENV_PYTHON constants).

### feat(tools): surface startup notice when Python tools unavailable (`b3c83c59f`)

Added `StartupNotice` interface; changed `createTools` return type to
`Promise<{ tools: Tool[]; notices: StartupNotice[] }>`. When Python tools are configured but
the preflight fails, a warn notice is pushed and surfaced in the TUI before interactive mode
starts. Wired through `CreateAgentSessionResult` and `main.ts` notification loop.

### fix(ipy): prefer managed venv in gateway and preflight checks (`732be922d`)

Root cause of WebSocket connection errors in `sync-upstream`: shared gateway was binding to
project-local `.venv` instead of `~/.omp/python-env`. Added `{ preferManaged }` option to
`resolvePythonRuntime`; gateway coordinator and `checkPythonKernelAvailability` now both pass
`{ preferManaged: true }`. Unified `checkPythonSetup` to use the same resolution order.
17 unit tests for `resolvePythonRuntime`.

### feat(coding-agent): instruct model to reuse MCP terminal windows (`cae576aa8`)

System prompt addition: instructs the model to use `reuseExistingTerminalWindow: true` on
JetBrains terminal tool calls to avoid accumulating open tabs.

### fix(await): suppress/pre-acknowledge deliveries to prevent system-notice spam (`10b67b843`, `9df63de81`)

Two-part fix for stale system-notice spam when awaiting batch async tasks.
1. Pre-suppress watched job IDs via `acknowledgeDeliveries()` before blocking.
2. Replace `Promise.race` with `Promise.allSettled` so all jobs settle before returning.

### fix(extensions): load SSH hosts in extension control center (`c41b6a617`)

`loadAllExtensions()` never called `loadCapability("ssh")`. SSH Config tab appeared with
count=0 and was skipped. Added ssh-host kind to `ExtensionKind` + loading block +
display name mapping.

### fix(discovery): load all AGENTS.md files instead of collapsing to one (`0dc568ab5`)

Three bugs: (1) dedup key was `file.level` so all project-level files collapsed to one entry;
(2) agents-md provider only walked UP (ancestors), not down into subdirectories; (3) extension
dashboard used `${level}:${filename}` as ID, causing collisions. Fixed all three.

### fix(task): batch async task delivery and bridge subprocess intent to TUI (`08d3fb835`)

Fixed N completion notifications for N-task batches (now one batch summary). Fixed subprocess
intent fields (`lastIntent`, `currentTool`, etc.) not propagating to TUI in async path by adding
`bridgeUpdate` callback merging subprocess `AgentProgress` into `progressByTaskId`.

### fix(lsp): discover language servers from IDE-managed installations (`bef1a52eb`)

`resolveCommand` only checked project-local bin dirs and `$PATH`. Binaries installed by
JetBrains LSP4IJ at `~/.lsp4ij/lsp/<server>/node_modules/.bin/` were never found, causing
`formatOnWrite` and `diagnosticsOnEdit` to silently no-op. Added `IDE_LSP_DIRS` lookup.

---

## Fork Infrastructure

### chore: add fork sync infrastructure (`6dc840b41`)

Added `FORK_CHANGELOG.md` (gitignored), removed fork-local entry from upstream `CHANGELOG.md`,
added `/sync-upstream` command with conflict resolution heuristics.

### chore: add approval gates to sync-upstream command (`f7cdc1bcb`)

Added step-by-step approval gates to the sync-upstream command.

### ci: disable push/PR triggers, keep tag + manual only (`1e8cb2791`)

Fork-specific CI configuration — push and PR triggers disabled to avoid publishing to the
upstream registry on every push. Only tag and manual workflow_dispatch triggers remain.

### MCP configuration and context window limits (`9272dc191`, `d95343cfd`)

Fork-local MCP server configuration and context window safeguards.
