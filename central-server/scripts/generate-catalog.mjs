/**
 * Regenerates central-server/platformPermissionCatalog.js from the canonical
 * TypeScript catalog in src/services/domains/platform/platformPermissionCatalog.ts.
 *
 * The central server is plain CommonJS and cannot import the TS module directly,
 * so the catalog is bundled once and committed. Re-run this whenever the ERP
 * catalog changes:
 *
 *   node central-server/scripts/generate-catalog.mjs
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const entry = path.join(repoRoot, 'src', 'services', 'domains', 'platform', 'platformPermissionCatalog.ts');
const outfile = path.join(repoRoot, 'central-server', 'platformPermissionCatalog.js');

const result = await build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  logLevel: 'warning',
});

const banner = `/**
 * GENERATED FILE — do not edit by hand.
 * Source: src/services/domains/platform/platformPermissionCatalog.ts
 * Regenerate with: node central-server/scripts/generate-catalog.mjs
 */
`;
writeFileSync(outfile, banner + result.outputFiles[0].text, 'utf8');

// Sanity check: the generated module must load and expose the expected exports.
const require = createRequire(import.meta.url);
const loaded = require(outfile);
if (!Array.isArray(loaded.PLATFORM_PERMISSION_CATALOG) || loaded.PLATFORM_PERMISSION_CATALOG.length === 0) {
  throw new Error('Generated catalog failed its sanity check (empty catalog).');
}
console.log('Wrote', outfile);
console.log('Sanity check OK:', loaded.PLATFORM_PERMISSION_CATALOG.length, 'permissions,', loaded.PLATFORM_ROLE_CODES.length, 'roles');
