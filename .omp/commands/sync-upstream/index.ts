/**
 * /sync-upstream command
 *
 * Prepares the agent to sync the fork with upstream by gathering all data
 * upfront and injecting a fully-structured task prompt that:
 *   1. Classifies each incoming commit into a subsystem using conventional
 *      commit scope (primary) or majority file-path prefix (fallback)
 *   2. Emits one pre-assigned explore task per subsystem so agent count and
 *      SHA lists are determined deterministically before the LLM runs
 *   3. Requires a written recommendation and hard approval gate before rebase
 *
 * No LLM judgment is involved in deciding how many agents to spawn or which
 * commits belong to which subsystem.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type { CustomCommand, CustomCommandAPI } from "../../extensibility/custom-commands/types";
import type { HookCommandContext } from "../../extensibility/hooks/types";

// ---------------------------------------------------------------------------
// Subsystem registry
//
// Each subsystem maps to:
//   - scopes:         conventional commit scope strings (e.g. "lsp", "edit")
//   - pathPrefixes:   file path prefixes used as fallback when scope is absent
//   - featureAnchors: FEATURES.md anchor IDs that overlap with this subsystem
//
// Order matters: the first matching scope/prefix wins. Put more specific
// entries before broader catch-alls (e.g. "ipy/" before "tools/").
// ---------------------------------------------------------------------------

interface Subsystem {
	id: string;
	label: string;
	scopes: string[];
	pathPrefixes: string[];
	featureAnchors: string[];
}

const SUBSYSTEMS: readonly Subsystem[] = [
	{
		id: "edit-tool",
		label: "Edit tool",
		scopes: ["edit", "patch", "hashline", "chunk"],
		pathPrefixes: [
			"packages/coding-agent/src/edit/",
			"packages/coding-agent/src/patch/",
			"crates/pi-natives/src/chunk/",
		],
		featureAnchors: ["hashline-edit-queue", "bash-interceptor-mode-aware"],
	},
	{
		id: "lsp",
		label: "LSP",
		scopes: ["lsp"],
		pathPrefixes: ["packages/coding-agent/src/lsp/"],
		featureAnchors: ["lsp-auto-detect-always", "lsp-ide-managed-discovery", "ty-lsp-server"],
	},
	{
		id: "python",
		label: "Python / IPython",
		scopes: ["ipy", "python"],
		pathPrefixes: ["packages/coding-agent/src/ipy/", "packages/coding-agent/src/cli/setup-cli.ts"],
		featureAnchors: ["python-setup-guard", "python-startup-notice", "python-managed-venv"],
	},
	{
		id: "mcp",
		label: "MCP",
		scopes: ["mcp"],
		pathPrefixes: ["packages/coding-agent/src/mcp/"],
		featureAnchors: ["mcp-exclusions", "mcp-terminal-reuse"],
	},
	{
		id: "async",
		label: "Async / job manager",
		// "async" and "await" often co-occur in the same feature area
		scopes: ["async", "await", "job"],
		pathPrefixes: [
			"packages/coding-agent/src/async/",
			"packages/coding-agent/src/tools/await-tool.ts",
		],
		featureAnchors: ["await-delivery-suppression", "async-task-batch-delivery"],
	},
	{
		id: "task",
		label: "Task execution",
		scopes: ["task"],
		pathPrefixes: ["packages/coding-agent/src/task/"],
		featureAnchors: ["async-task-batch-delivery"],
	},
	{
		id: "discovery",
		label: "Discovery",
		scopes: ["discovery"],
		pathPrefixes: [
			"packages/coding-agent/src/discovery/",
			"packages/coding-agent/src/capability/",
		],
		featureAnchors: ["agents-md-discovery"],
	},
	{
		id: "ui",
		label: "UI / modes / extensions",
		scopes: ["modes", "tui", "ui", "extensions"],
		pathPrefixes: [
			"packages/coding-agent/src/modes/",
			"packages/tui/",
		],
		featureAnchors: ["extensions-ssh-host-loading"],
	},
	{
		id: "tools",
		label: "Tools (general)",
		scopes: ["tools", "tool"],
		pathPrefixes: ["packages/coding-agent/src/tools/"],
		// bash.ts is covered by bash-interceptor-mode-aware; index.ts by python-startup-notice
		featureAnchors: ["python-startup-notice", "bash-interceptor-mode-aware"],
	},
	{
		id: "sdk",
		label: "SDK / session",
		scopes: ["sdk", "session", "coding-agent"],
		pathPrefixes: [
			"packages/coding-agent/src/sdk.ts",
			"packages/coding-agent/src/session/",
		],
		featureAnchors: ["python-startup-notice"],
	},
	{
		id: "stats",
		label: "Stats",
		scopes: ["stats"],
		pathPrefixes: ["packages/stats/"],
		featureAnchors: ["stats-resilience"],
	},
	{
		id: "native",
		label: "Native / Rust",
		scopes: ["native", "crates", "rs"],
		pathPrefixes: ["crates/"],
		featureAnchors: [],
	},
	{
		id: "ai",
		label: "AI / models",
		scopes: ["ai", "models", "model", "providers"],
		pathPrefixes: ["packages/ai/"],
		featureAnchors: [],
	},
	// Catch-all — always last
	{
		id: "other",
		label: "Cross-cutting / other",
		scopes: [],
		pathPrefixes: [],
		featureAnchors: [],
	},
] as const;

// ---------------------------------------------------------------------------
// Noise filter
// ---------------------------------------------------------------------------

const NOISE_PREFIXES = ["chore: bump version", "chore: regen", "chore: stale", "style:", "refactor:"];

function isNoise(subject: string): boolean {
	return NOISE_PREFIXES.some(p => subject.startsWith(p));
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

async function git(api: CustomCommandAPI, args: string[]): Promise<string> {
	const result = await api.exec("git", args, { cwd: api.cwd });
	return result.stdout.trim();
}

// ---------------------------------------------------------------------------
// Commit + file ingestion — single git call
//
// `git log --name-only --format="COMMIT %H %s"` emits blocks like:
//
//   COMMIT <sha> <subject>
//
//   path/to/file.ts
//   path/to/other.ts
//
// We split on blank lines and track which SHA each file block belongs to.
// ---------------------------------------------------------------------------

interface CommitData {
	sha: string;
	subject: string;
	files: string[];
	substantive: boolean;
}

async function fetchCommitsWithFiles(api: CustomCommandAPI): Promise<CommitData[]> {
	const raw = await git(api, [
		"log", "main..upstream/main",
		"--name-only",
		"--format=COMMIT %H %s",
		"--no-merges",
	]);

	const commits: CommitData[] = [];
	let current: CommitData | null = null;

	for (const line of raw.split("\n")) {
		if (line.startsWith("COMMIT ")) {
			if (current) commits.push(current);
			const rest = line.slice("COMMIT ".length);
			const spaceIdx = rest.indexOf(" ");
			const sha = rest.slice(0, spaceIdx);
			const subject = rest.slice(spaceIdx + 1).trim();
			current = { sha, subject, files: [], substantive: !isNoise(subject) };
		} else if (line.trim() && current) {
			current.files.push(line.trim());
		}
	}
	if (current) commits.push(current);

	return commits;
}

// ---------------------------------------------------------------------------
// Classification — Option C: scope first, path fallback
// ---------------------------------------------------------------------------

function classifyByScopeString(scope: string): string | null {
	const s = scope.toLowerCase();
	for (const sys of SUBSYSTEMS) {
		if (sys.id === "other") continue;
		// Exact match or sub-scope (e.g. "ipy/kernel" → "ipy")
		if (sys.scopes.some(sc => s === sc || s.startsWith(`${sc}/`) || s.startsWith(`${sc}-`))) {
			return sys.id;
		}
	}
	return null;
}

function classifyByPaths(files: string[]): string {
	// Count how many files in each commit map to each subsystem.
	// Each file is assigned to at most one subsystem (first prefix match).
	const counts = new Map<string, number>();
	for (const file of files) {
		for (const sys of SUBSYSTEMS) {
			if (sys.id === "other") continue;
			if (sys.pathPrefixes.some(p => file.startsWith(p) || file === p)) {
				counts.set(sys.id, (counts.get(sys.id) ?? 0) + 1);
				break;
			}
		}
	}
	if (counts.size === 0) return "other";
	// Return the subsystem with the highest file count
	let bestId = "other";
	let bestCount = 0;
	for (const [id, count] of counts) {
		if (count > bestCount) { bestCount = count; bestId = id; }
	}
	return bestId;
}

function classifyCommit(commit: CommitData): string {
	// Primary: extract conventional commit scope from subject
	const scopeMatch = commit.subject.match(/\(([^)]+)\)/);
	if (scopeMatch) {
		const resolved = classifyByScopeString(scopeMatch[1]);
		if (resolved) return resolved;
	}
	// Fallback: majority file-path prefix
	return classifyByPaths(commit.files);
}

// ---------------------------------------------------------------------------
// Grouping + agent cap
//
// Groups with zero substantive commits are dropped.
// If the total group count exceeds MAX_AGENTS, the smallest groups are
// merged into "other" until the cap is satisfied.
// ---------------------------------------------------------------------------

const MAX_AGENTS = 8;

function groupCommits(commits: CommitData[]): Map<string, CommitData[]> {
	const groups = new Map<string, CommitData[]>();
	for (const commit of commits) {
		const id = classifyCommit(commit);
		if (!groups.has(id)) groups.set(id, []);
		groups.get(id)!.push(commit);
	}

	// Drop groups with no substantive commits
	for (const [id, cs] of groups) {
		if (!cs.some(c => c.substantive)) groups.delete(id);
	}

	// Merge smallest groups into "other" if over cap
	while (groups.size > MAX_AGENTS) {
		let smallestId = "";
		let smallestCount = Infinity;
		for (const [id, cs] of groups) {
			if (id === "other") continue;
			const n = cs.filter(c => c.substantive).length;
			if (n < smallestCount) { smallestCount = n; smallestId = id; }
		}
		if (!smallestId) break;
		const overflow = groups.get(smallestId)!;
		groups.delete(smallestId);
		if (!groups.has("other")) groups.set("other", []);
		groups.get("other")!.push(...overflow);
	}

	return groups;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSubsystem(id: string): Subsystem {
	return SUBSYSTEMS.find(s => s.id === id) ?? SUBSYSTEMS[SUBSYSTEMS.length - 1];
}

async function getAheadCount(api: CustomCommandAPI): Promise<number> {
	return parseInt(await git(api, ["rev-list", "--count", "upstream/main..main"]), 10) || 0;
}

async function getOldUpstreamTip(api: CustomCommandAPI): Promise<string> {
	return git(api, ["merge-base", "main", "upstream/main"]);
}

async function getLocalPatches(api: CustomCommandAPI): Promise<string[]> {
	const raw = await git(api, ["log", "upstream/main..main", "--oneline"]);
	return raw ? raw.split("\n") : [];
}

function readFeaturesFile(cwd: string): string {
	for (const p of [path.join(cwd, "packages/fork/FEATURES.md"), path.join(cwd, "FEATURES.md")]) {
		if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
	}
	return "(packages/fork/FEATURES.md not found)";
}

// ---------------------------------------------------------------------------
// Prompt assembly
// ---------------------------------------------------------------------------

function buildTaskBlock(index: number, sysId: string, commits: CommitData[]): string {
	const sys = getSubsystem(sysId);
	const substantive = commits.filter(c => c.substantive);
	const shaList = substantive.map(c => `\`${c.sha.slice(0, 9)}\``).join(", ");
	const anchors = sys.featureAnchors.length > 0
		? sys.featureAnchors.map(a => `#${a}`).join(", ")
		: "_(no FEATURES.md entries — flag any active fork patches that overlap)_";

	const noiseNote = commits.length > substantive.length
		? `\n  _(${commits.length - substantive.length} noise commit(s) excluded from analysis)_`
		: "";

	return [
		`**Task ${index} — ${sys.label}** (${substantive.length} substantive commit${substantive.length === 1 ? "" : "s"})`,
		`- SHAs: ${shaList || "_(none — all filtered as noise)_"}${noiseNote}`,
		`- FEATURES.md: ${anchors}`,
		`- Instructions: run \`git show <sha>\` for each SHA; classify each FEATURES.md entry as`,
		`  **Absorbed** / **Structurally invalidated** / **Semantically stale** / **Unaffected**;`,
		`  flag any incoming files that overlap fork features not listed above.`,
	].join("\n");
}

function buildPrompt(opts: {
	behind: number;
	ahead: number;
	oldTip: string;
	newTip: string;
	commits: CommitData[];
	groups: Map<string, CommitData[]>;
	patches: string[];
	features: string;
	dryRun: boolean;
}): string {
	const { behind, ahead, oldTip, newTip, commits, groups, patches, features, dryRun } = opts;

	const substantiveTotal = commits.filter(c => c.substantive).length;
	const noiseTotal = behind - substantiveTotal;
	const agentCount = groups.size;

	const dryRunBanner = dryRun
		? "\n> **--dry-run**: report divergence only. Do not rebase.\n"
		: "";

	// Task blocks — preserve SUBSYSTEMS ordering for stable output
	const orderedGroupIds = [...SUBSYSTEMS.map(s => s.id)].filter(id => groups.has(id));
	const taskBlocks = orderedGroupIds
		.map((id, i) => buildTaskBlock(i + 1, id, groups.get(id)!))
		.join("\n\n");

	const patchList = patches.map(p => `- ${p}`).join("\n") || "_(none)_";

	return `# Sync Upstream Task
${dryRunBanner}
## Divergence

| Direction | Count |
|-----------|-------|
| Behind upstream (incoming) | ${behind} |
| Ahead of upstream (local patches) | ${ahead} |

Old upstream tip: \`${oldTip.slice(0, 9)}\`  
New upstream tip: \`${newTip.slice(0, 9)}\`

Substantive commits: **${substantiveTotal}** | Noise filtered: **${noiseTotal}**

---

## Local patch stack (${ahead} patches, newest first)

${patchList}

---

## Fork feature registry

\`\`\`
${features}
\`\`\`

---

## Phase 1 — Parallel semantic analysis

${agentCount === 0
	? "No substantive incoming commits. Skip to Phase 2 and report \"no changes require analysis\"."
	: `Dispatch **${agentCount} \`explore\` agent${agentCount === 1 ? "" : "s"}** in parallel using the Task tool.
Each agent is pre-assigned its subsystem, exact SHA list, and FEATURES.md anchors.
Do not reassign commits between tasks.

${taskBlocks}`}

---

## Phase 2 — Recommendation report

After all agents return, produce this report in full before doing anything else:

\`\`\`
## Pre-rebase analysis: ${oldTip.slice(0, 9)}..${newTip.slice(0, 9)}  (${behind} incoming, ${substantiveTotal} substantive)

### Incoming changes summary
<grouped plain-English summary by subsystem: what changed, why it matters>

### Fork feature status
| Feature | Status | Action required |
|---------|--------|-----------------|
| <name> | Absorbed / Structurally invalidated / Semantically stale / Unaffected | <action> |

### Patches recommended for drop
- <sha> <subject> — <reason>

### Patches requiring rewrite
- <sha> <subject> — <what changed and what the rewrite must do>

### Recommendation
<One paragraph: overall complexity, which patches replay cleanly, which need
rework, whether any fork features should be retired before rebasing.>
\`\`\`

---

## Phase 3 — Approval gate

**Stop after delivering the report.** Do not fetch, stash, or touch git state.
Wait for the user to respond with the exact string \`Proceed with rebasing\`.
Paraphrases and partial matches are not approval.

---
${dryRun
	? "## Dry-run mode — stop here after reporting divergence."
	: `## Phase 4 — Rebase (only after \`Proceed with rebasing\`)

Follow \`.omp/commands/sync-upstream.md\` starting at Step 4. Apply conflict
resolutions informed by the analysis above.

**Standing conflict rules:**
- \`CHANGELOG.md\` — always take HEAD; never modify upstream CHANGELOG
- \`bun.lock\` — always \`git checkout --theirs bun.lock\`
- Code conflicts — apply the patch's *intent* onto upstream's new structure
- Flagged-for-drop patches — skip with \`git rebase --skip\`
- Flagged-for-rewrite patches — apply the rewrite documented in the report
- Before resolving any file: run \`git log REBASE_HEAD..ORIG_HEAD -- <file>\`
  to check for queued patches; resolve in a shape they can apply cleanly
- Ask for approval before applying each resolution

After rebase: \`bun install && bun run build:native && bun run check:ts\`, fix
all errors, run tests for changed areas, update CHANGELOG.md and FEATURES.md,
then \`git push --force-with-lease origin main\`.`}
`;
}

// ---------------------------------------------------------------------------
// Command export
// ---------------------------------------------------------------------------

export default (api: CustomCommandAPI): CustomCommand => ({
	name: "sync-upstream",
	description: "Analyse upstream divergence and guide fork rebase with semantic pre-flight",

	async execute(args: string[], ctx: HookCommandContext): Promise<string | undefined> {
		const dryRun = args.includes("--dry-run");

		// Ensure upstream remote
		try {
			await git(api, ["remote", "get-url", "upstream"]);
		} catch {
			if (ctx.hasUI) ctx.ui.notify("Adding upstream remote…", "info");
			await git(api, ["remote", "add", "upstream", "https://github.com/can1357/oh-my-pi.git"]);
		}

		if (ctx.hasUI) ctx.ui.notify("Fetching upstream/main…", "info");
		await git(api, ["fetch", "upstream", "main"]);

		const behind = parseInt(
			await git(api, ["rev-list", "--count", "main..upstream/main"]),
			10,
		) || 0;

		if (behind === 0) {
			if (ctx.hasUI) ctx.ui.notify("Already up to date with upstream.", "info");
			return "The fork is already up to date with upstream/main. No rebase needed.";
		}

		if (ctx.hasUI) ctx.ui.notify(`Collecting data (${behind} incoming commits)…`, "info");

		// All data fetched in parallel; commits+files in a single git call
		const [ahead, oldTip, newTip, commits, patches] = await Promise.all([
			getAheadCount(api),
			getOldUpstreamTip(api),
			git(api, ["rev-parse", "upstream/main"]),
			fetchCommitsWithFiles(api),
			getLocalPatches(api),
		]);

		const features = readFeaturesFile(api.cwd);
		const groups = groupCommits(commits);

		if (ctx.hasUI) {
			ctx.ui.notify(
				`Ready: ${groups.size} subsystem${groups.size === 1 ? "" : "s"} → ${groups.size} agent${groups.size === 1 ? "" : "s"}`,
				"info",
			);
		}

		return buildPrompt({ behind, ahead, oldTip, newTip, commits, groups, patches, features, dryRun });
	},
});
