import type { HashlineEdit } from "./hashline";

/**
 * Per-file state held while a turn is active.
 *
 * originalContent  — LF-normalised, BOM-stripped file content from the first
 *                    edit call this turn. All subsequent calls validate their
 *                    anchors against this snapshot, not the mutated disk state.
 *
 * accumulatedEdits — every HashlineEdit submitted across all calls this turn,
 *                    in submission order. applyHashlineEdits sorts bottom-up
 *                    internally, so order here does not matter.
 *
 * lastWrittenContent — the result of the most recent successful applyHashlineEdits
 *                      pass. Used as the diff baseline so each call's response
 *                      shows only its own delta, not the entire accumulated diff.
 */
interface PendingFileEdits {
	readonly originalContent: string;
	readonly accumulatedEdits: HashlineEdit[];
	lastWrittenContent: string;
}

/**
 * Turn-scoped coalescing queue for hashline edit operations.
 *
 * Problem: EditTool.execute() reads from disk on every call. When a model
 * issues two edit calls to the same file in one turn, the second call reads
 * the mutated post-call-1 state. Anchors from the original read are validated
 * against this mutated state — and with only 256 hash values, non-alphanumeric
 * lines (blank lines, lone braces, JSDoc delimiters) can produce false-positive
 * matches, silently targeting the wrong lines and corrupting the file.
 *
 * Fix: instead of validating each call against the current disk state, the
 * queue caches the original file content and validates ALL edits within a turn
 * against that single immutable baseline. applyHashlineEdits already handles
 * multiple edits atomically via bottom-up sort — the queue simply ensures that
 * property is exploited across tool calls, not just within one.
 *
 * Flush triggers (disk state diverges from queue baseline):
 *   - turn_end        : turn over; next turn may re-read the file
 *   - read same file  : model re-read produces new anchor baseline
 *   - write same file : WriteTool or other external write invalidates baseline
 *   - delete/move     : file identity changes; baseline is meaningless
 *   - edit error      : applyHashlineEdits threw; model will likely re-read
 */
export class EditQueue {
	readonly #pending = new Map<string, PendingFileEdits>();

	/**
	 * Prepare a hashline apply operation.
	 *
	 * If this is the first edit call to `absolutePath` this turn, seeds the
	 * queue entry with `diskContent` as the immutable baseline.
	 *
	 * If the file already has a pending entry, ignores `diskContent` (which
	 * reflects prior edits and must not be used as a validation baseline) and
	 * accumulates `newEdits` into the existing entry instead.
	 *
	 * Returns the baseline to pass to applyHashlineEdits, the full accumulated
	 * edit list to apply, and the previous written content to diff against.
	 */
	prepare(
		absolutePath: string,
		diskContent: string,
		newEdits: HashlineEdit[],
	): { baseline: string; allEdits: HashlineEdit[]; diffBaseline: string } {
		const existing = this.#pending.get(absolutePath);
		if (existing) {
			existing.accumulatedEdits.push(...newEdits);
			return {
				baseline: existing.originalContent,
				allEdits: existing.accumulatedEdits,
				diffBaseline: existing.lastWrittenContent,
			};
		}
		const entry: PendingFileEdits = {
			originalContent: diskContent,
			accumulatedEdits: [...newEdits],
			lastWrittenContent: diskContent,
		};
		this.#pending.set(absolutePath, entry);
		return {
			baseline: diskContent,
			allEdits: entry.accumulatedEdits,
			diffBaseline: diskContent,
		};
	}

	/**
	 * Record the result of a successful write so the next call in this turn
	 * can diff against it rather than against the original content.
	 */
	recordWrite(absolutePath: string, content: string): void {
		const entry = this.#pending.get(absolutePath);
		if (entry) entry.lastWrittenContent = content;
	}

	/**
	 * Flush the queue entry for a specific file, or all entries.
	 * Call this whenever disk state may diverge from the cached baseline
	 * (read, external write, delete, move, turn_end, edit error).
	 */
	flush(absolutePath?: string): void {
		if (absolutePath !== undefined) {
			this.#pending.delete(absolutePath);
		} else {
			this.#pending.clear();
		}
	}

	/** Whether a file has a pending queue entry this turn. */
	has(absolutePath: string): boolean {
		return this.#pending.has(absolutePath);
	}
}
