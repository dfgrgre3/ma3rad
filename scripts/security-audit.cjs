// scripts/security-audit.cjs
// Lightweight static security audit for the ma3rad codebase.
// Run: node scripts/security-audit.cjs
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TARGETS = ['electron', 'src', 'central-server'];
const exts = new Set(['.js', '.cjs', '.ts', '.tsx']);

const rules = [
  {
    id: 'raw-ipc-handle',
    desc: 'Raw ipcMain.handle without guardedHandle wrapper',
    re: /ipcMain\.handle\s*\(/g,
    severity: 'high',
  },
  {
    id: 'sql-concat',
    desc: 'Potential SQL string concatenation (template literal in db call)',
    re: /db\.(run|get|all|exec)\s*\(\s*`[^`]*\$\{/g,
    severity: 'high',
  },
  {
    id: 'eval-usage',
    desc: 'Use of eval / new Function',
    re: /\beval\s*\(|new\s+Function\s*\(/g,
    severity: 'critical',
  },
  {
    id: 'dangerous-innerhtml',
    desc: 'dangerouslySetInnerHTML usage',
    re: /dangerouslySetInnerHTML/g,
    severity: 'medium',
  },
  {
    id: 'hardcoded-secret',
    desc: 'Possible hardcoded secret/token',
    re: /(api[_-]?key|secret|password)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
    severity: 'high',
  },
];

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (exts.has(path.extname(entry.name))) out.push(full);
  }
}

const findings = [];
for (const t of TARGETS) {
  const base = path.join(ROOT, t);
  if (!fs.existsSync(base)) continue;
  const files = [];
  walk(base, files);
  for (const f of files) {
    const content = fs.readFileSync(f, 'utf8');
    for (const rule of rules) {
      const matches = content.match(rule.re);
      if (matches) {
        findings.push({ file: path.relative(ROOT, f), rule: rule.id, severity: rule.severity, count: matches.length });
      }
    }
  }
}

console.log('Security audit findings:', findings.length);
for (const f of findings) console.log(`[${f.severity}] ${f.rule} :: ${f.file} (${f.count})`);
process.exit(findings.some((f) => f.severity === 'critical') ? 1 : 0);
