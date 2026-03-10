# Fork Changelog (rzp-labs/oh-my-pi)

Local patches applied on top of [can1357/oh-my-pi](https://github.com/can1357/oh-my-pi).
This file is gitignored to avoid merge conflicts with upstream CHANGELOG.md.

---

## Synced through upstream `13.9.15` (`2528f857`) (2026-03-09)

---

## Active Local Patches

### feat(lsp): add ty language server to defaults (`eea46ae7`)

Added `ty` to `defaults.json` so auto-detect can discover it. Entry specifies
`ty server` as the LSP command, file types `.py`/`.pyi`, and root markers
`pyproject.toml`/`ty.toml`. Projects using `ty` and not pyright will now get
the correct language server without needing a config override.


~~### fix(session): default thinkingLevel to "off" in buildSessionContext (`2dedc985`)~~

**Upstreamed** — absorbed by `b6a51462` (feat(ai): added incremental history for remote compact). Patch dropped during 13.9.7 rebase.


### fix(setup-cli): guard resolvePythonRuntime throw on fresh machines (`f6eee3f4`)

On a machine with no managed env and no Python on PATH, `resolvePythonRuntime` throws before
`checkPythonSetup` can reach its early-return guard, crashing `omp setup python` instead of
returning a structured unavailable result. Wrapped in try-catch. Also made `python-runtime`
tests platform-aware (VENV_BIN/VENV_PYTHON constants).

### feat(tools): surface startup notice when Python tools unavailable (`612e6a55`)

Added `StartupNotice` interface; changed `createTools` return type to
`Promise<{ tools: Tool[]; notices: StartupNotice[] }>`. When Python tools are configured but
the preflight fails, a warn notice is pushed and surfaced in the TUI before interactive mode
starts. Wired through `CreateAgentSessionResult` and `main.ts` notification loop.

### fix(ipy): prefer managed venv in gateway and preflight checks (`f875215b`)

Root cause of WebSocket connection errors in `sync-upstream`: shared gateway was binding to
project-local `.venv` instead of `~/.omp/python-env`. Added `{ preferManaged }` option to
`resolvePythonRuntime`; gateway coordinator and `checkPythonKernelAvailability` now both pass
`{ preferManaged: true }`. Unified `checkPythonSetup` to use the same resolution order.
17 unit tests for `resolvePythonRuntime`.

### feat(coding-agent): instruct model to reuse MCP terminal windows (`a62a7213`)

System prompt addition: instructs the model to use `reuseExistingTerminalWindow: true` on
JetBrains terminal tool calls to avoid accumulating open tabs.

### fix(await): suppress/pre-acknowledge deliveries to prevent system-notice spam (`a62a7213`, `756ddd8b`)

Two-part fix for stale system-notice spam when awaiting batch async tasks.
1. Pre-suppress watched job IDs via `acknowledgeDeliveries()` before blocking.
2. Replace `Promise.race` with `Promise.allSettled` so all jobs settle before returning.

### fix(extensions): load SSH hosts in extension control center (`d376358f`)

`loadAllExtensions()` never called `loadCapability("ssh")`. SSH Config tab appeared with
count=0 and was skipped. Added ssh-host kind to `ExtensionKind` + loading block +
display name mapping.

### fix(discovery): load all AGENTS.md files instead of collapsing to one (`1e4f5a67`)

Three bugs: (1) dedup key was `file.level` so all project-level files collapsed to one entry;
(2) agents-md provider only walked UP (ancestors), not down into subdirectories; (3) extension
dashboard used `${level}:${filename}` as ID, causing collisions. Fixed all three.

Resolution during 13.9.2 sync: upstream shipped monorepo-friendly discovery (8284bc88) touching
the same files. Synthesized: accepted upstream's depth-keyed dedup for ancestor stacking;
replaced downward walk with explicit `pinnedContextFiles` loading from `.omp/settings.json` (not in
upstream). Key function: `d < 0 ? path:${file.path} : project:${d}` (infrastructure preserved,
downward walk superseded by pinning).

### fix(task): batch async task delivery and bridge subprocess intent to TUI (`e78c359f`)

Fixed N completion notifications for N-task batches (now one batch summary). Fixed subprocess
intent fields (`lastIntent`, `currentTool`, etc.) not propagating to TUI in async path by adding
`bridgeUpdate` callback merging subprocess `AgentProgress` into `progressByTaskId`.

### fix(lsp): discover language servers from IDE-managed installations (`ab9b8230`)

`resolveCommand` only checked project-local bin dirs and `$PATH`. Binaries installed by
JetBrains LSP4IJ at `~/.lsp4ij/lsp/<server>/node_modules/.bin/` were never found, causing
`formatOnWrite` and `diagnosticsOnEdit` to silently no-op. Added `IDE_LSP_DIRS` lookup.

### fix(stats): jsonl error resilience, recent errors filter, error rate and performance window (`eeb400a5`, `ed109778`, `b0c48c4b`)

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

### fix(test): update tests for createTools return shape (`712b5645`, `4fa70525`, `eea46ae7`)

Updated test files to destructure `{ tools }` from `createTools()` after upstream changed
	the return type from `Tool[]` to `{ tools: Tool[]; notices: StartupNotice[] }`.
During 13.9.15 sync: two new upstream tests (`inspect_image` include/exclude) in `index.test.ts`
also used the old bare array API. Fixed during rebase (amended into tip commit).