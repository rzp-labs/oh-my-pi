/**
 * AGENTS.md Provider
 * Discovers standalone AGENTS.md files by walking up from cwd to the repo root.
 * Also loads explicitly pinned AGENTS.md files listed in .omp/settings.json under
 * `pinnedContextFiles` (paths relative to repo root). Files under .omp/ are excluded
 * from pins — they are already loaded by the native OMP provider.
 */
import * as path from "node:path";
import { tryParseJson } from "@oh-my-pi/pi-utils";
import { registerProvider } from "../capability";
import { type ContextFile, contextFileCapability } from "../capability/context-file";
import { readFile } from "../capability/fs";
import type { LoadContext, LoadResult } from "../capability/types";
import { calculateDepth, createSourceMeta } from "./helpers";

const PROVIDER_ID = "agents-md";
const DISPLAY_NAME = "AGENTS.md";

/**
 * Load standalone AGENTS.md files.
 */
async function loadAgentsMd(ctx: LoadContext): Promise<LoadResult<ContextFile>> {
	const items: ContextFile[] = [];
	const warnings: string[] = [];

	// Walk up from cwd looking for AGENTS.md files
	let current = ctx.cwd;

	while (true) {
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

		if (current === (ctx.repoRoot ?? ctx.home)) break; // scanned repo root or home, stop

		// Move to parent directory
		const parent = path.dirname(current);
		if (parent === current) break; // Reached filesystem root
		current = parent;
	}

	// Load explicitly pinned AGENTS.md files from .omp/settings.json
	if (ctx.repoRoot) {
		const ompDir = path.join(ctx.repoRoot, ".omp");
		const settingsPath = path.join(ompDir, "settings.json");
		const settingsContent = await readFile(settingsPath);
		if (settingsContent) {
			const settings = tryParseJson<{ pinnedContextFiles?: unknown }>(settingsContent);
			const pins = settings?.pinnedContextFiles;
			if (Array.isArray(pins)) {
				for (const entry of pins) {
					if (typeof entry !== "string") {
						warnings.push(`pinnedContextFiles: skipping non-string entry: ${String(entry)}`);
						continue;
					}
					const abs = path.resolve(ctx.repoRoot, entry);
					// Skip files under .omp/ — loaded by the native OMP provider at higher priority
					if (abs.startsWith(ompDir + path.sep) || abs === ompDir) {
						warnings.push(`pinnedContextFiles: skipping ${entry} (loaded by native OMP provider)`);
						continue;
					}
					// Skip if already discovered by the walk-up
					if (items.some(item => item.path === abs)) continue;
					const content = await readFile(abs);
					if (content === null) {
						warnings.push(`pinnedContextFiles: file not found: ${entry}`);
						continue;
					}
					items.push({
						path: abs,
						content,
						level: "project",
						depth: -1,
						_source: createSourceMeta(PROVIDER_ID, abs, "project"),
					});
				}
			}
		}
	}

	return { items, warnings };
}

registerProvider(contextFileCapability.id, {
	id: PROVIDER_ID,
	displayName: DISPLAY_NAME,
	description: "Standalone AGENTS.md files (Codex/Gemini style)",
	priority: 10,
	load: loadAgentsMd,
});
