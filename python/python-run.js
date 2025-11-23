#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { platform } from "node:os";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);

function usage() {
	console.log("Usage: python-run.js [--venv path] <script.py | -c code | -m module> [args...]");
	console.log("\nRuns Python within a virtual environment.");
	console.log("\nOptions:");
	console.log("  --venv <path>   Path to venv (default: .venv)");
	console.log("\nExamples:");
	console.log("  python-run.js script.py                  # Run script.py");
	console.log("  python-run.js script.py arg1 arg2        # Run with arguments");
	console.log("  python-run.js -c \"print('hello')\"        # Run inline code");
	console.log("  python-run.js -m pytest tests/           # Run module");
	console.log("  python-run.js --venv myenv script.py     # Use custom venv");
	process.exit(1);
}

function getVenvPaths(venvDir) {
	const os = platform();
	const absPath = resolve(venvDir);

	if (os === "win32") {
		return {
			python: join(absPath, "Scripts", "python.exe"),
			pip: join(absPath, "Scripts", "pip.exe"),
		};
	} else {
		return {
			python: join(absPath, "bin", "python"),
			pip: join(absPath, "bin", "pip"),
		};
	}
}

function findVenv(startPath = ".venv") {
	const absPath = resolve(startPath);
	const paths = getVenvPaths(absPath);

	if (existsSync(paths.python)) {
		return { venvPath: absPath, paths };
	}

	return null;
}

if (args.length === 0) {
	usage();
}

// Parse --venv option
let venvPath = ".venv";
let pythonArgs = args;

const venvIdx = args.indexOf("--venv");
if (venvIdx !== -1) {
	if (venvIdx + 1 >= args.length) {
		console.error("✗ --venv requires a path argument");
		process.exit(1);
	}
	venvPath = args[venvIdx + 1];
	pythonArgs = [...args.slice(0, venvIdx), ...args.slice(venvIdx + 2)];
}

if (pythonArgs.length === 0) {
	usage();
}

const venv = findVenv(venvPath);
if (!venv) {
	console.error(`✗ Venv not found at ${resolve(venvPath)}`);
	console.error("  Run: python-venv.js create " + venvPath);
	process.exit(1);
}

// Run python with the provided arguments
const result = spawnSync(venv.paths.python, pythonArgs, {
	encoding: "utf-8",
	stdio: "inherit",
	shell: platform() === "win32",
});

process.exit(result.status || 0);
