#!/usr/bin/env node

/**
 * Finds and analyzes Unreal Engine Subsystems in the project
 * Detects GameInstance, World, LocalPlayer, and Engine subsystems
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join, basename, dirname } from "node:path";
import { execSync } from "node:child_process";
import { platform } from "node:os";

const args = process.argv.slice(2);
const command = args[0];

function usage() {
	console.log("Usage: unreal-subsystem.js [command]");
	console.log("\nCommands:");
	console.log("  list                    List all subsystems in project");
	console.log("  info <SubsystemName>    Show subsystem details");
	console.log("\nExamples:");
	console.log("  unreal-subsystem.js list");
	console.log("  unreal-subsystem.js info UMyGameSubsystem");
	process.exit(1);
}

const SUBSYSTEM_TYPES = {
	"UGameInstanceSubsystem": "GameInstance",
	"UWorldSubsystem": "World",
	"ULocalPlayerSubsystem": "LocalPlayer",
	"UEngineSubsystem": "Engine",
	"UEditorSubsystem": "Editor",
};

// Find project source directory
function findSourceDir() {
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
			if (files[0]) {
				return join(dirname(resolve(files[0])), "Source");
			}
		}
	} catch {}

	// Fallback to local Source
	if (existsSync("Source")) return resolve("Source");
	return null;
}

// Find all header files
function findHeaderFiles(dir) {
	const headers = [];

	function scanDir(d) {
		if (!existsSync(d)) return;
		try {
			const entries = readdirSync(d);
			for (const entry of entries) {
				const fullPath = join(d, entry);
				try {
					const stat = statSync(fullPath);
					if (stat.isDirectory()) {
						scanDir(fullPath);
					} else if (entry.endsWith(".h")) {
						headers.push(fullPath);
					}
				} catch {}
			}
		} catch {}
	}

	scanDir(dir);
	return headers;
}

// Parse subsystem from header file
function parseSubsystem(filePath) {
	const content = readFileSync(filePath, "utf-8");

	// Check for subsystem inheritance
	const classMatch = content.match(
		/UCLASS\s*\([^)]*\)\s*class\s+(?:\w+_API\s+)?(\w+)\s*:\s*public\s+(\w+Subsystem)/
	);

	if (!classMatch) return null;

	const className = classMatch[1];
	const parentClass = classMatch[2];

	// Determine subsystem type
	let subsystemType = "Custom";
	for (const [base, type] of Object.entries(SUBSYSTEM_TYPES)) {
		if (parentClass === base || parentClass.includes(type)) {
			subsystemType = type;
			break;
		}
	}

	const result = {
		name: className,
		parent: parentClass,
		type: subsystemType,
		file: filePath,
		functions: [],
		properties: [],
		overrides: [],
	};

	// Find class body
	const classStart = classMatch.index;
	let braceCount = 0;
	let inClass = false;
	let classEnd = content.length;

	for (let i = classStart; i < content.length; i++) {
		if (content[i] === "{") {
			braceCount++;
			inClass = true;
		} else if (content[i] === "}") {
			braceCount--;
			if (inClass && braceCount === 0) {
				classEnd = i;
				break;
			}
		}
	}

	const classBody = content.substring(classStart, classEnd);

	// Extract UFUNCTION
	const funcRegex = /UFUNCTION\s*\([^)]*\)\s*(?:virtual\s+)?([^(]+)\(([^)]*)\)/g;
	let match;
	while ((match = funcRegex.exec(classBody)) !== null) {
		const returnAndName = match[1].trim().split(/\s+/);
		const funcName = returnAndName[returnAndName.length - 1];
		const returnType = returnAndName.slice(0, -1).join(" ") || "void";

		result.functions.push({
			name: funcName,
			returnType: returnType,
			params: match[2].trim(),
		});
	}

	// Extract UPROPERTY
	const propRegex = /UPROPERTY\s*\([^)]*\)\s*([^;]+);/g;
	while ((match = propRegex.exec(classBody)) !== null) {
		const propLine = match[1].trim();
		const parts = propLine.split(/\s+/);
		const propName = parts[parts.length - 1].replace(/[*&]/g, "");
		const propType = parts.slice(0, -1).join(" ");

		result.properties.push({
			name: propName,
			type: propType,
		});
	}

	// Check for common overrides
	const overridePatterns = [
		"Initialize",
		"Deinitialize",
		"ShouldCreateSubsystem",
		"Tick",
		"GetTickableGameObjectWorld",
		"GetStatId",
	];

	for (const pattern of overridePatterns) {
		if (classBody.includes(pattern) && classBody.includes("override")) {
			const overrideMatch = classBody.match(new RegExp(`virtual\\s+[^(]*${pattern}\\s*\\([^)]*\\)[^;]*override`));
			if (overrideMatch) {
				result.overrides.push(pattern);
			}
		}
	}

	return result;
}

// List all subsystems
function listSubsystems(sourceDir) {
	const headers = findHeaderFiles(sourceDir);
	const subsystems = [];

	for (const header of headers) {
		const subsystem = parseSubsystem(header);
		if (subsystem) {
			subsystems.push(subsystem);
		}
	}

	if (subsystems.length === 0) {
		console.log("No subsystems found in project.");
		console.log("\nSubsystem base classes to extend:");
		for (const [cls, type] of Object.entries(SUBSYSTEM_TYPES)) {
			console.log(`  ${cls} - ${type} subsystem`);
		}
		return;
	}

	// Group by type
	const byType = {};
	for (const sub of subsystems) {
		if (!byType[sub.type]) byType[sub.type] = [];
		byType[sub.type].push(sub);
	}

	console.log("Subsystems:\n");

	for (const [type, subs] of Object.entries(byType)) {
		console.log(`${type} Subsystems:`);
		for (const sub of subs) {
			console.log(`  ${sub.name}`);
			console.log(`    Parent: ${sub.parent}`);
			console.log(`    File: ${sub.file}`);
			if (sub.functions.length > 0) {
				console.log(`    Functions: ${sub.functions.length}`);
			}
			if (sub.overrides.length > 0) {
				console.log(`    Overrides: ${sub.overrides.join(", ")}`);
			}
		}
		console.log();
	}

	console.log(`Total: ${subsystems.length} subsystems`);
}

// Show subsystem info
function showSubsystemInfo(sourceDir, subsystemName) {
	const headers = findHeaderFiles(sourceDir);

	let foundSubsystem = null;

	for (const header of headers) {
		const subsystem = parseSubsystem(header);
		if (subsystem && subsystem.name.toLowerCase() === subsystemName.toLowerCase().replace(/^u/, "").toLowerCase()) {
			foundSubsystem = subsystem;
			break;
		}
		if (subsystem && subsystem.name.toLowerCase() === subsystemName.toLowerCase()) {
			foundSubsystem = subsystem;
			break;
		}
	}

	if (!foundSubsystem) {
		console.error(`✗ Subsystem not found: ${subsystemName}`);
		process.exit(1);
	}

	const sub = foundSubsystem;

	console.log(`Subsystem: ${sub.name}`);
	console.log(`Type: ${sub.type}`);
	console.log(`Parent: ${sub.parent}`);
	console.log(`File: ${sub.file}\n`);

	if (sub.overrides.length > 0) {
		console.log("Overridden Methods:");
		sub.overrides.forEach(o => console.log(`  ${o}()`));
		console.log();
	}

	if (sub.functions.length > 0) {
		console.log("UFUNCTION Methods:");
		for (const func of sub.functions) {
			console.log(`  ${func.returnType} ${func.name}(${func.params})`);
		}
		console.log();
	}

	if (sub.properties.length > 0) {
		console.log("UPROPERTY Members:");
		for (const prop of sub.properties) {
			console.log(`  ${prop.type} ${prop.name}`);
		}
		console.log();
	}

	// Usage hint
	console.log("Access Pattern:");
	switch (sub.type) {
		case "GameInstance":
			console.log(`  UGameInstance* GI = GetGameInstance();`);
			console.log(`  ${sub.name}* Subsystem = GI->GetSubsystem<${sub.name}>();`);
			break;
		case "World":
			console.log(`  UWorld* World = GetWorld();`);
			console.log(`  ${sub.name}* Subsystem = World->GetSubsystem<${sub.name}>();`);
			break;
		case "LocalPlayer":
			console.log(`  ULocalPlayer* LP = GetLocalPlayer();`);
			console.log(`  ${sub.name}* Subsystem = LP->GetSubsystem<${sub.name}>();`);
			break;
		case "Engine":
			console.log(`  ${sub.name}* Subsystem = GEngine->GetEngineSubsystem<${sub.name}>();`);
			break;
	}
}

// Main
const sourceDir = findSourceDir();
if (!sourceDir) {
	console.error("✗ Source directory not found");
	console.error("Make sure you're in an Unreal project directory.");
	process.exit(1);
}

switch (command) {
	case "list":
	case undefined:
		listSubsystems(sourceDir);
		break;
	case "info":
		if (!args[1]) {
			console.error("✗ Subsystem name required");
			usage();
		}
		showSubsystemInfo(sourceDir, args[1]);
		break;
	default:
		usage();
}
