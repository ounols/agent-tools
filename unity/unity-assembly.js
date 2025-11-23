#!/usr/bin/env node

/**
 * Analyzes Unity Assembly Definition files (.asmdef)
 * Shows assembly structure, dependencies, and references
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join, basename, dirname } from "node:path";
import { execSync } from "node:child_process";
import { platform } from "node:os";

const args = process.argv.slice(2);
const command = args[0];

function usage() {
	console.log("Usage: unity-assembly.js [command] [options]");
	console.log("\nCommands:");
	console.log("  list                    List all assembly definitions");
	console.log("  info <AssemblyName>     Show assembly details");
	console.log("  deps <AssemblyName>     Show dependency graph");
	console.log("  scripts <AssemblyName>  List scripts in assembly");
	console.log("\nExamples:");
	console.log("  unity-assembly.js list");
	console.log("  unity-assembly.js info MyGame.Core");
	console.log("  unity-assembly.js deps MyGame.Player");
	process.exit(1);
}

// Find all .asmdef files
function findAsmdefFiles(startDir = ".") {
	const asmdefFiles = [];

	function scanDir(dir) {
		if (!existsSync(dir)) return;
		// Skip common non-asset directories
		const dirName = basename(dir);
		if (["Library", "Temp", "obj", "Logs", ".git", "node_modules"].includes(dirName)) return;

		try {
			const entries = readdirSync(dir);
			for (const entry of entries) {
				const fullPath = join(dir, entry);
				try {
					const stat = statSync(fullPath);
					if (stat.isDirectory()) {
						scanDir(fullPath);
					} else if (entry.endsWith(".asmdef")) {
						asmdefFiles.push(fullPath);
					}
				} catch {}
			}
		} catch {}
	}

	scanDir(startDir);
	return asmdefFiles;
}

// Parse .asmdef file
function parseAsmdef(filePath) {
	const content = readFileSync(filePath, "utf-8");
	try {
		const data = JSON.parse(content);
		return {
			name: data.name,
			path: filePath,
			rootNamespace: data.rootNamespace || null,
			references: data.references || [],
			includePlatforms: data.includePlatforms || [],
			excludePlatforms: data.excludePlatforms || [],
			allowUnsafeCode: data.allowUnsafeCode || false,
			autoReferenced: data.autoReferenced !== false,
			defineConstraints: data.defineConstraints || [],
			versionDefines: data.versionDefines || [],
			noEngineReferences: data.noEngineReferences || false,
		};
	} catch {
		return null;
	}
}

// Find scripts in assembly directory
function findScriptsInAssembly(asmdefPath) {
	const asmdefDir = dirname(asmdefPath);
	const scripts = [];

	function scanDir(dir) {
		if (!existsSync(dir)) return;
		try {
			const entries = readdirSync(dir);
			for (const entry of entries) {
				const fullPath = join(dir, entry);
				try {
					const stat = statSync(fullPath);
					if (stat.isDirectory()) {
						// Check if subdirectory has its own asmdef
						const hasOwnAsmdef = entries.some(e => e.endsWith(".asmdef")) && dir !== asmdefDir;
						if (!hasOwnAsmdef) {
							scanDir(fullPath);
						}
					} else if (entry.endsWith(".cs")) {
						scripts.push(fullPath);
					}
				} catch {}
			}
		} catch {}
	}

	scanDir(asmdefDir);
	return scripts;
}

// List all assemblies
function listAssemblies() {
	const asmdefFiles = findAsmdefFiles();

	if (asmdefFiles.length === 0) {
		console.log("No assembly definitions found.");
		console.log("\nUnity uses Assembly Definitions to organize code into separate assemblies.");
		console.log("Create a .asmdef file in a folder to define an assembly.");
		return;
	}

	const assemblies = asmdefFiles
		.map(f => parseAsmdef(f))
		.filter(a => a !== null)
		.sort((a, b) => a.name.localeCompare(b.name));

	console.log("Assembly Definitions:\n");

	for (const asm of assemblies) {
		console.log(`  ${asm.name}`);
		console.log(`    Path: ${asm.path}`);
		if (asm.rootNamespace) {
			console.log(`    Namespace: ${asm.rootNamespace}`);
		}
		if (asm.references.length > 0) {
			console.log(`    References: ${asm.references.length}`);
		}
		if (asm.includePlatforms.length > 0) {
			console.log(`    Platforms: ${asm.includePlatforms.join(", ")}`);
		}
		if (asm.allowUnsafeCode) {
			console.log(`    Unsafe Code: Yes`);
		}
		console.log();
	}

	console.log(`Total: ${assemblies.length} assemblies`);
}

// Show assembly info
function showAssemblyInfo(assemblyName) {
	const asmdefFiles = findAsmdefFiles();
	const assemblies = asmdefFiles.map(f => parseAsmdef(f)).filter(a => a !== null);

	const asm = assemblies.find(a =>
		a.name.toLowerCase() === assemblyName.toLowerCase() ||
		a.name.toLowerCase().includes(assemblyName.toLowerCase())
	);

	if (!asm) {
		console.error(`✗ Assembly not found: ${assemblyName}`);
		console.error("\nAvailable assemblies:");
		assemblies.forEach(a => console.error(`  ${a.name}`));
		process.exit(1);
	}

	console.log(`Assembly: ${asm.name}`);
	console.log(`Path: ${asm.path}`);

	if (asm.rootNamespace) {
		console.log(`Root Namespace: ${asm.rootNamespace}`);
	}

	console.log(`Auto Referenced: ${asm.autoReferenced ? "Yes" : "No"}`);
	console.log(`Allow Unsafe Code: ${asm.allowUnsafeCode ? "Yes" : "No"}`);
	console.log(`No Engine References: ${asm.noEngineReferences ? "Yes" : "No"}`);

	if (asm.includePlatforms.length > 0) {
		console.log(`\nInclude Platforms: ${asm.includePlatforms.join(", ")}`);
	}

	if (asm.excludePlatforms.length > 0) {
		console.log(`Exclude Platforms: ${asm.excludePlatforms.join(", ")}`);
	}

	if (asm.defineConstraints.length > 0) {
		console.log(`\nDefine Constraints:`);
		asm.defineConstraints.forEach(c => console.log(`  ${c}`));
	}

	if (asm.references.length > 0) {
		console.log(`\nReferences:`);
		for (const ref of asm.references) {
			// Clean up GUID reference format
			const cleanRef = ref.replace(/^GUID:[a-f0-9]+$/, ref);
			if (ref.startsWith("GUID:")) {
				// Try to find matching assembly by path
				const matchingAsm = assemblies.find(a => {
					// This is a simplified check
					return a.path.includes(cleanRef) || a.name === cleanRef;
				});
				console.log(`  ${matchingAsm ? matchingAsm.name : ref}`);
			} else {
				console.log(`  ${ref}`);
			}
		}
	}

	// Count scripts
	const scripts = findScriptsInAssembly(asm.path);
	console.log(`\nScripts: ${scripts.length} files`);
}

// Show dependency graph
function showDependencyGraph(assemblyName) {
	const asmdefFiles = findAsmdefFiles();
	const assemblies = asmdefFiles.map(f => parseAsmdef(f)).filter(a => a !== null);
	const assemblyMap = new Map(assemblies.map(a => [a.name.toLowerCase(), a]));

	const asm = assemblies.find(a =>
		a.name.toLowerCase() === assemblyName.toLowerCase() ||
		a.name.toLowerCase().includes(assemblyName.toLowerCase())
	);

	if (!asm) {
		console.error(`✗ Assembly not found: ${assemblyName}`);
		process.exit(1);
	}

	console.log(`Dependency Graph for ${asm.name}:\n`);
	console.log(asm.name);

	// Direct dependencies
	const projectRefs = asm.references.filter(r => !r.startsWith("GUID:") && assemblyMap.has(r.toLowerCase()));
	const unityRefs = asm.references.filter(r => r.startsWith("Unity.") || r.startsWith("UnityEngine.") || r.startsWith("UnityEditor."));
	const otherRefs = asm.references.filter(r => !projectRefs.includes(r) && !unityRefs.includes(r) && !r.startsWith("GUID:"));

	if (projectRefs.length > 0) {
		console.log("├── Project Assemblies:");
		projectRefs.forEach((r, i) => {
			const prefix = i === projectRefs.length - 1 && unityRefs.length === 0 && otherRefs.length === 0 ? "└" : "├";
			console.log(`│   ${prefix}── ${r}`);
		});
	}

	if (unityRefs.length > 0) {
		console.log("├── Unity Assemblies:");
		unityRefs.forEach((r, i) => {
			const prefix = i === unityRefs.length - 1 && otherRefs.length === 0 ? "└" : "├";
			console.log(`│   ${prefix}── ${r}`);
		});
	}

	if (otherRefs.length > 0) {
		console.log("└── Other:");
		otherRefs.forEach((r, i) => {
			const prefix = i === otherRefs.length - 1 ? "└" : "├";
			console.log(`    ${prefix}── ${r}`);
		});
	}

	// Find dependents
	console.log(`\nAssemblies depending on ${asm.name}:`);
	let dependentCount = 0;
	for (const other of assemblies) {
		if (other.references.some(r => r.toLowerCase() === asm.name.toLowerCase())) {
			console.log(`  ${other.name}`);
			dependentCount++;
		}
	}
	if (dependentCount === 0) {
		console.log("  (none)");
	}
}

// List scripts in assembly
function listScripts(assemblyName) {
	const asmdefFiles = findAsmdefFiles();
	const assemblies = asmdefFiles.map(f => parseAsmdef(f)).filter(a => a !== null);

	const asm = assemblies.find(a =>
		a.name.toLowerCase() === assemblyName.toLowerCase() ||
		a.name.toLowerCase().includes(assemblyName.toLowerCase())
	);

	if (!asm) {
		console.error(`✗ Assembly not found: ${assemblyName}`);
		process.exit(1);
	}

	const scripts = findScriptsInAssembly(asm.path);

	console.log(`Scripts in ${asm.name}:\n`);

	// Group by directory
	const byDir = new Map();
	for (const script of scripts) {
		const dir = dirname(script);
		if (!byDir.has(dir)) byDir.set(dir, []);
		byDir.get(dir).push(basename(script));
	}

	for (const [dir, files] of byDir) {
		console.log(`${dir}/`);
		files.sort().forEach(f => console.log(`  ${f}`));
		console.log();
	}

	console.log(`Total: ${scripts.length} scripts`);
}

// Main
switch (command) {
	case "list":
	case undefined:
		listAssemblies();
		break;
	case "info":
		if (!args[1]) {
			console.error("✗ Assembly name required");
			usage();
		}
		showAssemblyInfo(args[1]);
		break;
	case "deps":
		if (!args[1]) {
			console.error("✗ Assembly name required");
			usage();
		}
		showDependencyGraph(args[1]);
		break;
	case "scripts":
		if (!args[1]) {
			console.error("✗ Assembly name required");
			usage();
		}
		listScripts(args[1]);
		break;
	default:
		usage();
}
