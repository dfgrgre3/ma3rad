/**
 * Generates electron/centralRoutes.generated.js from the central server route
 * manifest and verifies it against the routes the Express app really mounts.
 *
 * Fails (non-zero exit) when a declared server route is missing or when a
 * server route is not declared in the manifest, so the bridge allowlist can
 * never silently drift from the API.
 *
 *   node central-server/scripts/generate-routes.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const outfile = path.join(repoRoot, 'electron', 'centralRoutes.generated.js');

const { ROUTE_MANIFEST } = require('../routeManifest.js');
const { createApp } = require('../app.js');
const { collectRoutes, routeKeySet } = require('../lib/routeIntrospection.js');

const actualRoutes = collectRoutes(createApp());
const actualKeys = routeKeySet(actualRoutes);

const declaredServerKeys = new Set();
const problems = [];

for (const entry of ROUTE_MANIFEST) {
  for (const method of entry.serverMethods) {
    const key = `${method} ${entry.pattern}`;
    declaredServerKeys.add(key);
    if (!actualKeys.has(key)) problems.push(`Manifest route is not mounted: ${key}`);
  }
}

for (const key of actualKeys) {
  if (!declaredServerKeys.has(key)) problems.push(`Mounted route is missing from the manifest: ${key}`);
}

if (problems.length) {
  console.error('Route manifest validation failed:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

const definitions = ROUTE_MANIFEST.map((entry) => {
  const methods = [...entry.serverMethods, ...(entry.clientOnlyMethods || [])];
  return { pattern: entry.pattern, methods: [...new Set(methods)] };
});

const contents = `/**
 * GENERATED FILE — do not edit by hand.
 * Source: central-server/routeManifest.js
 * Regenerate with: node central-server/scripts/generate-routes.mjs
 *
 * ${definitions.length} allowlisted endpoint pattern(s).
 */

const ROUTE_DEFINITIONS = ${JSON.stringify(definitions, null, 2)};

module.exports = { ROUTE_DEFINITIONS };
`;

writeFileSync(outfile, contents, 'utf8');
console.log(`Wrote ${outfile} (${definitions.length} route patterns, ${actualKeys.size} server route/method pairs verified)`);
