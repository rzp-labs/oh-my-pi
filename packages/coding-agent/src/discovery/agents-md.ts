/**
 * AGENTS.md Provider
 *
 * Discovers standalone AGENTS.md files by walking up from cwd and down into subdirectories.
 * This handles AGENTS.md files that live in project root (not in config directories
 * like .codex/ or .gemini/, which are handled by their respective providers).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { registerProvider } from "../capability";
import { type ContextFile, contextFileCapability } from "../capability/context-file";
import { readFile } from "../capability/fs";
import type { LoadContext, LoadResult } from "../capability/types";
import { calculateDepth, createSourceMeta } from "./helpers";

const PROVIDER_ID = "agents-md";
const DISPLAY_NAME = "AGENTS.md";
const MAX_DEPTH = 20; // Prevent walking up excessively far from cwd
const WALK_DOWN_MAX_DEPTH = 4;
const WALK_DOWN_MAX_FILES = 50;

const EXCLUDED_DIRS = new Set(["node_modules", ".git"]);
async function collectDescendantAgentsMd(
	cwd: string,
	dir: string,
	depth: number,
	maxDepth: number,
	maxFiles: number,
	found: Set<string>,
	items: ContextFile[],
): Promise<void> {
	if (depth > maxDepth || items.length >= maxFiles) return;

	let entries: fs.Dirent[];
	try {
		entries = await fs.promises.readdir(dir, { withFileTypes: true });
	} catch {
		return;
	}

	const subdirs: string[] = [];

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		if (EXCLUDED_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
		subdirs.push(path.join(dir, entry.name));
	}

	await Promise.all(
		subdirs.map(async subdir => {
			if (items.length >= maxFiles) return;

			const candidate = path.join(subdir, "AGENTS.md");
			if (!found.has(candidate)) {
				const content = await readFile(candidate);
				if (content !== null) {
					found.add(candidate);
					const fileDir = path.dirname(candidate);
					const calculatedDepth = calculateDepth(cwd, fileDir, path.sep);
					items.push({
						path: candidate,
						content,
						level: "project",
						depth: calculatedDepth,
						_source: createSourceMeta(PROVIDER_ID, candidate, "project"),
					});
				}
			}

			await collectDescendantAgentsMd(cwd, subdir, depth + 1, maxDepth, maxFiles, found, items);
		}),
	);
}

/**
 * Load standalone AGENTS.md files.
 */
async function loadAgentsMd(ctx: LoadContext): Promise<LoadResult<ContextFile>> {
	const items: ContextFile[] = [];
	const warnings: string[] = [];

	// Walk up from cwd looking for AGENTS.md files
	let current = ctx.cwd;
	let depth = 0;

	while (depth < MAX_DEPTH) {
		const candidate = path.join(current, "AGENTS.md");
		const content = await readFile(candidate);

		if (content !== null) {
			const parent = path.dirname(candidate);
			const baseName = parent.split(path.sep).pop() ?? "";

			if (!baseName.startsWith(".")) {
				const fileDir = path.dirname(candidate);
				const calculatedDepth = calculateDepth(ctx.cwd, fileDir, path.sep);

				items.push({
					path: candidate,
					content,
					level: "project",
					depth: calculatedDepth,
					_source: createSourceMeta(PROVIDER_ID, candidate, "project"),
				});
			}
		}

		// Move to parent directory
		const parent = path.dirname(current);
		if (parent === current) break; // Reached filesystem root
		current = parent;
		depth++;
	}

	// Walk down from cwd into subdirectories
	const found = new Set(items.map(item => item.path));
	const descendantItems: ContextFile[] = [];
	await collectDescendantAgentsMd(
		ctx.cwd,
		ctx.cwd,
		1,
		WALK_DOWN_MAX_DEPTH,
		WALK_DOWN_MAX_FILES,
		found,
		descendantItems,
	);
	items.push(...descendantItems);

	return { items, warnings };
}

registerProvider(contextFileCapability.id, {
	id: PROVIDER_ID,
	displayName: DISPLAY_NAME,
	description: "Standalone AGENTS.md files (Codex/Gemini style)",
	priority: 10,
	load: loadAgentsMd,
});
