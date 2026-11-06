const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

test('release workflow and CI workflow validation step are valid', () => {
  const workflowDirectory = path.join(process.cwd(), '.github', 'workflows');
  const releaseWorkflow = yaml.load(
    fs.readFileSync(path.join(workflowDirectory, 'release-windows.yml'), 'utf8')
  );
  const ciWorkflow = yaml.load(
    fs.readFileSync(path.join(workflowDirectory, 'ci.yml'), 'utf8')
  );

  assert.ok(releaseWorkflow && typeof releaseWorkflow === 'object');
  assert.ok(ciWorkflow && typeof ciWorkflow === 'object');
  const releaseSteps = releaseWorkflow.jobs?.publish?.steps;
  const ciSteps = ciWorkflow.jobs?.['windows-verify']?.steps;
  assert.ok(Array.isArray(releaseSteps));
  assert.ok(Array.isArray(ciSteps));
  const versionCheck = releaseSteps.find((step) => step.name === 'Verify tag matches package version');
  assert.ok(versionCheck?.run.includes('package.json version'));
  assert.ok(ciSteps.some((step) => step.name === 'Validate release workflow YAML'));
});
