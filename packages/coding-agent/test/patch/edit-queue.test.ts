import { describe, expect, it } from "bun:test";
import { EditQueue } from "@oh-my-pi/pi-coding-agent/patch/edit-queue";
import { type HashlineEdit, parseTag } from "@oh-my-pi/pi-coding-agent/patch/hashline";

const tag = (ref: string) => parseTag(ref);

describe("EditQueue", () => {
	it("seeds baseline, diff baseline, and edits on first prepare", () => {
		const queue = new EditQueue();
		const edits: HashlineEdit[] = [{ op: "replace_line", pos: tag("1#QQ"), lines: ["first"] }];

		const result = queue.prepare("/tmp/file.ts", "alpha\nbeta", [...edits]);

		expect(result.baseline).toBe("alpha\nbeta");
		expect(result.diffBaseline).toBe("alpha\nbeta");
		expect(result.allEdits).toEqual([...edits]);
		expect(queue.has("/tmp/file.ts")).toBe(true);
	});

	it("keeps the original baseline and accumulates edits on subsequent prepare calls", () => {
		const queue = new EditQueue();

		const first = queue.prepare("/tmp/file.ts", "alpha\nbeta", [
			{ op: "replace_line", pos: tag("1#QQ"), lines: ["first"] },
		]);
		expect(first.baseline).toBe("alpha\nbeta");
		expect(first.diffBaseline).toBe("alpha\nbeta");

		queue.recordWrite("/tmp/file.ts", "alpha\nFIRST");

		const second = queue.prepare("/tmp/file.ts", "alpha\nFIRST", [{ op: "append_file", lines: ["tail"] }]);

		expect(second.baseline).toBe("alpha\nbeta");
		expect(second.diffBaseline).toBe("alpha\nFIRST");
		expect(second.allEdits).toEqual([
			{ op: "replace_line", pos: tag("1#QQ"), lines: ["first"] },
			{ op: "append_file", lines: ["tail"] },
		]);
	});

	it("uses recordWrite content as the next diff baseline without changing the baseline", () => {
		const queue = new EditQueue();

		queue.prepare("/tmp/file.ts", "alpha\nbeta", []);
		queue.recordWrite("/tmp/file.ts", "alpha\nwritten");

		const result = queue.prepare("/tmp/file.ts", "alpha\nwritten", []);

		expect(result.baseline).toBe("alpha\nbeta");
		expect(result.diffBaseline).toBe("alpha\nwritten");
		expect(result.allEdits).toEqual([]);
	});

	it("treats recordWrite on a missing path as a no-op and leaves flush operations safe", () => {
		const queue = new EditQueue();

		expect(() => queue.recordWrite("/tmp/missing.ts", "ignored")).not.toThrow();
		expect(() => queue.flush("/tmp/missing.ts")).not.toThrow();
		expect(queue.has("/tmp/missing.ts")).toBe(false);
	});

	it("flushes a single path and reseeds it from new disk content", () => {
		const queue = new EditQueue();

		queue.prepare("/tmp/file.ts", "alpha", [{ op: "append_file", lines: ["one"] }]);
		expect(queue.has("/tmp/file.ts")).toBe(true);

		queue.flush("/tmp/file.ts");
		expect(queue.has("/tmp/file.ts")).toBe(false);

		const reseeded = queue.prepare("/tmp/file.ts", "beta", [{ op: "prepend_file", lines: ["two"] }]);
		expect(reseeded.baseline).toBe("beta");
		expect(reseeded.diffBaseline).toBe("beta");
		expect(reseeded.allEdits).toEqual([{ op: "prepend_file", lines: ["two"] }]);
	});

	it("flushes all entries at once", () => {
		const queue = new EditQueue();

		queue.prepare("/tmp/a.ts", "a", []);
		queue.prepare("/tmp/b.ts", "b", []);
		expect(queue.has("/tmp/a.ts")).toBe(true);
		expect(queue.has("/tmp/b.ts")).toBe(true);

		queue.flush();

		expect(queue.has("/tmp/a.ts")).toBe(false);
		expect(queue.has("/tmp/b.ts")).toBe(false);
	});

	it("tracks separate files independently", () => {
		const queue = new EditQueue();

		const a1 = queue.prepare("/tmp/a.ts", "a1", [{ op: "append_file", lines: ["A"] }]);
		const b1 = queue.prepare("/tmp/b.ts", "b1", [{ op: "append_file", lines: ["B"] }]);
		queue.recordWrite("/tmp/a.ts", "a1-written");
		const a2 = queue.prepare("/tmp/a.ts", "a1-written", [{ op: "append_file", lines: ["A2"] }]);

		expect(a1.baseline).toBe("a1");
		expect(b1.baseline).toBe("b1");
		expect(a2.diffBaseline).toBe("a1-written");
		expect(queue.has("/tmp/a.ts")).toBe(true);
		expect(queue.has("/tmp/b.ts")).toBe(true);

		queue.flush("/tmp/a.ts");

		expect(queue.has("/tmp/a.ts")).toBe(false);
		expect(queue.has("/tmp/b.ts")).toBe(true);
	});

	it("accumulates empty prepares without disturbing existing queued edits", () => {
		const queue = new EditQueue();

		const first = queue.prepare("/tmp/file.ts", "alpha", [{ op: "append_file", lines: ["tail"] }]);
		const second = queue.prepare("/tmp/file.ts", "alpha", []);

		expect(first.allEdits).toEqual([{ op: "append_file", lines: ["tail"] }]);
		expect(second.baseline).toBe("alpha");
		expect(second.diffBaseline).toBe("alpha");
		expect(second.allEdits).toEqual([{ op: "append_file", lines: ["tail"] }]);
	});
});
