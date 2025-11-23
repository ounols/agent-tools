#!/usr/bin/env node

import { spawn, execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, cpSync } from "node:fs";
import { platform, homedir, tmpdir } from "node:os";
import { join } from "node:path";
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

const os = platform();
const home = homedir();

// Get cache directory for scraping profile
function getCacheDir() {
	if (os === "win32") {
		return join(process.env["LOCALAPPDATA"] || join(home, "AppData", "Local"), "browser-tools", "scraping");
	} else {
		return join(home, ".cache", "browser-tools", "scraping");
	}
}

// Detect OS and find Chrome executable
function findChrome() {
	if (os === "darwin") {
		// macOS
		const paths = [
			"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
			"/Applications/Chromium.app/Contents/MacOS/Chromium",
			"/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
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
		const programFiles = process.env["PROGRAMFILES"] || "C:\\Program Files";
		const programFilesX86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
		const localAppData = process.env["LOCALAPPDATA"] || join(home, "AppData", "Local");

		const paths = [
			join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
			join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
			join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
			join(programFiles, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
			join(localAppData, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
		];
		for (const p of paths) {
			if (existsSync(p)) return p;
		}
	}

	return null;
}

// Get default Chrome profile path for --profile option
function getDefaultProfilePath() {
	if (os === "darwin") {
		return join(home, "Library", "Application Support", "Google", "Chrome");
	} else if (os === "linux") {
		return join(home, ".config", "google-chrome");
	} else if (os === "win32") {
		const localAppData = process.env["LOCALAPPDATA"] || join(home, "AppData", "Local");
		return join(localAppData, "Google", "Chrome", "User Data");
	}
	return null;
}

// Kill existing Chrome processes
function killChrome() {
	try {
		if (os === "darwin") {
			execSync("killall 'Google Chrome' 2>/dev/null", { stdio: "ignore" });
			execSync("killall 'Chromium' 2>/dev/null", { stdio: "ignore" });
		} else if (os === "linux") {
			execSync("pkill -f '(chrome|chromium)' 2>/dev/null", { stdio: "ignore" });
		} else if (os === "win32") {
			spawnSync("taskkill", ["/F", "/IM", "chrome.exe"], { stdio: "ignore", shell: true });
			spawnSync("taskkill", ["/F", "/IM", "brave.exe"], { stdio: "ignore", shell: true });
		}
	} catch {}
}

// Copy directory recursively (cross-platform)
function copyProfile(src, dest) {
	if (os === "win32") {
		// Use Node.js built-in cpSync for Windows
		try {
			cpSync(src, dest, { recursive: true, force: true });
		} catch (err) {
			console.error("✗ Failed to copy profile:", err.message);
			process.exit(1);
		}
	} else {
		// Use rsync for Unix (faster for subsequent runs)
		try {
			execSync(`rsync -a --delete "${src}/" "${dest}/"`, { stdio: "pipe" });
		} catch {
			// Fallback to cp if rsync not available
			try {
				execSync(`cp -r "${src}/." "${dest}/"`, { stdio: "pipe" });
			} catch (err) {
				console.error("✗ Failed to copy profile:", err.message);
				process.exit(1);
			}
		}
	}
}

const chromePath = findChrome();
if (!chromePath) {
	console.error("✗ Chrome/Chromium not found. Please install Chrome or Chromium.");
	if (os === "linux") {
		console.error("\nOn Linux, you can install with:");
		console.error("  sudo apt install chromium-browser  # Debian/Ubuntu");
		console.error("  sudo dnf install chromium          # Fedora");
		console.error("  sudo pacman -S chromium            # Arch");
	} else if (os === "darwin") {
		console.error("\nOn macOS, download from: https://www.google.com/chrome/");
	} else if (os === "win32") {
		console.error("\nOn Windows, download from: https://www.google.com/chrome/");
	}
	process.exit(1);
}

// Kill existing Chrome
killChrome();

// Wait a bit for processes to fully die
await new Promise((r) => setTimeout(r, 1000));

// Setup profile directory
const cacheDir = getCacheDir();
mkdirSync(cacheDir, { recursive: true });

if (useProfile) {
	const profilePath = getDefaultProfilePath();
	if (profilePath && existsSync(profilePath)) {
		console.log("Copying profile (this may take a moment)...");
		copyProfile(profilePath, cacheDir);
	} else {
		console.error("✗ Default Chrome profile not found at:", profilePath);
		process.exit(1);
	}
}

// Start Chrome in background (detached so Node can exit)
const chromeArgs = [
	"--remote-debugging-port=9222",
	`--user-data-dir=${cacheDir}`,
	"--no-first-run",
	"--no-default-browser-check",
];

// Windows needs shell: true for proper detaching
const spawnOptions = os === "win32"
	? { detached: true, stdio: "ignore", shell: true }
	: { detached: true, stdio: "ignore" };

spawn(chromePath, chromeArgs, spawnOptions).unref();

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
