#!/usr/bin/env node

import { execSync, spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { platform } from "node:os";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const command = args[0];
const venvPath = args[1] || ".venv";

function usage() {
	console.log("Usage: python-venv.js <command> [venv-path]");
	console.log("\nCommands:");
	console.log("  create [path]   Create a new virtual environment (default: .venv)");
	console.log("  delete [path]   Delete an existing virtual environment");
	console.log("  info [path]     Show venv information and paths");
	console.log("\nExamples:");
	console.log("  python-venv.js create           # Create .venv in current directory");
	console.log("  python-venv.js create myenv     # Create myenv in current directory");
	console.log("  python-venv.js delete .venv     # Delete .venv");
	console.log("  python-venv.js info             # Show .venv info");
	process.exit(1);
}

function findPython() {
	const os = platform();
	const commands = os === "win32"
		? ["python", "python3", "py -3"]
		: ["python3", "python"];

	for (const cmd of commands) {
		try {
			const result = spawnSync(cmd.split(" ")[0], cmd.split(" ").slice(1).concat(["--version"]), {
				encoding: "utf-8",
				stdio: ["pipe", "pipe", "pipe"],
				shell: os === "win32",
			});
			if (result.status === 0) {
				return cmd;
			}
		} catch {}
	}
	return null;
}

function getVenvPaths(venvDir) {
	const os = platform();
	const absPath = resolve(venvDir);

	if (os === "win32") {
		return {
			python: join(absPath, "Scripts", "python.exe"),
			pip: join(absPath, "Scripts", "pip.exe"),
			activate: join(absPath, "Scripts", "activate.bat"),
			activatePs: join(absPath, "Scripts", "Activate.ps1"),
			bin: join(absPath, "Scripts"),
		};
	} else {
		return {
			python: join(absPath, "bin", "python"),
			pip: join(absPath, "bin", "pip"),
			activate: join(absPath, "bin", "activate"),
			bin: join(absPath, "bin"),
		};
	}
}

function createVenv(venvDir) {
	const pythonCmd = findPython();
	if (!pythonCmd) {
		console.error("✗ Python not found. Please install Python 3.");
		process.exit(1);
	}

	const absPath = resolve(venvDir);

	if (existsSync(absPath)) {
		const paths = getVenvPaths(absPath);
		if (existsSync(paths.python)) {
			console.log(`✓ Venv already exists at ${absPath}`);
			return;
		}
	}

	console.log(`Creating venv at ${absPath}...`);

	try {
		const cmdParts = pythonCmd.split(" ");
		const result = spawnSync(cmdParts[0], [...cmdParts.slice(1), "-m", "venv", absPath], {
			encoding: "utf-8",
			stdio: "inherit",
			shell: platform() === "win32",
		});

		if (result.status !== 0) {
			console.error("✗ Failed to create venv");
			process.exit(1);
		}

		const paths = getVenvPaths(absPath);
		if (existsSync(paths.python)) {
			console.log(`✓ Venv created at ${absPath}`);
			console.log(`  Python: ${paths.python}`);
			console.log(`  Pip: ${paths.pip}`);
		} else {
			console.error("✗ Venv creation failed - python not found in venv");
			process.exit(1);
		}
	} catch (err) {
		console.error("✗ Failed to create venv:", err.message);
		process.exit(1);
	}
}

function deleteVenv(venvDir) {
	const absPath = resolve(venvDir);

	if (!existsSync(absPath)) {
		console.error(`✗ Venv not found at ${absPath}`);
		process.exit(1);
	}

	const paths = getVenvPaths(absPath);
	if (!existsSync(paths.python)) {
		console.error(`✗ ${absPath} does not appear to be a valid venv`);
		process.exit(1);
	}

	try {
		rmSync(absPath, { recursive: true, force: true });
		console.log(`✓ Venv deleted at ${absPath}`);
	} catch (err) {
		console.error("✗ Failed to delete venv:", err.message);
		process.exit(1);
	}
}

function showInfo(venvDir) {
	const absPath = resolve(venvDir);
	const paths = getVenvPaths(absPath);

	if (!existsSync(absPath)) {
		console.error(`✗ Venv not found at ${absPath}`);
		process.exit(1);
	}

	if (!existsSync(paths.python)) {
		console.error(`✗ ${absPath} does not appear to be a valid venv`);
		process.exit(1);
	}

	console.log(`Venv: ${absPath}`);
	console.log(`Python: ${paths.python}`);
	console.log(`Pip: ${paths.pip}`);
	console.log(`Bin: ${paths.bin}`);

	// Get Python version
	try {
		const result = spawnSync(paths.python, ["--version"], {
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		});
		if (result.stdout) {
			console.log(`Version: ${result.stdout.trim()}`);
		}
	} catch {}

	// List installed packages
	try {
		const result = spawnSync(paths.pip, ["list", "--format=freeze"], {
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		});
		if (result.stdout) {
			const packages = result.stdout.trim().split("\n").filter(Boolean);
			console.log(`Packages: ${packages.length} installed`);
		}
	} catch {}
}

if (!command || !["create", "delete", "info"].includes(command)) {
	usage();
}

switch (command) {
	case "create":
		createVenv(venvPath);
		break;
	case "delete":
		deleteVenv(venvPath);
		break;
	case "info":
		showInfo(venvPath);
		break;
}
