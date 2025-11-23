#!/usr/bin/env node

/**
 * Analyzes Unreal Engine module structure
 * Parses .uproject, .Build.cs, and .Target.cs files
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join, basename, dirname } from "node:path";
import { execSync } from "node:child_process";
import { platform } from "node:os";

const args = process.argv.slice(2);
const command = args[0];

function usage() {
	console.log("Usage: unreal-module.js [command] [options]");
	console.log("\nCommands:");
	console.log("  list                    List all modules in project");
	console.log("  info <ModuleName>       Show module details and dependencies");
	console.log("  deps <ModuleName>       Show dependency graph");
	console.log("  plugins                 List all plugins");
	console.log("\nExamples:");
	console.log("  unreal-module.js list");
	console.log("  unreal-module.js info MyGameModule");
	console.log("  unreal-module.js deps MyGameModule");
	console.log("  unreal-module.js plugins");
	process.exit(1);
}

// Find .uproject file
function findUProject() {
	const isWin = platform() === "win32";
	try {
		let cmd;
		if (isWin) {
			cmd = `dir /b /s *.uproject 2>nul`;
		} else {
			cmd = `find . -maxdepth 3 -name "*.uproject" 2>/dev/null | head -1`;
		}
		const result = execSync(cmd, { encoding: "utf-8", cwd: process.cwd() }).trim();
		if (result) {
			const files = result.split("\n").filter(f => f.endsWith(".uproject"));
			return files[0] ? resolve(files[0]) : null;
		}
	} catch {}
	return null;
}

// Find all .Build.cs files
function findBuildFiles(sourceDir) {
	const buildFiles = [];

	function scanDir(dir) {
		if (!existsSync(dir)) return;
		try {
			const entries = readdirSync(dir);
			for (const entry of entries) {
				const fullPath = join(dir, entry);
				try {
					const stat = statSync(fullPath);
					if (stat.isDirectory()) {
						scanDir(fullPath);
					} else if (entry.endsWith(".Build.cs")) {
						buildFiles.push(fullPath);
					}
				} catch {}
			}
		} catch {}
	}

	scanDir(sourceDir);
	return buildFiles;
}

// Parse .Build.cs file
function parseBuildFile(filePath) {
	const content = readFileSync(filePath, "utf-8");
	const moduleName = basename(filePath).replace(".Build.cs", "");

	const result = {
		name: moduleName,
		path: filePath,
		type: "Unknown",
		publicDependencies: [],
		privateDependencies: [],
		publicIncludePaths: [],
		privateIncludePaths: [],
	};

	// Module type
	const typeMatch = content.match(/Type\s*=\s*ModuleType\.(\w+)/);
	if (typeMatch) {
		result.type = typeMatch[1];
	}

	// Public dependencies
	const publicDepMatch = content.match(/PublicDependencyModuleNames\.AddRange\s*\(\s*new\s*string\[\]\s*\{([^}]+)\}/);
	if (publicDepMatch) {
		result.publicDependencies = publicDepMatch[1]
			.match(/"([^"]+)"/g)
			?.map(s => s.replace(/"/g, "")) || [];
	}

	// Private dependencies
	const privateDepMatch = content.match(/PrivateDependencyModuleNames\.AddRange\s*\(\s*new\s*string\[\]\s*\{([^}]+)\}/);
	if (privateDepMatch) {
		result.privateDependencies = privateDepMatch[1]
			.match(/"([^"]+)"/g)
			?.map(s => s.replace(/"/g, "")) || [];
	}

	// Single dependency additions
	const singlePubDeps = content.matchAll(/PublicDependencyModuleNames\.Add\s*\(\s*"([^"]+)"\s*\)/g);
	for (const match of singlePubDeps) {
		if (!result.publicDependencies.includes(match[1])) {
			result.publicDependencies.push(match[1]);
		}
	}

	const singlePrivDeps = content.matchAll(/PrivateDependencyModuleNames\.Add\s*\(\s*"([^"]+)"\s*\)/g);
	for (const match of singlePrivDeps) {
		if (!result.privateDependencies.includes(match[1])) {
			result.privateDependencies.push(match[1]);
		}
	}

	return result;
}

// Parse .uproject file
function parseUProject(filePath) {
	const content = readFileSync(filePath, "utf-8");
	try {
		return JSON.parse(content);
	} catch {
		return null;
	}
}

// List all modules
function listModules(projectRoot) {
	const sourceDir = join(projectRoot, "Source");
	const buildFiles = findBuildFiles(sourceDir);

	if (buildFiles.length === 0) {
		console.log("No modules found in Source/");
		return;
	}

	console.log("Modules:\n");

	const modules = buildFiles.map(f => parseBuildFile(f));
	modules.sort((a, b) => a.name.localeCompare(b.name));

	for (const mod of modules) {
		const depCount = mod.publicDependencies.length + mod.privateDependencies.length;
		console.log(`  ${mod.name}`);
		console.log(`    Type: ${mod.type}`);
		console.log(`    Dependencies: ${depCount}`);
		console.log(`    Path: ${mod.path}`);
		console.log();
	}

	console.log(`Total: ${modules.length} modules`);
}

// Show module info
function showModuleInfo(projectRoot, moduleName) {
	const sourceDir = join(projectRoot, "Source");
	const buildFiles = findBuildFiles(sourceDir);

	const buildFile = buildFiles.find(f =>
		basename(f).toLowerCase() === `${moduleName.toLowerCase()}.build.cs`
	);

	if (!buildFile) {
		console.error(`✗ Module not found: ${moduleName}`);
		console.error("\nAvailable modules:");
		buildFiles.forEach(f => console.error(`  ${basename(f).replace(".Build.cs", "")}`));
		process.exit(1);
	}

	const mod = parseBuildFile(buildFile);

	console.log(`Module: ${mod.name}`);
	console.log(`Type: ${mod.type}`);
	console.log(`Path: ${mod.path}\n`);

	if (mod.publicDependencies.length > 0) {
		console.log("Public Dependencies:");
		mod.publicDependencies.forEach(d => console.log(`  ${d}`));
		console.log();
	}

	if (mod.privateDependencies.length > 0) {
		console.log("Private Dependencies:");
		mod.privateDependencies.forEach(d => console.log(`  ${d}`));
		console.log();
	}

	// Find module directory and list source files
	const moduleDir = dirname(buildFile);
	const sourceFiles = { headers: 0, sources: 0 };

	function countFiles(dir) {
		if (!existsSync(dir)) return;
		try {
			const entries = readdirSync(dir);
			for (const entry of entries) {
				const fullPath = join(dir, entry);
				try {
					const stat = statSync(fullPath);
					if (stat.isDirectory()) {
						countFiles(fullPath);
					} else if (entry.endsWith(".h")) {
						sourceFiles.headers++;
					} else if (entry.endsWith(".cpp")) {
						sourceFiles.sources++;
					}
				} catch {}
			}
		} catch {}
	}

	countFiles(moduleDir);
	console.log(`Source Files: ${sourceFiles.headers} headers, ${sourceFiles.sources} sources`);
}

// Show dependency graph
function showDependencyGraph(projectRoot, moduleName) {
	const sourceDir = join(projectRoot, "Source");
	const buildFiles = findBuildFiles(sourceDir);

	const modules = new Map();
	for (const f of buildFiles) {
		const mod = parseBuildFile(f);
		modules.set(mod.name.toLowerCase(), mod);
	}

	const targetMod = modules.get(moduleName.toLowerCase());
	if (!targetMod) {
		console.error(`✗ Module not found: ${moduleName}`);
		process.exit(1);
	}

	console.log(`Dependency Graph for ${targetMod.name}:\n`);
	console.log(`${targetMod.name}`);

	const allDeps = [...targetMod.publicDependencies, ...targetMod.privateDependencies];
	const projectDeps = allDeps.filter(d => modules.has(d.toLowerCase()));
	const engineDeps = allDeps.filter(d => !modules.has(d.toLowerCase()));

	if (projectDeps.length > 0) {
		console.log("├── Project Modules:");
		projectDeps.forEach((d, i) => {
			const prefix = i === projectDeps.length - 1 && engineDeps.length === 0 ? "└" : "├";
			console.log(`│   ${prefix}── ${d}`);
		});
	}

	if (engineDeps.length > 0) {
		console.log("└── Engine Modules:");
		engineDeps.forEach((d, i) => {
			const prefix = i === engineDeps.length - 1 ? "└" : "├";
			console.log(`    ${prefix}── ${d}`);
		});
	}

	// Find modules that depend on this module
	console.log(`\nModules depending on ${targetMod.name}:`);
	let dependentCount = 0;
	for (const [, mod] of modules) {
		const allModDeps = [...mod.publicDependencies, ...mod.privateDependencies];
		if (allModDeps.some(d => d.toLowerCase() === moduleName.toLowerCase())) {
			console.log(`  ${mod.name}`);
			dependentCount++;
		}
	}
	if (dependentCount === 0) {
		console.log("  (none)");
	}
}

// List plugins
function listPlugins(projectRoot) {
	const uprojectPath = findUProject();
	if (!uprojectPath) {
		console.error("✗ No .uproject file found");
		process.exit(1);
	}

	const project = parseUProject(uprojectPath);
	if (!project) {
		console.error("✗ Failed to parse .uproject file");
		process.exit(1);
	}

	console.log(`Project: ${basename(uprojectPath).replace(".uproject", "")}\n`);

	if (project.Plugins && project.Plugins.length > 0) {
		console.log("Enabled Plugins:");
		const enabled = project.Plugins.filter(p => p.Enabled !== false);
		enabled.forEach(p => console.log(`  ${p.Name}`));

		const disabled = project.Plugins.filter(p => p.Enabled === false);
		if (disabled.length > 0) {
			console.log("\nDisabled Plugins:");
			disabled.forEach(p => console.log(`  ${p.Name}`));
		}
	}

	// Check Plugins folder
	const pluginsDir = join(projectRoot, "Plugins");
	if (existsSync(pluginsDir)) {
		console.log("\nLocal Plugins (in Plugins/):");
		try {
			const entries = readdirSync(pluginsDir);
			for (const entry of entries) {
				const pluginPath = join(pluginsDir, entry);
				if (statSync(pluginPath).isDirectory()) {
					const upluginPath = join(pluginPath, `${entry}.uplugin`);
					if (existsSync(upluginPath)) {
						console.log(`  ${entry}`);
					}
				}
			}
		} catch {}
	}
}

// Main
const uprojectPath = findUProject();
if (!uprojectPath) {
	console.error("✗ No .uproject file found");
	console.error("Make sure you're in an Unreal project directory.");
	process.exit(1);
}

const projectRoot = dirname(uprojectPath);

switch (command) {
	case "list":
		listModules(projectRoot);
		break;
	case "info":
		if (!args[1]) {
			console.error("✗ Module name required");
			usage();
		}
		showModuleInfo(projectRoot, args[1]);
		break;
	case "deps":
		if (!args[1]) {
			console.error("✗ Module name required");
			usage();
		}
		showDependencyGraph(projectRoot, args[1]);
		break;
	case "plugins":
		listPlugins(projectRoot);
		break;
	default:
		usage();
}
