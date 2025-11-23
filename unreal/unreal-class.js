#!/usr/bin/env node

/**
 * Analyzes Unreal Engine C++ class files
 * Extracts UCLASS, USTRUCT, UENUM definitions with properties and functions
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, basename, dirname } from "node:path";
import { execSync } from "node:child_process";
import { platform } from "node:os";

const args = process.argv.slice(2);
const searchTerm = args[0];

if (!searchTerm) {
	console.log("Usage: unreal-class.js <ClassName|FilePath>");
	console.log("\nAnalyzes Unreal C++ class definitions.");
	console.log("\nExamples:");
	console.log("  unreal-class.js AMyCharacter");
	console.log("  unreal-class.js MyCharacter.h");
	console.log("  unreal-class.js Source/MyGame/Player/MyCharacter.h");
	process.exit(1);
}

// Find file by class name or path
function findClassFile(search) {
	// If it's a direct path
	if (search.endsWith(".h") || search.endsWith(".cpp")) {
		const resolved = resolve(search);
		if (existsSync(resolved)) return resolved;
	}

	// Search for header file
	const className = search.replace(/^[AUF]/, ""); // Remove prefix
	const patterns = [
		`${search}.h`,
		`${className}.h`,
		`**/Source/**/${search}.h`,
		`**/Source/**/${className}.h`,
	];

	const isWin = platform() === "win32";

	for (const pattern of patterns) {
		try {
			let cmd;
			if (isWin) {
				cmd = `where /r . ${basename(pattern)} 2>nul`;
			} else {
				cmd = `find . -name "${basename(pattern)}" -type f 2>/dev/null | head -5`;
			}
			const result = execSync(cmd, { encoding: "utf-8", cwd: process.cwd() }).trim();
			if (result) {
				const files = result.split("\n").filter(f => f.endsWith(".h"));
				if (files.length > 0) return resolve(files[0]);
			}
		} catch {}
	}

	return null;
}

// Parse UPROPERTY specifiers
function parseSpecifiers(specStr) {
	if (!specStr) return [];
	const specs = [];
	let depth = 0;
	let current = "";

	for (const char of specStr) {
		if (char === "(") depth++;
		else if (char === ")") depth--;
		else if (char === "," && depth === 0) {
			if (current.trim()) specs.push(current.trim());
			current = "";
			continue;
		}
		current += char;
	}
	if (current.trim()) specs.push(current.trim());

	return specs;
}

// Parse class file
function parseClassFile(filePath) {
	const content = readFileSync(filePath, "utf-8");
	const lines = content.split("\n");
	const result = {
		file: filePath,
		includes: [],
		classes: [],
		structs: [],
		enums: [],
	};

	// Extract includes
	const includeRegex = /#include\s+["<]([^">]+)[">]/g;
	let match;
	while ((match = includeRegex.exec(content)) !== null) {
		result.includes.push(match[1]);
	}

	// Extract UCLASS
	const classRegex = /UCLASS\s*\(([^)]*)\)\s*class\s+(?:\w+_API\s+)?(\w+)\s*(?::\s*public\s+(\w+))?/g;
	while ((match = classRegex.exec(content)) !== null) {
		const classInfo = {
			name: match[2],
			parent: match[3] || null,
			specifiers: parseSpecifiers(match[1]),
			properties: [],
			functions: [],
		};

		// Find class body and extract members
		const classStart = match.index;
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

		// Extract UPROPERTY
		const propRegex = /UPROPERTY\s*\(([^)]*)\)\s*([^;]+);/g;
		while ((match = propRegex.exec(classBody)) !== null) {
			const propLine = match[2].trim();
			const parts = propLine.split(/\s+/);
			const propName = parts[parts.length - 1].replace(/[*&]/g, "");
			const propType = parts.slice(0, -1).join(" ");

			classInfo.properties.push({
				name: propName,
				type: propType,
				specifiers: parseSpecifiers(match[1]),
			});
		}

		// Extract UFUNCTION
		const funcRegex = /UFUNCTION\s*\(([^)]*)\)\s*(?:virtual\s+)?([^(]+)\(([^)]*)\)/g;
		while ((match = funcRegex.exec(classBody)) !== null) {
			const returnAndName = match[2].trim().split(/\s+/);
			const funcName = returnAndName[returnAndName.length - 1];
			const returnType = returnAndName.slice(0, -1).join(" ") || "void";

			classInfo.functions.push({
				name: funcName,
				returnType: returnType,
				params: match[3].trim(),
				specifiers: parseSpecifiers(match[1]),
			});
		}

		result.classes.push(classInfo);
	}

	// Extract USTRUCT
	const structRegex = /USTRUCT\s*\(([^)]*)\)\s*struct\s+(?:\w+_API\s+)?(\w+)/g;
	while ((match = structRegex.exec(content)) !== null) {
		const structInfo = {
			name: match[2],
			specifiers: parseSpecifiers(match[1]),
			properties: [],
		};

		// Find struct body
		const structStart = match.index;
		let braceCount = 0;
		let inStruct = false;
		let structEnd = content.length;

		for (let i = structStart; i < content.length; i++) {
			if (content[i] === "{") {
				braceCount++;
				inStruct = true;
			} else if (content[i] === "}") {
				braceCount--;
				if (inStruct && braceCount === 0) {
					structEnd = i;
					break;
				}
			}
		}

		const structBody = content.substring(structStart, structEnd);

		// Extract UPROPERTY
		const propRegex = /UPROPERTY\s*\(([^)]*)\)\s*([^;]+);/g;
		while ((match = propRegex.exec(structBody)) !== null) {
			const propLine = match[2].trim();
			const parts = propLine.split(/\s+/);
			const propName = parts[parts.length - 1].replace(/[*&]/g, "");
			const propType = parts.slice(0, -1).join(" ");

			structInfo.properties.push({
				name: propName,
				type: propType,
				specifiers: parseSpecifiers(match[1]),
			});
		}

		result.structs.push(structInfo);
	}

	// Extract UENUM
	const enumRegex = /UENUM\s*\(([^)]*)\)\s*enum\s+(?:class\s+)?(\w+)/g;
	while ((match = enumRegex.exec(content)) !== null) {
		const enumInfo = {
			name: match[2],
			specifiers: parseSpecifiers(match[1]),
			values: [],
		};

		// Find enum body
		const enumStart = content.indexOf("{", match.index);
		const enumEnd = content.indexOf("}", enumStart);
		const enumBody = content.substring(enumStart + 1, enumEnd);

		// Extract values (simplified)
		const valueRegex = /(\w+)\s*(?:=\s*[^,}]+)?(?:UMETA\s*\([^)]*\))?/g;
		while ((match = valueRegex.exec(enumBody)) !== null) {
			if (match[1] && !match[1].startsWith("UMETA")) {
				enumInfo.values.push(match[1]);
			}
		}

		result.enums.push(enumInfo);
	}

	return result;
}

// Format output
function formatOutput(data) {
	console.log(`File: ${data.file}\n`);

	if (data.includes.length > 0) {
		console.log("Includes:");
		data.includes.slice(0, 10).forEach(inc => console.log(`  ${inc}`));
		if (data.includes.length > 10) {
			console.log(`  ... and ${data.includes.length - 10} more`);
		}
		console.log();
	}

	for (const cls of data.classes) {
		console.log(`UCLASS: ${cls.name}${cls.parent ? ` : ${cls.parent}` : ""}`);
		if (cls.specifiers.length > 0) {
			console.log(`  Specifiers: ${cls.specifiers.join(", ")}`);
		}

		if (cls.properties.length > 0) {
			console.log("\n  Properties:");
			for (const prop of cls.properties) {
				const specs = prop.specifiers.filter(s =>
					s.includes("Blueprint") || s.includes("Replicated") || s.includes("Edit")
				).join(", ");
				console.log(`    ${prop.type} ${prop.name}${specs ? ` [${specs}]` : ""}`);
			}
		}

		if (cls.functions.length > 0) {
			console.log("\n  Functions:");
			for (const func of cls.functions) {
				const specs = func.specifiers.filter(s =>
					s.includes("Blueprint") || s.includes("Server") || s.includes("Client")
				).join(", ");
				console.log(`    ${func.returnType} ${func.name}(${func.params})${specs ? ` [${specs}]` : ""}`);
			}
		}
		console.log();
	}

	for (const struct of data.structs) {
		console.log(`USTRUCT: ${struct.name}`);
		if (struct.specifiers.length > 0) {
			console.log(`  Specifiers: ${struct.specifiers.join(", ")}`);
		}
		if (struct.properties.length > 0) {
			console.log("  Properties:");
			for (const prop of struct.properties) {
				console.log(`    ${prop.type} ${prop.name}`);
			}
		}
		console.log();
	}

	for (const enumDef of data.enums) {
		console.log(`UENUM: ${enumDef.name}`);
		if (enumDef.values.length > 0) {
			console.log(`  Values: ${enumDef.values.join(", ")}`);
		}
		console.log();
	}
}

// Main
const filePath = findClassFile(searchTerm);

if (!filePath) {
	console.error(`✗ Could not find class or file: ${searchTerm}`);
	console.error("\nMake sure you're in the project root directory.");
	process.exit(1);
}

const data = parseClassFile(filePath);
formatOutput(data);
