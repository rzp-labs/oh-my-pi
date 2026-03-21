# Fork Changelog (rzp-labs/oh-my-pi)

Local patches applied on top of [can1357/oh-my-pi](https://github.com/can1357/oh-my-pi).
This file is gitignored to avoid merge conflicts with upstream CHANGELOG.md.

---

## Synced through upstream `b55dc0d1` — 29 commits (2026-03-23)

---

## Active Local Patches

### chore: disable Codacy/Netdata in MCP config (`c4f0919b`)

`.omp/mcp.json` — added exclusions for Codacy and Netdata MCP servers so they
are not loaded in fork sessions.

### chore: require git flow publish before finish (`dc69c157`)

`git flow finish` fetches the topic branch from origin before merging. Skipping
publish causes the fetch to fail, leaving changes uncommitted on main. Updated
both `AGENTS.md` files to mark publish as required, not optional.

### fix(update-check): compare semver instead of string equality (`f1adf7de`)

Update prompt fired on any version mismatch including running ahead of npm
(e.g. source at 13.13.2 while npm has 13.13.0). Added `isNewerVersion()` for
proper MAJOR.MINOR.PATCH tuple comparison — prompt only fires when npm is genuinely newer.

### fix(lsp): always auto-detect servers; apply overrides on top (`38d5bdae`)

Always auto-detect servers regardless of whether config overrides are present.
Overrides are applied on top — `disabled:true` suppresses a server, other fields refine it.
Previously the two paths (no-override vs override) diverged; now unified into one always-auto-detect flow.
Subsumes upstream `733e1623` (root marker check in override path) — conflict resolved during 13.11.1 rebase.

### feat(lsp): add ty language server to defaults (`6334e9e2`)

Added `ty` to `defaults.json` so auto-detect can discover it. Entry specifies
`ty server` as the LSP command, file types `.py`/`.pyi`, and root markers
`pyproject.toml`/`ty.toml`. Projects using `ty` and not pyright will now get
the correct language server without needing a config override.

~~### fix(session): default thinkingLevel to "off" in buildSessionContext (`2dedc985`)~~

**Upstreamed** — absorbed by `b6a51462` (feat(ai): added incremental history for remote compact). Patch dropped during 13.9.7 rebase.


### fix(setup-cli): guard resolvePythonRuntime throw on fresh machines (`c05f89b8`)

On a machine with no managed env and no Python on PATH, `resolvePythonRuntime` throws before
`checkPythonSetup` can reach its early-return guard, crashing `omp setup python` instead of
returning a structured unavailable result. Wrapped in try-catch. Also made `python-runtime`
tests platform-aware (VENV_BIN/VENV_PYTHON constants).

### feat(tools): surface startup notice when Python tools unavailable (`871e1c78`)

Added `StartupNotice` interface; changed `createTools` return type to
`Promise<{ tools: Tool[]; notices: StartupNotice[] }>`. When Python tools are configured but
the preflight fails, a warn notice is pushed and surfaced in the TUI before interactive mode
starts. Wired through `CreateAgentSessionResult` and `main.ts` notification loop.

### fix(ipy): prefer managed venv in gateway and preflight checks (`ecbdbeef`)

Root cause of WebSocket connection errors in `sync-upstream`: shared gateway was binding to
project-local `.venv` instead of `~/.omp/python-env`. Added `{ preferManaged }` option to
`resolvePythonRuntime`; gateway coordinator and `checkPythonKernelAvailability` now both pass
`{ preferManaged: true }`. Unified `checkPythonSetup` to use the same resolution order.
17 unit tests for `resolvePythonRuntime`.

### feat(coding-agent): instruct model to reuse MCP terminal windows (`d3d6ebdf`)

System prompt addition: instructs the model to use `reuseExistingTerminalWindow: true` on
JetBrains terminal tool calls to avoid accumulating open tabs.

### fix(await): suppress/pre-acknowledge deliveries to prevent system-notice spam (`a67c4318`, `370412b9`)

Two-part fix for stale system-notice spam when awaiting batch async tasks.
1. Pre-suppress watched job IDs via `acknowledgeDeliveries()` before blocking.
2. Replace `Promise.race` with `Promise.allSettled` so all jobs settle before returning.

### fix(extensions): load SSH hosts in extension control center (`289e6a75`)

`loadAllExtensions()` never called `loadCapability("ssh")`. SSH Config tab appeared with
count=0 and was skipped. Added ssh-host kind to `ExtensionKind` + loading block +
display name mapping.

### fix(discovery): load all AGENTS.md files instead of collapsing to one (`91ca9966`)

Three bugs: (1) dedup key was `file.level` so all project-level files collapsed to one entry;
(2) agents-md provider only walked UP (ancestors), not down into subdirectories; (3) extension
dashboard used `${level}:${filename}` as ID, causing collisions. Fixed all three.

Resolution during 13.9.2 sync: upstream shipped monorepo-friendly discovery (8284bc88) touching
the same files. Synthesized: accepted upstream's depth-keyed dedup for ancestor stacking;
replaced downward walk with explicit `pinnedContextFiles` loading from `.omp/settings.json` (not in
upstream). Key function: `d < 0 ? path:${file.path} : project:${d}` (infrastructure preserved,
downward walk superseded by pinning).

Resolution during 184b2415 sync: upstream shipped `context-file.ts` with equivalent depth-keyed
dedup (`Math.max(0, depth)`) plus a new `toExtensionId` field. `d < 0` branch is dead (no
downward walk produces negative-depth files). Accepted upstream's `context-file.ts` entirely.
`state-manager.ts` import conflict resolved by keeping `getProjectDir` (required by
`contextFileDisplayName`); upstream had independently added it too.

### fix(task): batch async task delivery and bridge subprocess intent to TUI (`d890cc24`)

Fixed N completion notifications for N-task batches (now one batch summary). Fixed subprocess
intent fields (`lastIntent`, `currentTool`, etc.) not propagating to TUI in async path by adding
`bridgeUpdate` callback merging subprocess `AgentProgress` into `progressByTaskId`.

### fix(lsp): discover language servers from IDE-managed installations (`d822b530`)

`resolveCommand` only checked project-local bin dirs and `$PATH`. Binaries installed by
JetBrains LSP4IJ at `~/.lsp4ij/lsp/<server>/node_modules/.bin/` were never found, causing
`formatOnWrite` and `diagnosticsOnEdit` to silently no-op. Added `IDE_LSP_DIRS` lookup.

### fix(stats): jsonl error resilience, recent errors filter, error rate and performance window (`e610b7e4`, `5e721922`, `9fc077d7`)

Three stability fixes to the stats package:
- `7a7e13f7`: JSONL parsing errors in aggregator no longer crash the process
- `4e9e7947`: recent errors filter now correctly excludes stale entries
- `a3f22823`: error rate calculation and performance window metrics corrected

---

## Fork Infrastructure

### chore(fork): establish packages/fork with conventions, changelog, and sync docs (`a7467ad0`)

Established `packages/fork/` directory with `AGENTS.md`, `CHANGELOG.md` (gitignored),
`setup.sh`, and branching conventions. Added `/sync-upstream` command.

### chore: add approval gates to sync-upstream command (`0aa11085`)

Step-by-step approval gates in the sync-upstream command; divergence report before rebase.

### fix(sync): rebase-based upstream sync workflow (`ead409de`, `8f1bf343`, `29ae4d4f`)

Switched sync procedure from merge to rebase. Corrected install/build steps. Added missing
`git rebase` step to sync command.

### ci: disable push/PR triggers, keep tag + manual only (`04d20aae`)

Fork-specific CI configuration — push and PR triggers disabled to avoid publishing to the
upstream registry on every push.

### MCP configuration and context window limits (`8300de12`, `0e777423`)

Fork-local MCP server configuration (exclusions for unused servers) and context window
safeguards in session messages.

### fix(test): update tests for createTools return shape (`209869ae`, `340ce013`, `dc064094`, `d7fa060c`)

Updated test files to destructure `{ tools }` from `createTools()` after upstream changed
	the return type from `Tool[]` to `{ tools: Tool[]; notices: StartupNotice[] }`.
During 13.9.15 sync: two new upstream tests (`inspect_image` include/exclude) in `index.test.ts`
also used the old bare array API. Fixed during rebase (amended into tip commit).
During 13.10.1+20 sync: upstream `09c16f22` added `search-path-lists.test.ts` with the same
old bare-array assumption. Fixed `d7fa060c` in post-rebase cleanup.
During 13.13.2 sync: upstream added `search_tool_bm25` tests in `index.test.ts` and three
quoted-path tests in `search-path-lists.test.ts` — all using the old bare API. Fixed `16997a81`.