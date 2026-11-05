#!/usr/bin/env node
/**
 * Static inventory of interactive UI elements for the Interactive UI Audit.
 *
 * Walks every .tsx file under src/, finds interactive elements and writes
 * docs/ui-audit/manifest.json. Every entry starts as status "UNVERIFIED";
 * statuses are refined by manual/e2e review (see docs/ui-audit/README.md):
 *
 *   PASS | PARTIAL | UI_ONLY | DISCONNECTED | BROKEN | UNVERIFIED
 *
 * Approximation note: matches are line-based; an element spanning lines is
 * recorded at its opening-tag line. Counts are an inventory, not a proof of
 * uniqueness. Dynamic rendering (map over config arrays) is recorded once at
 * the JSX site that creates it.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');
const OUT_DIR = path.join(ROOT, 'docs', 'ui-audit');
const OUT_FILE = path.join(OUT_DIR, 'manifest.json');

const PATTERNS = [
  { kind: 'button', regex: /<button\b/g },
  { kind: 'input', regex: /<input\b/g },
  { kind: 'select', regex: /<select\b/g },
  { kind: 'textarea', regex: /<textarea\b/g },
  { kind: 'click-handler', regex: /onClick=/g },
  { kind: 'submit-handler', regex: /onSubmit=/g },
  { kind: 'checkbox', regex: /type="checkbox"/g },
  { kind: 'toggle', regex: /<Toggle\b/g },
  { kind: 'tab', regex: /role="tab"/g },
  { kind: 'link', regex: /<Link\b|href="#\//g },
];

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.isFile() && /\.tsx$/.test(entry.name)) files.push(full);
  }
  return files;
}

const elements = [];
const perFile = new Map();

for (const file of walk(SRC)) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const { kind, regex } of PATTERNS) {
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(line)) !== null) {
        elements.push({
          id: `${rel}:${i + 1}:${kind}:${match.index}`,
          file: rel,
          line: i + 1,
          kind,
          snippet: line.trim().slice(0, 160),
          status: 'UNVERIFIED',
          note: null,
        });
        const counts = perFile.get(rel) ?? { file: rel, count: 0 };
        counts.count += 1;
        perFile.set(rel, counts);
      }
    }
  }
}

elements.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

const byKind = {};
for (const el of elements) byKind[el.kind] = (byKind[el.kind] ?? 0) + 1;

const manifest = {
  generatedAt: new Date().toISOString(),
  tool: 'scripts/ui-audit/scan.mjs',
  schemaVersion: 1,
  totals: {
    files: perFile.size,
    elements: elements.length,
    byKind,
    byStatus: Object.fromEntries(
      ['PASS', 'PARTIAL', 'UI_ONLY', 'DISCONNECTED', 'BROKEN', 'UNVERIFIED'].map((status) => [
        status,
        elements.filter((element) => element.status === status).length,
      ])
    ),
  },
  elements,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(manifest, null, 2));
console.log(`ui-audit: ${elements.length} elements across ${perFile.size} files -> ${path.relative(ROOT, OUT_FILE)}`);
for (const [kind, count] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${kind.padEnd(16)} ${count}`);
}
