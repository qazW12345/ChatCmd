import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const roots = ['src', 'crates', 'web/src', 'chatgpt-extension'];
const textExtensions = new Set([
  '.rs', '.ts', '.tsx', '.js', '.cjs', '.mjs', '.json', '.html', '.css', '.md', '.sql', '.toml', '.yml', '.yaml',
]);
const ignoredDirectories = new Set(['node_modules', 'target', 'dist', '.git']);

// Vietnamese-specific letters and precomposed tone-mark characters. Ordinary ASCII
// and unrelated Latin text remain allowed; the goal is to prevent Vietnamese source,
// fixtures, prompts, diagnostics, and UI copy from entering the English-only app.
const vietnamese = /[ĂăÂâĐđÊêÔôƠơƯư\u1EA0-\u1EF9]/u;
const findings = [];

function walk(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!entry.isFile() || !textExtensions.has(path.extname(entry.name))) continue;
    const text = fs.readFileSync(full, 'utf8');
    text.split(/\r?\n/u).forEach((line, index) => {
      if (vietnamese.test(line)) {
        findings.push(`${path.relative(root, full)}:${index + 1}: ${line.trim()}`);
      }
    });
  }
}

for (const sourceRoot of roots) walk(path.join(root, sourceRoot));

if (findings.length) {
  console.error('Vietnamese text remains in English-only application source/tests:');
  for (const finding of findings) console.error(`  ${finding}`);
  process.exit(1);
}

console.log('English-only source guard passed: no Vietnamese text found in application source/tests.');
