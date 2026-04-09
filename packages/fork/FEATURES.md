# Fork Feature Registry

Stable registry of fork-only behavior keyed by purpose, not commit SHA. Use this during upstream sync review to decide which patches stay fork-local, which may be upstreamed, and which need semantic re-validation.

## Table of contents

- [mcp-exclusions](#mcp-exclusions)
- [git-flow-publish-gate](#git-flow-publish-gate)
- [python-setup-guard](#python-setup-guard)
- [python-startup-notice](#python-startup-notice)
- [python-managed-venv](#python-managed-venv)
- [mcp-terminal-reuse](#mcp-terminal-reuse)
- [await-delivery-suppression](#await-delivery-suppression)
- [extensions-ssh-host-loading](#extensions-ssh-host-loading)
- [agents-md-discovery](#agents-md-discovery)
- [async-task-batch-delivery](#async-task-batch-delivery)
- [stats-resilience](#stats-resilience)
- [bash-interceptor-mode-aware](#bash-interceptor-mode-aware)

### mcp-exclusions

- **Status:** `active`
- **Purpose:** Disables Codacy and Netdata MCP servers in fork sessions so local agent runs do not load unused integrations.
- **Files:** `.omp/mcp.json`
- **Semantic conflicts:** Upstream adding the same MCP servers as defaults or changing MCP exclusion semantics would invalidate this patch.
- **Notes:** Fork-only policy; there is no upstream destination for this file.

### git-flow-publish-gate

- **Status:** `active`
- **Purpose:** Requires `git flow publish` before `git flow finish` so finish can fetch the topic branch cleanly and complete without leaving main half-updated.
- **Files:** `.omp/AGENTS.md`, `packages/fork/AGENTS.md`
- **Semantic conflicts:** Upstream changes to git-flow workflow documentation or finish semantics could duplicate or contradict this rule.
- **Notes:** Fork convention only; keep both AGENTS files aligned.

### python-setup-guard

- **Status:** `active`
- **Purpose:** Wraps Python runtime resolution during setup so `omp setup python` returns a structured unavailable result instead of crashing on fresh machines.
- **Files:** `packages/coding-agent/src/cli/setup-cli.ts`
- **Semantic conflicts:** Upstream refactors to setup flow or Python runtime error handling could obsolete this guard or move the correct fix point.
- **Notes:** Low conflict surface; verify setup still reports unavailability rather than throwing.

### python-startup-notice

- **Status:** `active`
- **Purpose:** Changes tool creation to return `{ tools, notices }` so Python unavailability can be surfaced once at startup instead of failing later at call time.
- **Files:** `packages/coding-agent/src/sdk.ts`, `packages/coding-agent/src/tools/index.ts`, `packages/coding-agent/src/main.ts`
- **Semantic conflicts:** Upstream changes to `createTools()` return shape, agent session wiring, or startup notification delivery would invalidate this integration.
- **Notes:** This return-type change affects every caller and test that touches `createTools()`.

### python-managed-venv

- **Status:** `active`
- **Purpose:** Prefers the managed `~/.omp/python-env` runtime for gateway and preflight checks so sync sessions do not bind to an unrelated project-local virtualenv.
- **Files:** `packages/coding-agent/src/ipy/runtime.ts`, `packages/coding-agent/src/ipy/gateway-coordinator.ts`, `packages/coding-agent/src/ipy/kernel.ts`, `packages/coding-agent/src/cli/setup-cli.ts`
- **Semantic conflicts:** Upstream changes to Python runtime resolution order, gateway startup, or kernel availability checks could reintroduce wrong-venv selection.
- **Notes:** This specifically protects sync-upstream workflows from project-local `.venv` leakage.

### mcp-terminal-reuse

- **Status:** `active`
- **Purpose:** Instructs the model to reuse JetBrains terminal windows when MCP tools support it so sessions do not accumulate redundant tabs.
- **Files:** `packages/coding-agent/src/prompts/system/system-prompt.md`
- **Semantic conflicts:** Upstream restructuring of the system prompt section or shipping the same instruction themselves could require relocating or removing this text.
- **Notes:** Check prompt placement on every sync because prompt files drift often.

### await-delivery-suppression

- **Status:** `active`
- **Purpose:** Pre-acknowledges watched job deliveries and waits for all async jobs to settle so batch await flows stop emitting stale system-notice spam.
- **Files:** `packages/coding-agent/src/tools/await-tool.ts`, `packages/coding-agent/src/async/job-manager.ts`
- **Semantic conflicts:** Upstream refactors to async job delivery, await-tool batching, or notification acknowledgement could duplicate or invalidate this suppression path.
- **Notes:** Core reliability fix; remove only if upstream fully absorbs both the pre-ack and settle-all behavior.

### extensions-ssh-host-loading

- **Status:** `active`
- **Purpose:** Loads SSH hosts into the extension control center so the SSH section reflects configured hosts instead of appearing empty.
- **Files:** `packages/coding-agent/src/modes/components/extensions/state-manager.ts`, `packages/coding-agent/src/modes/components/extensions/types.ts`
- **Semantic conflicts:** Upstream changes to extension kind registration, SSH capability loading, or extension dashboard grouping could conflict with this feature.
- **Notes:** This closes an upstream discovery gap rather than adding a fork-only concept.

### agents-md-discovery

- **Status:** `active`
- **Purpose:** Loads all relevant AGENTS.md files, including ancestor and pinned entries, and fixes dedup/display collisions so context discovery reflects the real instruction set.
- **Files:** `packages/coding-agent/src/discovery/agents-md.ts`, `packages/coding-agent/src/capability/context-file.ts`, `packages/coding-agent/src/modes/components/extensions/state-manager.ts`
- **Semantic conflicts:** Upstream changes to context-file discovery, AGENTS.md provider traversal, or extension ID/display generation could partially absorb or break this fix.
- **Notes:** This has been partially synthesized with upstream before; always inspect context-file and AGENTS discovery paths together.

### async-task-batch-delivery

- **Status:** `active`
- **Purpose:** Collapses N per-task completion notices into one batch result and bridges subprocess intent fields into the TUI so async task runs report coherent progress.
- **Files:** `packages/coding-agent/src/task/index.ts`, `packages/coding-agent/src/task/executor.ts`, `packages/coding-agent/src/task/render.ts`, `packages/coding-agent/src/task/types.ts`
- **Semantic conflicts:** Upstream changes to async task execution, progress aggregation, or completion notification rendering could duplicate or invalidate this behavior.
- **Notes:** UX-oriented reliability fix; upstream may absorb pieces of it independently.

### stats-resilience

- **Status:** `active`
- **Purpose:** Hardens stats ingestion and reporting so malformed JSONL, stale recent-error filtering, and incorrect rate/window calculations do not corrupt metrics.
- **Files:** `packages/stats/src/parser.ts`, `packages/stats/src/db.ts`, `packages/stats/src/aggregator.ts`
- **Semantic conflicts:** Upstream overhauls to stats storage, parsing, or aggregate metric computation could absorb parts of this bundle or split it apart.
- **Notes:** Three related fixes are intentionally tracked as one resilience feature.

### bash-interceptor-mode-aware

- **Status:** `active`
- **Purpose:** Makes Bash interceptor edit guidance honor the same edit-mode resolution as EditTool so users get consistent instructions for the active mode.
- **Files:** `packages/coding-agent/src/tools/bash.ts`, `packages/coding-agent/src/utils/edit-mode.ts`
- **Semantic conflicts:** Upstream moves of `resolveEditMode`, Bash tool restructuring, or changes to edit-mode priority could silently desynchronize the guidance.
- **Notes:** Re-check the import path whenever `tools/bash.ts` or `utils/edit-mode.ts` is reorganized.
