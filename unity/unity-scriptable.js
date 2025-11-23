#!/usr/bin/env node

/**
 * Analyzes Unity ScriptableObject definitions
 * Finds and documents data containers and configuration assets
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join, basename, dirname } from "node:path";
import { execSync } from "node:child_process";
import { platform } from "node:os";

const args = process.argv.slice(2);
const command = args[0];

function usage() {
	console.log("Usage: unity-scriptable.js [command] [options]");
	console.log("\nCommands:");
	console.log("  list                    List all ScriptableObject types");
	console.log("  info <TypeName>         Show ScriptableObject details");
	console.log("  find <TypeName>         Find .asset files of this type");
	console.log("\nExamples:");
	console.log("  unity-scriptable.js list");
	console.log("  unity-scriptable.js info GameConfig");
	console.log("  unity-scriptable.js find WeaponData");
	process.exit(1);
}

// Find all C# files
function findCSharpFiles(startDir = ".") {
	const csFiles = [];

	function scanDir(dir) {
		if (!existsSync(dir)) return;
		const dirName = basename(dir);
		if (["Library", "Temp", "obj", "Logs", ".git", "node_modules", "Packages"].includes(dirName)) return;

		try {
			const entries = readdirSync(dir);
			for (const entry of entries) {
				const fullPath = join(dir, entry);
				try {
					const stat = statSync(fullPath);
					if (stat.isDirectory()) {
						scanDir(fullPath);
					} else if (entry.endsWith(".cs")) {
						csFiles.push(fullPath);
					}
				} catch {}
			}
		} catch {}
	}

	scanDir(startDir);
	return csFiles;
}

// Find all .asset files
function findAssetFiles(startDir = ".") {
	const assetFiles = [];

	function scanDir(dir) {
		if (!existsSync(dir)) return;
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
					} else if (entry.endsWith(".asset")) {
						assetFiles.push(fullPath);
					}
				} catch {}
			}
		} catch {}
	}

	scanDir(startDir);
	return assetFiles;
}

// Parse ScriptableObject from C# file
function parseScriptableObject(filePath) {
	const content = readFileSync(filePath, "utf-8");

	// Check if it's a ScriptableObject
	const classMatch = content.match(
		/(?:\[([^\]]+)\]\s*)*(?:public|internal)?\s*class\s+(\w+)\s*:\s*ScriptableObject/
	);

	if (!classMatch) return null;

	const result = {
		name: classMatch[2],
		file: filePath,
		attributes: [],
		fields: [],
		menuPath: null,
		fileName: null,
	};

	// Parse attributes before class
	if (classMatch[1]) {
		const attrString = classMatch[1];

		// Check for CreateAssetMenu
		const menuMatch = attrString.match(/CreateAssetMenu\s*\(\s*([^)]+)\)/);
		if (menuMatch) {
			const menuArgs = menuMatch[1];
			const menuNameMatch = menuArgs.match(/menuName\s*=\s*"([^"]+)"/);
			const fileNameMatch = menuArgs.match(/fileName\s*=\s*"([^"]+)"/);

			if (menuNameMatch) result.menuPath = menuNameMatch[1];
			if (fileNameMatch) result.fileName = fileNameMatch[1];
		}

		// Other attributes
		const attrRegex = /(\w+)(?:\s*\([^)]*\))?/g;
		let match;
		while ((match = attrRegex.exec(attrString)) !== null) {
			if (match[1] !== "CreateAssetMenu") {
				result.attributes.push(match[1]);
			}
		}
	}

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

	// Extract serialized fields
	const fieldRegex = /(?:\[([^\]]+)\]\s*)*(?:public|private|protected)?\s*([\w<>\[\],\s]+?)\s+(\w+)\s*(?:=\s*[^;]+)?;/g;

	while ((match = fieldRegex.exec(classBody)) !== null) {
		const fieldAttrs = match[1] || "";
		const fieldType = match[2].trim();
		const fieldName = match[3];

		// Skip methods or properties
		if (fieldType.includes("(") || fieldType === "void" || fieldType === "class") continue;

		// Check if serializable
		const isSerializable = fieldAttrs.includes("SerializeField") ||
			classBody.includes(`public ${fieldType} ${fieldName}`);

		if (!isSerializable) continue;

		// Parse field attributes
		const attrs = [];
		const headerMatch = fieldAttrs.match(/Header\s*\(\s*"([^"]+)"\s*\)/);
		const tooltipMatch = fieldAttrs.match(/Tooltip\s*\(\s*"([^"]+)"\s*\)/);
		const rangeMatch = fieldAttrs.match(/Range\s*\(\s*([^)]+)\s*\)/);

		if (headerMatch) attrs.push(`Header: ${headerMatch[1]}`);
		if (tooltipMatch) attrs.push(`Tooltip: ${tooltipMatch[1]}`);
		if (rangeMatch) attrs.push(`Range: ${rangeMatch[1]}`);

		result.fields.push({
			name: fieldName,
			type: fieldType,
			attributes: attrs,
		});
	}

	return result;
}

// List all ScriptableObjects
function listScriptableObjects() {
	const csFiles = findCSharpFiles();
	const scriptables = [];

	for (const file of csFiles) {
		const so = parseScriptableObject(file);
		if (so) scriptables.push(so);
	}

	if (scriptables.length === 0) {
		console.log("No ScriptableObject types found.");
		console.log("\nTo create a ScriptableObject:");
		console.log("  [CreateAssetMenu(menuName = \"MyGame/MyData\")]");
		console.log("  public class MyData : ScriptableObject { }");
		return;
	}

	scriptables.sort((a, b) => a.name.localeCompare(b.name));

	console.log("ScriptableObject Types:\n");

	for (const so of scriptables) {
		console.log(`  ${so.name}`);
		if (so.menuPath) {
			console.log(`    Menu: ${so.menuPath}`);
		}
		console.log(`    Fields: ${so.fields.length}`);
		console.log(`    File: ${so.file}`);
		console.log();
	}

	console.log(`Total: ${scriptables.length} types`);
}

// Show ScriptableObject info
function showInfo(typeName) {
	const csFiles = findCSharpFiles();

	let found = null;
	for (const file of csFiles) {
		const so = parseScriptableObject(file);
		if (so && so.name.toLowerCase() === typeName.toLowerCase()) {
			found = so;
			break;
		}
	}

	if (!found) {
		console.error(`✗ ScriptableObject not found: ${typeName}`);
		process.exit(1);
	}

	console.log(`ScriptableObject: ${found.name}`);
	console.log(`File: ${found.file}`);

	if (found.menuPath) {
		console.log(`Create Menu: Assets > Create > ${found.menuPath}`);
	}

	if (found.fileName) {
		console.log(`Default Filename: ${found.fileName}`);
	}

	if (found.attributes.length > 0) {
		console.log(`Attributes: ${found.attributes.join(", ")}`);
	}

	if (found.fields.length > 0) {
		console.log("\nSerialized Fields:");

		let currentHeader = null;
		for (const field of found.fields) {
			const headerAttr = field.attributes.find(a => a.startsWith("Header:"));
			if (headerAttr) {
				currentHeader = headerAttr.replace("Header: ", "");
				console.log(`\n  [${currentHeader}]`);
			}

			let line = `    ${field.type} ${field.name}`;

			const tooltip = field.attributes.find(a => a.startsWith("Tooltip:"));
			const range = field.attributes.find(a => a.startsWith("Range:"));

			const extras = [];
			if (range) extras.push(range);
			if (tooltip) extras.push(tooltip.replace("Tooltip: ", ""));

			if (extras.length > 0) {
				line += ` // ${extras.join(", ")}`;
			}

			console.log(line);
		}
	}

	// Try to find instances
	const assets = findAssetFiles();
	const instances = [];

	for (const assetPath of assets) {
		try {
			const content = readFileSync(assetPath, "utf-8");
			// Unity YAML format check
			if (content.includes(`m_Script:`) && content.includes(found.name)) {
				instances.push(assetPath);
			}
		} catch {}
	}

	if (instances.length > 0) {
		console.log(`\nInstances (${instances.length}):`);
		instances.slice(0, 10).forEach(i => console.log(`  ${i}`));
		if (instances.length > 10) {
			console.log(`  ... and ${instances.length - 10} more`);
		}
	}
}

// Find asset instances
function findInstances(typeName) {
	const csFiles = findCSharpFiles();

	let found = null;
	for (const file of csFiles) {
		const so = parseScriptableObject(file);
		if (so && so.name.toLowerCase() === typeName.toLowerCase()) {
			found = so;
			break;
		}
	}

	if (!found) {
		console.error(`✗ ScriptableObject not found: ${typeName}`);
		process.exit(1);
	}

	const assets = findAssetFiles();
	const instances = [];

	for (const assetPath of assets) {
		try {
			const content = readFileSync(assetPath, "utf-8");
			if (content.includes(`m_Script:`) && content.includes(found.name)) {
				instances.push(assetPath);
			}
		} catch {}
	}

	console.log(`Asset instances of ${found.name}:\n`);

	if (instances.length === 0) {
		console.log("No instances found.");
		if (found.menuPath) {
			console.log(`\nCreate via: Assets > Create > ${found.menuPath}`);
		}
		return;
	}

	// Group by directory
	const byDir = new Map();
	for (const inst of instances) {
		const dir = dirname(inst);
		if (!byDir.has(dir)) byDir.set(dir, []);
		byDir.get(dir).push(basename(inst));
	}

	for (const [dir, files] of byDir) {
		console.log(`${dir}/`);
		files.sort().forEach(f => console.log(`  ${f}`));
		console.log();
	}

	console.log(`Total: ${instances.length} instances`);
}

// Main
switch (command) {
	case "list":
	case undefined:
		listScriptableObjects();
		break;
	case "info":
		if (!args[1]) {
			console.error("✗ Type name required");
			usage();
		}
		showInfo(args[1]);
		break;
	case "find":
		if (!args[1]) {
			console.error("✗ Type name required");
			usage();
		}
		findInstances(args[1]);
		break;
	default:
		usage();
}
