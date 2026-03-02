import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolvePythonRuntime } from "@oh-my-pi/pi-coding-agent/ipy/runtime";
import * as piUtils from "@oh-my-pi/pi-utils";

/** Create a minimal stub venv: just the bin/python file that satisfies fs.existsSync. */
function createStubVenv(venvPath: string): void {
	const binDir = path.join(venvPath, "bin");
	fs.mkdirSync(binDir, { recursive: true });
	fs.writeFileSync(path.join(binDir, "python"), "");
}

/** Stub managed venv dir AND intercept getPythonEnvDir to point at it. */
function stubManagedVenv(managedDir: string): void {
	vi.spyOn(piUtils, "getPythonEnvDir").mockReturnValue(managedDir);
	createStubVenv(managedDir);
}

describe("resolvePythonRuntime", () => {
	let tmpDir: string;
	let savedVirtualEnv: string | undefined;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "omp-runtime-test-"));
		// Isolate from any VIRTUAL_ENV active in the test process env,
		// which resolveVenvPath reads via $env.VIRTUAL_ENV.
		savedVirtualEnv = Bun.env.VIRTUAL_ENV;
		delete Bun.env.VIRTUAL_ENV;
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
		if (savedVirtualEnv !== undefined) {
			Bun.env.VIRTUAL_ENV = savedVirtualEnv;
		}
		vi.restoreAllMocks();
	});

	describe("default mode (preferManaged: false)", () => {
		it("picks project .venv when present", () => {
			const cwd = path.join(tmpDir, "project");
			const projectVenv = path.join(cwd, ".venv");
			createStubVenv(projectVenv);

			const runtime = resolvePythonRuntime(cwd, {});

			expect(runtime.venvPath).toBe(projectVenv);
			expect(runtime.pythonPath).toBe(path.join(projectVenv, "bin", "python"));
			expect(runtime.env.VIRTUAL_ENV).toBe(projectVenv);
		});

		it("prefers explicit VIRTUAL_ENV over project .venv", () => {
			const cwd = path.join(tmpDir, "project");
			createStubVenv(path.join(cwd, ".venv"));
			const explicitVenv = path.join(tmpDir, "explicit-venv");
			createStubVenv(explicitVenv);

			const runtime = resolvePythonRuntime(cwd, { VIRTUAL_ENV: explicitVenv });

			expect(runtime.venvPath).toBe(explicitVenv);
		});

		it("falls through to managed venv when no project venv exists", () => {
			const cwd = path.join(tmpDir, "empty-project");
			fs.mkdirSync(cwd, { recursive: true });
			const managedDir = path.join(tmpDir, "managed");
			stubManagedVenv(managedDir);

			const runtime = resolvePythonRuntime(cwd, {});

			expect(runtime.venvPath).toBe(managedDir);
			expect(runtime.pythonPath).toBe(path.join(managedDir, "bin", "python"));
		});

		it("skips project .venv whose Python binary is missing", () => {
			const cwd = path.join(tmpDir, "project");
			// Directory structure exists but no bin/python inside
			fs.mkdirSync(path.join(cwd, ".venv", "bin"), { recursive: true });
			const managedDir = path.join(tmpDir, "managed");
			stubManagedVenv(managedDir);

			const runtime = resolvePythonRuntime(cwd, {});

			expect(runtime.venvPath).toBe(managedDir);
			// Must not poison VIRTUAL_ENV with the broken .venv path
			expect(runtime.env.VIRTUAL_ENV).toBe(managedDir);
		});

		it("falls through to system Python when no venv exists at all", () => {
			const cwd = path.join(tmpDir, "empty-project");
			fs.mkdirSync(cwd, { recursive: true });
			vi.spyOn(piUtils, "getPythonEnvDir").mockReturnValue(path.join(tmpDir, "no-such-managed"));

			const runtime = resolvePythonRuntime(cwd, {});

			const systemPython = Bun.which("python") ?? Bun.which("python3");
			expect(runtime.pythonPath).toBe(systemPython!);
			expect(runtime.venvPath).toBeUndefined();
		});
	});

	describe("preferManaged: true", () => {
		it("picks managed venv over project .venv", () => {
			const cwd = path.join(tmpDir, "project");
			createStubVenv(path.join(cwd, ".venv"));
			const managedDir = path.join(tmpDir, "managed");
			stubManagedVenv(managedDir);

			const runtime = resolvePythonRuntime(cwd, {}, { preferManaged: true });

			expect(runtime.venvPath).toBe(managedDir);
			expect(runtime.pythonPath).toBe(path.join(managedDir, "bin", "python"));
		});

		it("does not fall back to project .venv when managed is absent", () => {
			const cwd = path.join(tmpDir, "project");
			const projectVenv = path.join(cwd, ".venv");
			createStubVenv(projectVenv);
			vi.spyOn(piUtils, "getPythonEnvDir").mockReturnValue(path.join(tmpDir, "no-such-managed"));

			const runtime = resolvePythonRuntime(cwd, {}, { preferManaged: true });

			// Project venv must be ignored; system Python is the only fallback
			expect(runtime.venvPath).toBeUndefined();
			expect(runtime.pythonPath).not.toBe(path.join(projectVenv, "bin", "python"));
		});

		it("falls back to explicit VIRTUAL_ENV when managed is absent", () => {
			const cwd = path.join(tmpDir, "project");
			fs.mkdirSync(cwd, { recursive: true });
			vi.spyOn(piUtils, "getPythonEnvDir").mockReturnValue(path.join(tmpDir, "no-such-managed"));
			const explicitVenv = path.join(tmpDir, "explicit-venv");
			createStubVenv(explicitVenv);

			const runtime = resolvePythonRuntime(cwd, { VIRTUAL_ENV: explicitVenv }, { preferManaged: true });

			expect(runtime.venvPath).toBe(explicitVenv);
		});

		it("falls through to system Python when managed and VIRTUAL_ENV are both absent", () => {
			const cwd = path.join(tmpDir, "project");
			// Project .venv exists but must be ignored in preferManaged mode
			createStubVenv(path.join(cwd, ".venv"));
			vi.spyOn(piUtils, "getPythonEnvDir").mockReturnValue(path.join(tmpDir, "no-such-managed"));

			const runtime = resolvePythonRuntime(cwd, {}, { preferManaged: true });

			const systemPython = Bun.which("python") ?? Bun.which("python3");
			expect(runtime.pythonPath).toBe(systemPython!);
			expect(runtime.venvPath).toBeUndefined();
		});
	});

	describe("env setup", () => {
		it("prepends venv bin to PATH", () => {
			const managedDir = path.join(tmpDir, "managed");
			stubManagedVenv(managedDir);

			const runtime = resolvePythonRuntime(tmpDir, { PATH: "/usr/bin:/bin" }, { preferManaged: true });

			const expectedBin = path.join(managedDir, "bin");
			expect(runtime.env.PATH).toBe(`${expectedBin}${path.delimiter}/usr/bin:/bin`);
		});

		it("sets VIRTUAL_ENV in returned env to the selected venv", () => {
			const managedDir = path.join(tmpDir, "managed");
			stubManagedVenv(managedDir);

			const runtime = resolvePythonRuntime(tmpDir, {}, { preferManaged: true });

			expect(runtime.env.VIRTUAL_ENV).toBe(managedDir);
		});

		it("does not mutate baseEnv", () => {
			const managedDir = path.join(tmpDir, "managed");
			stubManagedVenv(managedDir);
			const baseEnv: Record<string, string | undefined> = { PATH: "/usr/bin" };

			resolvePythonRuntime(tmpDir, baseEnv, { preferManaged: true });

			expect(baseEnv.PATH).toBe("/usr/bin");
			expect(baseEnv.VIRTUAL_ENV).toBeUndefined();
		});
	});
});
