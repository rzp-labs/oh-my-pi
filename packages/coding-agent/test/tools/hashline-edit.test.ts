import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { _resetSettingsForTest, Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import { EditTool } from "@oh-my-pi/pi-coding-agent/patch";
import { EditQueue } from "@oh-my-pi/pi-coding-agent/patch/edit-queue";
import { formatHashLines, parseTag } from "@oh-my-pi/pi-coding-agent/patch/hashline";
import type { ToolSession } from "@oh-my-pi/pi-coding-agent/tools";

let tempDir = "";
let originalEditVariant: string | undefined;
let artifactCounter = 0;

function createTestToolSession(cwd: string, settings: Settings = Settings.isolated()): ToolSession {
	const sessionFile = path.join(cwd, "session.jsonl");
	const sessionDir = path.join(cwd, "session");
	return {
		cwd,
		hasUI: false,
		getSessionFile: () => sessionFile,
		getSessionSpawns: () => "*",
		getArtifactsDir: () => sessionDir,
		allocateOutputArtifact: async (toolType: string) => {
			fs.mkdirSync(sessionDir, { recursive: true });
			const id = `artifact-${++artifactCounter}`;
			return { id, path: path.join(sessionDir, `${id}.${toolType}.log`) };
		},
		settings,
	};
}

function makeSession(cwd: string, withQueue: boolean) {
	const settings = Settings.isolated({ "edit.mode": "hashline" });
	const session = createTestToolSession(cwd, settings);
	return withQueue ? { ...session, editQueue: new EditQueue() } : session;
}

function getTextOutput(result: any): string {
	return (
		result.content
			?.filter((entry: any) => entry.type === "text")
			.map((entry: any) => entry.text)
			.join("\n") ?? ""
	);
}

function anchorForLine(formatted: string, lineNumber: number) {
	const line = formatted.split("\n")[lineNumber - 1];
	const tag = line.slice(0, line.indexOf(":"));
	return parseTag(tag);
}

function tagFor(anchor: { line: number; hash: string }): string {
	return `${anchor.line}#${anchor.hash}`;
}

async function writeFixture(tempFile: string) {
	await Bun.write(tempFile, "function alpha() {\n\treturn 1;\n}\n\nfunction beta() {\n\treturn 2;\n}\n");
}

async function readText(filePath: string): Promise<string> {
	return await Bun.file(filePath).text();
}

describe("hashline edit queue", () => {
	beforeEach(async () => {
		_resetSettingsForTest();
		originalEditVariant = Bun.env.PI_EDIT_VARIANT;
		delete Bun.env.PI_EDIT_VARIANT;
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hashline-edit-queue-"));
		await Settings.init({ inMemory: true, cwd: tempDir, overrides: { "edit.mode": "hashline" } });
	});

	afterEach(() => {
		_resetSettingsForTest();
		if (originalEditVariant === undefined) {
			delete Bun.env.PI_EDIT_VARIANT;
		} else {
			Bun.env.PI_EDIT_VARIANT = originalEditVariant;
		}
		if (tempDir) {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("sequential edits to the same file keep validating against the original baseline", async () => {
		const filePath = path.join(tempDir, "sample.ts");
		await writeFixture(filePath);

		const formatted = formatHashLines(await readText(filePath));
		const blankAnchor = anchorForLine(formatted, 4);
		const betaAnchor = anchorForLine(formatted, 5);

		expect(blankAnchor.line).toBe(4);
		expect(betaAnchor.line).toBe(5);

		const tool = new EditTool(makeSession(tempDir, true));

		const call1 = await tool.execute("q-test-1-call-1", {
			path: filePath,
			edits: [
				{ loc: { prepend: tagFor(betaAnchor) }, content: ["// inserted 1", "// inserted 2", "// inserted 3"] },
			],
		});
		expect(getTextOutput(call1)).toContain("Changes: +3 -0");

		const call2 = await tool.execute("q-test-1-call-2", {
			path: filePath,
			edits: [
				{
					loc: { range: { pos: tagFor(betaAnchor), end: tagFor(betaAnchor) } },
					content: ["function betaRenamed() {"],
				},
			],
		});
		expect(getTextOutput(call2)).toContain("Changes: +1 -1");

		const content = await readText(filePath);
		expect(content).toContain("// inserted 1\n// inserted 2\n// inserted 3");
		expect(content).toContain("function betaRenamed() {");
		expect(content).toContain("\treturn 2;");
		expect(content).not.toContain("function beta() {");
	});

	it("without a queue, sequential edits with shifted anchors fail", async () => {
		const filePath = path.join(tempDir, "sample.ts");
		await writeFixture(filePath);

		const formatted = formatHashLines(await readText(filePath));
		const betaAnchor = anchorForLine(formatted, 5);
		const tool = new EditTool(makeSession(tempDir, false));

		await tool.execute("q-test-2-call-1", {
			path: filePath,
			edits: [
				{ loc: { prepend: tagFor(betaAnchor) }, content: ["// inserted 1", "// inserted 2", "// inserted 3"] },
			],
		});

		await expect(
			tool.execute("q-test-2-call-2", {
				path: filePath,
				edits: [
					{
						loc: { range: { pos: tagFor(betaAnchor), end: tagFor(betaAnchor) } },
						content: ["function betaRenamed() {"],
					},
				],
			}),
		).rejects.toThrow();
	});

	it("flushes the queue on read so post-read anchors validate against the new disk state", async () => {
		const filePath = path.join(tempDir, "sample.ts");
		await writeFixture(filePath);

		const session = makeSession(tempDir, true) as ToolSession & { editQueue: EditQueue };
		const tool = new EditTool(session);

		const originalFormatted = formatHashLines(await readText(filePath));
		const betaAnchor = anchorForLine(originalFormatted, 5);

		await tool.execute("q-test-3-call-1", {
			path: filePath,
			edits: [
				{ loc: { prepend: tagFor(betaAnchor) }, content: ["// inserted 1", "// inserted 2", "// inserted 3"] },
			],
		});

		session.editQueue.flush(filePath);

		const currentFormatted = formatHashLines(await readText(filePath));
		const currentBetaAnchor = anchorForLine(currentFormatted, 8);

		await tool.execute("q-test-3-call-2", {
			path: filePath,
			edits: [
				{
					loc: { range: { pos: tagFor(currentBetaAnchor), end: tagFor(currentBetaAnchor) } },
					content: ["function betaRenamed() {"],
				},
			],
		});

		const content = await readText(filePath);
		expect(content).toContain("// inserted 1\n// inserted 2\n// inserted 3");
		expect(content).toContain("function betaRenamed() {");
		expect(content).toContain("\treturn 2;");
	});

	it("recordWrite keeps each call's diff scoped to its own changes", async () => {
		const filePath = path.join(tempDir, "sample.ts");
		await writeFixture(filePath);

		const formatted = formatHashLines(await readText(filePath));
		const betaAnchor = anchorForLine(formatted, 5);
		const tool = new EditTool(makeSession(tempDir, true));

		const call1 = await tool.execute("q-test-4-call-1", {
			path: filePath,
			edits: [
				{ loc: { prepend: tagFor(betaAnchor) }, content: ["// inserted 1", "// inserted 2", "// inserted 3"] },
			],
		});
		expect(getTextOutput(call1)).toContain("Changes: +3 -0");

		const call2 = await tool.execute("q-test-4-call-2", {
			path: filePath,
			edits: [
				{
					loc: { range: { pos: tagFor(betaAnchor), end: tagFor(betaAnchor) } },
					content: ["function betaRenamed() {"],
				},
			],
		});
		const text2 = getTextOutput(call2);
		expect(text2).toContain("Changes: +1 -1");
		expect(text2).not.toContain("Changes: +4 -1");
		expect(text2).not.toContain("Changes: +3 -1");
	});
});
