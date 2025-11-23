#!/usr/bin/env node

/**
 * Analyzes Unity C# MonoBehaviour and Component scripts
 * Extracts fields, properties, methods, and Unity lifecycle methods
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join, basename, dirname } from "node:path";
import { execSync } from "node:child_process";
import { platform } from "node:os";

const args = process.argv.slice(2);
const searchTerm = args[0];

if (!searchTerm) {
	console.log("Usage: unity-component.js <ComponentName|FilePath>");
	console.log("\nAnalyzes Unity C# component/script definitions.");
	console.log("\nExamples:");
	console.log("  unity-component.js PlayerController");
	console.log("  unity-component.js PlayerController.cs");
	console.log("  unity-component.js Assets/Scripts/Player/PlayerController.cs");
	process.exit(1);
}

const UNITY_LIFECYCLE = [
	"Awake", "OnEnable", "Start", "FixedUpdate", "Update", "LateUpdate",
	"OnDisable", "OnDestroy", "OnApplicationQuit", "OnApplicationPause",
	"OnTriggerEnter", "OnTriggerStay", "OnTriggerExit",
	"OnTriggerEnter2D", "OnTriggerStay2D", "OnTriggerExit2D",
	"OnCollisionEnter", "OnCollisionStay", "OnCollisionExit",
	"OnCollisionEnter2D", "OnCollisionStay2D", "OnCollisionExit2D",
	"OnMouseDown", "OnMouseUp", "OnMouseEnter", "OnMouseExit", "OnMouseOver",
	"OnBecameVisible", "OnBecameInvisible",
	"OnGUI", "OnDrawGizmos", "OnDrawGizmosSelected",
	"OnValidate", "Reset",
];

const UNITY_ATTRIBUTES = [
	"SerializeField", "HideInInspector", "Header", "Space", "Tooltip",
	"Range", "Min", "Max", "TextArea", "Multiline",
	"RequireComponent", "DisallowMultipleComponent", "ExecuteInEditMode",
	"ExecuteAlways", "AddComponentMenu", "CreateAssetMenu",
];

// Find file by class name or path
function findClassFile(search) {
	if (search.endsWith(".cs")) {
		const resolved = resolve(search);
		if (existsSync(resolved)) return resolved;
	}

	const isWin = platform() === "win32";
	const filename = search.endsWith(".cs") ? search : `${search}.cs`;

	try {
		let cmd;
		if (isWin) {
			cmd = `where /r . ${basename(filename)} 2>nul`;
		} else {
			cmd = `find . -name "${basename(filename)}" -type f 2>/dev/null | head -5`;
		}
		const result = execSync(cmd, { encoding: "utf-8", cwd: process.cwd() }).trim();
		if (result) {
			const files = result.split("\n").filter(f => f.endsWith(".cs"));
			if (files.length > 0) return resolve(files[0]);
		}
	} catch {}

	return null;
}

// Parse C# class file
function parseClassFile(filePath) {
	const content = readFileSync(filePath, "utf-8");

	const result = {
		file: filePath,
		namespace: null,
		usings: [],
		classes: [],
	};

	// Extract namespace
	const nsMatch = content.match(/namespace\s+([\w.]+)/);
	if (nsMatch) {
		result.namespace = nsMatch[1];
	}

	// Extract usings
	const usingRegex = /using\s+([\w.]+);/g;
	let match;
	while ((match = usingRegex.exec(content)) !== null) {
		result.usings.push(match[1]);
	}

	// Extract classes
	const classRegex = /(?:\[([^\]]+)\]\s*)*(?:public|private|internal|protected)?\s*(?:abstract|sealed|partial)?\s*class\s+(\w+)(?:<[^>]+>)?\s*(?::\s*([^{]+))?/g;

	while ((match = classRegex.exec(content)) !== null) {
		const attributes = match[1] ? parseAttributes(match[1]) : [];
		const className = match[2];
		const inheritance = match[3] ? match[3].split(",").map(s => s.trim()) : [];

		const classInfo = {
			name: className,
			attributes: attributes,
			parent: inheritance[0] || null,
			interfaces: inheritance.slice(1),
			fields: [],
			properties: [],
			methods: [],
			lifecycleMethods: [],
		};

		// Find class body
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

		// Extract fields with attributes
		const fieldRegex = /(?:\[([^\]]+)\]\s*)*(?:public|private|protected|internal)?\s*(?:static|readonly|const)?\s*([\w<>\[\],\s]+?)\s+(\w+)\s*(?:=\s*[^;]+)?;/g;

		while ((match = fieldRegex.exec(classBody)) !== null) {
			const fieldAttrs = match[1] ? parseAttributes(match[1]) : [];
			const fieldType = match[2].trim();
			const fieldName = match[3];

			// Skip if it looks like a method or property
			if (fieldType.includes("(") || fieldType === "void") continue;

			const isSerializable = fieldAttrs.some(a => a.name === "SerializeField") ||
				classBody.includes(`public ${fieldType} ${fieldName}`);

			classInfo.fields.push({
				name: fieldName,
				type: fieldType,
				attributes: fieldAttrs,
				serializable: isSerializable,
			});
		}

		// Extract properties
		const propRegex = /(?:public|private|protected)\s+(?:static\s+)?([\w<>\[\],\s]+?)\s+(\w+)\s*\{\s*(?:get|set)/g;

		while ((match = propRegex.exec(classBody)) !== null) {
			const propType = match[1].trim();
			const propName = match[2];

			classInfo.properties.push({
				name: propName,
				type: propType,
			});
		}

		// Extract methods
		const methodRegex = /(?:\[([^\]]+)\]\s*)*(?:public|private|protected|internal)?\s*(?:static|virtual|override|abstract|async)?\s*(?:static|virtual|override|abstract|async)?\s*([\w<>\[\],\s]+?)\s+(\w+)\s*\(([^)]*)\)/g;

		while ((match = methodRegex.exec(classBody)) !== null) {
			const methodAttrs = match[1] ? parseAttributes(match[1]) : [];
			const returnType = match[2].trim();
			const methodName = match[3];
			const params = match[4].trim();

			// Skip constructors
			if (methodName === className) continue;

			const isLifecycle = UNITY_LIFECYCLE.includes(methodName);

			const methodInfo = {
				name: methodName,
				returnType: returnType,
				params: params,
				attributes: methodAttrs,
			};

			if (isLifecycle) {
				classInfo.lifecycleMethods.push(methodInfo);
			} else {
				classInfo.methods.push(methodInfo);
			}
		}

		result.classes.push(classInfo);
	}

	return result;
}

// Parse attributes string
function parseAttributes(attrString) {
	const attrs = [];
	const attrRegex = /(\w+)(?:\s*\(([^)]*)\))?/g;
	let match;

	while ((match = attrRegex.exec(attrString)) !== null) {
		attrs.push({
			name: match[1],
			args: match[2] || null,
		});
	}

	return attrs;
}

// Format output
function formatOutput(data) {
	console.log(`File: ${data.file}`);
	if (data.namespace) {
		console.log(`Namespace: ${data.namespace}`);
	}
	console.log();

	for (const cls of data.classes) {
		// Class header
		let classLine = `class ${cls.name}`;
		if (cls.parent) {
			classLine += ` : ${cls.parent}`;
		}
		if (cls.interfaces.length > 0) {
			classLine += `, ${cls.interfaces.join(", ")}`;
		}
		console.log(classLine);

		if (cls.attributes.length > 0) {
			const relevantAttrs = cls.attributes.filter(a => UNITY_ATTRIBUTES.includes(a.name));
			if (relevantAttrs.length > 0) {
				console.log(`  Attributes: ${relevantAttrs.map(a => a.name).join(", ")}`);
			}
		}

		// Serialized fields (most important for Unity)
		const serializedFields = cls.fields.filter(f => f.serializable);
		if (serializedFields.length > 0) {
			console.log("\n  Serialized Fields (Inspector):");
			for (const field of serializedFields) {
				const attrs = field.attributes.filter(a =>
					["Header", "Tooltip", "Range", "Min", "Max"].includes(a.name)
				);
				let line = `    ${field.type} ${field.name}`;
				if (attrs.length > 0) {
					line += ` [${attrs.map(a => a.args ? `${a.name}(${a.args})` : a.name).join(", ")}]`;
				}
				console.log(line);
			}
		}

		// Private fields
		const privateFields = cls.fields.filter(f => !f.serializable);
		if (privateFields.length > 0) {
			console.log("\n  Private Fields:");
			for (const field of privateFields) {
				console.log(`    ${field.type} ${field.name}`);
			}
		}

		// Properties
		if (cls.properties.length > 0) {
			console.log("\n  Properties:");
			for (const prop of cls.properties) {
				console.log(`    ${prop.type} ${prop.name}`);
			}
		}

		// Lifecycle methods
		if (cls.lifecycleMethods.length > 0) {
			console.log("\n  Unity Lifecycle:");
			for (const method of cls.lifecycleMethods) {
				console.log(`    ${method.name}()`);
			}
		}

		// Public methods
		const publicMethods = cls.methods.filter(m =>
			!m.name.startsWith("_") && !m.name.startsWith("On")
		);
		if (publicMethods.length > 0) {
			console.log("\n  Methods:");
			for (const method of publicMethods) {
				console.log(`    ${method.returnType} ${method.name}(${method.params})`);
			}
		}

		console.log();
	}
}

// Main
const filePath = findClassFile(searchTerm);

if (!filePath) {
	console.error(`✗ Could not find class or file: ${searchTerm}`);
	console.error("\nMake sure you're in the Unity project directory.");
	process.exit(1);
}

const data = parseClassFile(filePath);
formatOutput(data);
