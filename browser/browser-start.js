#!/usr/bin/env node

import { spawn, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { platform } from "node:os";
import puppeteer from "puppeteer-core";

const useProfile = process.argv[2] === "--profile";

if (process.argv[2] && process.argv[2] !== "--profile") {
	console.log("Usage: browser-start.js [--profile]");
	console.log("\nOptions:");
	console.log("  --profile  Copy your default Chrome profile (cookies, logins)");
	console.log("\nExamples:");
	console.log("  browser-start.js            # Start with fresh profile");
	console.log("  browser-start.js --profile  # Start with your Chrome profile");
	process.exit(1);
}

// Detect OS and find Chrome executable
function findChrome() {
	const os = platform();

	if (os === "darwin") {
		// macOS
		const paths = [
			"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
			"/Applications/Chromium.app/Contents/MacOS/Chromium",
		];
		for (const p of paths) {
			if (existsSync(p)) return p;
		}
	} else if (os === "linux") {
		// Linux - check common paths and commands
		const paths = [
			"/usr/bin/google-chrome",
			"/usr/bin/google-chrome-stable",
			"/usr/bin/chromium",
			"/usr/bin/chromium-browser",
			"/snap/bin/chromium",
			"/usr/bin/brave-browser",
		];
		for (const p of paths) {
			if (existsSync(p)) return p;
		}
		// Try to find via which
		try {
			const result = execSync("which google-chrome chromium chromium-browser 2>/dev/null | head -1", { encoding: "utf-8" }).trim();
			if (result) return result;
		} catch {}
	} else if (os === "win32") {
		// Windows
		const paths = [
			process.env["PROGRAMFILES"] + "\\Google\\Chrome\\Application\\chrome.exe",
			process.env["PROGRAMFILES(X86)"] + "\\Google\\Chrome\\Application\\chrome.exe",
			process.env["LOCALAPPDATA"] + "\\Google\\Chrome\\Application\\chrome.exe",
		];
		for (const p of paths) {
			if (existsSync(p)) return p;
		}
	}

	return null;
}

// Get default Chrome profile path for --profile option
function getDefaultProfilePath() {
	const os = platform();
	const home = process.env["HOME"] || process.env["USERPROFILE"];

	if (os === "darwin") {
		return `${home}/Library/Application Support/Google/Chrome/`;
	} else if (os === "linux") {
		return `${home}/.config/google-chrome/`;
	} else if (os === "win32") {
		return `${process.env["LOCALAPPDATA"]}\\Google\\Chrome\\User Data\\`;
	}
	return null;
}

// Kill existing Chrome processes
function killChrome() {
	const os = platform();
	try {
		if (os === "darwin") {
			execSync("killall 'Google Chrome' 2>/dev/null", { stdio: "ignore" });
		} else if (os === "linux") {
			execSync("pkill -f '(chrome|chromium)' 2>/dev/null", { stdio: "ignore" });
		} else if (os === "win32") {
			execSync("taskkill /F /IM chrome.exe 2>nul", { stdio: "ignore" });
		}
	} catch {}
}

const chromePath = findChrome();
if (!chromePath) {
	console.error("✗ Chrome/Chromium not found. Please install Chrome or Chromium.");
	console.error("\nOn Linux, you can install with:");
	console.error("  sudo apt install chromium-browser  # Debian/Ubuntu");
	console.error("  sudo dnf install chromium          # Fedora");
	console.error("  sudo pacman -S chromium            # Arch");
	process.exit(1);
}

// Kill existing Chrome
killChrome();

// Wait a bit for processes to fully die
await new Promise((r) => setTimeout(r, 1000));

// Setup profile directory
execSync("mkdir -p ~/.cache/scraping", { stdio: "ignore" });

if (useProfile) {
	const profilePath = getDefaultProfilePath();
	if (profilePath && existsSync(profilePath)) {
		// Sync profile with rsync (much faster on subsequent runs)
		execSync(
			`rsync -a --delete "${profilePath}" ~/.cache/scraping/`,
			{ stdio: "pipe" },
		);
	} else {
		console.error("✗ Default Chrome profile not found at:", profilePath);
		process.exit(1);
	}
}

// Start Chrome in background (detached so Node can exit)
spawn(
	chromePath,
	[
		"--remote-debugging-port=9222",
		`--user-data-dir=${process.env["HOME"]}/.cache/scraping`,
		"--no-first-run",
		"--no-default-browser-check",
	],
	{ detached: true, stdio: "ignore" },
).unref();

// Wait for Chrome to be ready by attempting to connect
let connected = false;
for (let i = 0; i < 30; i++) {
	try {
		const browser = await puppeteer.connect({
			browserURL: "http://localhost:9222",
			defaultViewport: null,
		});
		await browser.disconnect();
		connected = true;
		break;
	} catch {
		await new Promise((r) => setTimeout(r, 500));
	}
}

if (!connected) {
	console.error("✗ Failed to connect to Chrome");
	process.exit(1);
}

console.log(`✓ Chrome started on :9222${useProfile ? " with your profile" : ""}`);
