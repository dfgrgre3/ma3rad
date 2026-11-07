#!/usr/bin/env node
/**
 * Feature-gap scan for the interactive UI audit.
 *
 * Complements `scan.mjs` (which only inventories elements) by finding controls
 * that cannot do anything yet:
 *   - buttons with no onClick, no submit role and no disabled state;
 *   - empty/no-op click handlers;
 *   - links pointing at "#";
 *   - form fields with no value/onChange/defaultValue/name binding;
 *   - inputs/selects rendered disabled from the start.
 *
 * Heuristics are intentionally conservative: the report is a starting point for
 * review, not a proof of a bug. Output: docs/ui-audit/gaps.json + console summary.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');
const OUT_DIR = path.join(ROOT, 'docs', 'ui-audit');
const OUT_FILE = path.join(OUT_DIR, 'gaps.json');

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.isFile() && /\.tsx$/.test(entry.name)) files.push(full);
  }
  return files;
}

/** Reads a JSX opening tag starting at `start`, returning its full text and end index. */
function readTag(source, start) {
  let depth = 0;
  let quote = null;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === quote && source[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') depth = Math.max(0, depth - 1);
    else if (ch === '>' && depth === 0) return { text: source.slice(start, i + 1), end: i + 1 };
  }
  return { text: source.slice(start), end: source.length };
}

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

const NOOP_PATTERNS = [
  /onClick=\{\(\)\s*=>\s*\{\s*\}\}/,
  /onClick=\{\(\)\s*=>\s*undefined\}/,
  /onClick=\{\(\)\s*=>\s*null\}/,
  /onClick=\{\(\)\s*=>\s*false\}/,
];

const FIELD_BINDING = /(value=|defaultValue=|onChange=|checked=|defaultChecked=|name=|register\(|\.\.\.\w+)/;

const gaps = [];

/**
 * Counts how many `<form>` elements enclose each character offset, so a button
 * that relies on the form's native submit is not reported as dead UI.
 */
function formRanges(source) {
  const ranges = [];
  const stack = [];
  for (const match of source.matchAll(/<form\b|<\/form>/g)) {
    if (match[0] === '<form') stack.push(match.index);
    else if (stack.length) ranges.push([stack.pop(), match.index]);
  }
  return ranges;
}

const isInside = (ranges, index) => ranges.some(([start, end]) => index > start && index < end);

for (const file of walk(SRC)) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const source = fs.readFileSync(file, 'utf8');
  const forms = formRanges(source);

  // Buttons
  for (const match of source.matchAll(/<button\b/g)) {
    const tag = readTag(source, match.index);
    const line = lineOf(source, match.index);
    const text = tag.text;
    const isNoop = NOOP_PATTERNS.some((pattern) => pattern.test(text));
    const submitsForm = isInside(forms, match.index);
    const hasAction =
      /onClick=/.test(text) ||
      /type=\{?["']submit["']\}?/.test(text) ||
      /disabled(=\{true\}|=\{!\w+|\s|>)/.test(text) ||
      /\{\.\.\.\w+\}/.test(text) ||
      /as=\{?["']?button/.test(text) ||
      (submitsForm && !/type=\{?["']button["']\}?/.test(text));
    if (isNoop || !hasAction) {
      gaps.push({
        kind: isNoop ? 'noop-handler' : 'button-without-handler',
        file: rel,
        line,
        snippet: text.replace(/\s+/g, ' ').slice(0, 220),
      });
    }
  }

  // Links with placeholder destinations
  for (const match of source.matchAll(/<a\b[^>]*href=["']#["']/g)) {
    gaps.push({
      kind: 'placeholder-link',
      file: rel,
      line: lineOf(source, match.index),
      snippet: match[0].replace(/\s+/g, ' ').slice(0, 220),
    });
  }

  // Form fields with no binding at all
  for (const match of source.matchAll(/<(input|select|textarea)\b/g)) {
    const tag = readTag(source, match.index);
    const text = tag.text;
    if (/type=["'](hidden|checkbox|radio)["']/.test(text)) continue;
    if (FIELD_BINDING.test(text)) continue;
    if (/readOnly/.test(text)) continue;
    gaps.push({
      kind: `unbound-${match[1]}`,
      file: rel,
      line: lineOf(source, match.index),
      snippet: text.replace(/\s+/g, ' ').slice(0, 220),
    });
  }
}

gaps.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

const byKind = {};
for (const gap of gaps) byKind[gap.kind] = (byKind[gap.kind] ?? 0) + 1;
const byFile = {};
for (const gap of gaps) byFile[gap.file] = (byFile[gap.file] ?? 0) + 1;

const report = {
  generatedAt: new Date().toISOString(),
  tool: 'scripts/ui-audit/gaps.mjs',
  schemaVersion: 1,
  totals: { gaps: gaps.length, byKind, files: Object.keys(byFile).length },
  topFiles: Object.entries(byFile)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([file, count]) => ({ file, count })),
  gaps,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2));

console.log(`ui-audit gaps: ${gaps.length} potential gaps across ${Object.keys(byFile).length} files -> ${path.relative(ROOT, OUT_FILE)}`);
for (const [kind, count] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${kind.padEnd(24)} ${count}`);
}
console.log('top files:');
for (const { file, count } of report.topFiles) console.log(`  ${String(count).padStart(3)}  ${file}`);
