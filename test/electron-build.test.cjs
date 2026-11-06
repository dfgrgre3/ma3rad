const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const vm = require('node:vm');
const bytenode = require('bytenode');
const packageConfig = require('../package.json');
const { prepareProductionBundle } = require('../scripts/prepare-production-bundle.cjs');
const { restoreSource } = require('../scripts/restore-source.cjs');

const projectRoot = path.resolve(__dirname, '..');

test('development loads main.js while packaged Electron requires main.jsc', () => {
  const entryPath = path.join(projectRoot, 'electron', 'entry.js');
  const source = fs.readFileSync(entryPath, 'utf8');

  const loadEntry = (isPackaged) => {
    const calls = [];
    const fakeRequire = (id) => {
      if (id === 'electron') return { app: { isPackaged } };
      if (id === 'path') return path;
      if (id === 'fs') return fs;
      if (id === 'bytenode') {
        calls.push(id);
        return {};
      }
      calls.push(id);
      return {};
    };
    vm.runInNewContext(source, {
      __dirname: path.dirname(entryPath),
      require: fakeRequire,
    }, { filename: entryPath });
    return calls;
  };

  assert.deepEqual(loadEntry(false), ['./main.js']);
  assert.deepEqual(loadEntry(true), ['bytenode', path.join(projectRoot, 'electron', 'main.jsc')]);
});

test('packaged entry falls back to source main.js when bytecode is missing or invalid', () => {
  const entryPath = path.join(projectRoot, 'electron', 'entry.js');
  const source = fs.readFileSync(entryPath, 'utf8');
  const jscPath = path.join(projectRoot, 'electron', 'main.jsc');

  const loadEntry = ({ isPackaged, hasJsc = true, jscFails = false }) => {
    const calls = [];
    const fakeRequire = (id) => {
      if (id === 'electron') return { app: { isPackaged } };
      if (id === 'path') return path;
      if (id === 'fs') return {
        existsSync: (target) => {
          if (target === jscPath) return hasJsc;
          return false;
        },
      };
      if (id === 'bytenode') {
        calls.push(id);
        return {};
      }
      if (id === jscPath) {
        calls.push(id);
        if (jscFails) throw new Error('bytecode load failed');
        return {};
      }
      calls.push(id);
      return {};
    };

    vm.runInNewContext(source, {
      __dirname: path.dirname(entryPath),
      require: fakeRequire,
      console: { warn: () => {} },
    }, { filename: entryPath });
    return calls;
  };

  assert.deepEqual(loadEntry({ isPackaged: false }), ['./main.js']);
  assert.deepEqual(loadEntry({ isPackaged: true, hasJsc: false }), ['./main.js']);
  assert.deepEqual(loadEntry({ isPackaged: true, jscFails: true }), ['bytenode', jscPath, './main.js']);
});

test('distribution and publish commands compile Electron bytecode before packaging', () => {
  for (const scriptName of [
    'electron:dist:x64',
    'electron:dist:mac',
    'electron:dist:linux',
    'electron:publish:x64',
    'electron:publish:mac',
    'electron:publish:linux',
  ]) {
    const script = packageConfig.scripts[scriptName];
    assert.ok(script, `missing ${scriptName}`);
    assert.ok(script.indexOf('bundle:secure') >= 0, `${scriptName} must run bundle:secure`);
    assert.ok(
      script.indexOf('bundle:secure') < script.indexOf('electron-builder-with-temp-output.cjs'),
      `${scriptName} must compile current source before packaging`,
    );
  }

  const compiler = fs.readFileSync(path.join(projectRoot, 'scripts', 'compile-bytenode.cjs'), 'utf8');
  assert.match(compiler, /'main\.js'/);
  assert.match(compiler, /'security\/crypto\.js'/);
  assert.ok(packageConfig.build.files.includes('electron/**/*'), 'the packaged files must include generated .jsc files');
});

test('production preparation protects nested security modules with relative bytecode loaders', (t) => {
  const electronDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ceramisys-protected-electron-'));
  t.after(() => fs.rmSync(electronDir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(electronDir, 'security'));
  fs.writeFileSync(path.join(electronDir, 'security', 'crypto.js'), 'module.exports = "source";\n');
  fs.writeFileSync(path.join(electronDir, 'security', 'crypto.jsc'), 'compiled');

  prepareProductionBundle(electronDir);

  assert.equal(
    fs.readFileSync(path.join(electronDir, 'security', 'crypto.js.bak'), 'utf8'),
    'module.exports = "source";\n',
  );
  assert.equal(
    fs.readFileSync(path.join(electronDir, 'security', 'crypto.js'), 'utf8'),
    "// Protected binary code\nmodule.exports = require('./crypto.jsc');\n",
  );
});

test('source restoration restores top-level and nested JavaScript backups', (t) => {
  const electronDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ceramisys-restore-electron-'));
  t.after(() => fs.rmSync(electronDir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(electronDir, 'security'));
  fs.writeFileSync(path.join(electronDir, 'main.js'), 'loader');
  fs.writeFileSync(path.join(electronDir, 'main.js.bak'), 'main source');
  fs.writeFileSync(path.join(electronDir, 'security', 'crypto.js'), 'nested loader');
  fs.writeFileSync(path.join(electronDir, 'security', 'crypto.js.bak'), 'nested source');

  restoreSource(electronDir);

  assert.equal(fs.readFileSync(path.join(electronDir, 'main.js'), 'utf8'), 'main source');
  assert.equal(fs.readFileSync(path.join(electronDir, 'security', 'crypto.js'), 'utf8'), 'nested source');
  assert.equal(fs.existsSync(path.join(electronDir, 'main.js.bak')), false);
  assert.equal(fs.existsSync(path.join(electronDir, 'security', 'crypto.js.bak')), false);
});

test('source restoration fails when a backup remains after restoration', (t) => {
  const electronDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ceramisys-restore-failure-'));
  t.after(() => fs.rmSync(electronDir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(electronDir, 'main.js'), 'loader');
  fs.writeFileSync(path.join(electronDir, 'main.js.bak'), 'source');
  const unlinkSync = fs.unlinkSync;

  try {
    fs.unlinkSync = () => {};
    assert.throws(() => restoreSource(electronDir), /Source backups remain after restoration/);
  } finally {
    fs.unlinkSync = unlinkSync;
  }
});

test('electron-builder restores sources after the process exits on success and failure', (t) => {
  const childScript = String.raw`
    const fs = require('node:fs');
    const path = require('node:path');
    const [mode, projectRoot, fixtureRoot, outputDirectory] = process.argv.slice(1);
    const { buildWithTemporaryOutput } = require(path.join(projectRoot, 'scripts/electron-builder-with-temp-output.cjs'));
    const { restoreSource } = require(path.join(projectRoot, 'scripts/restore-source.cjs'));
    const temporaryOutput = path.join(fixtureRoot, 'temporary-output');

    buildWithTemporaryOutput(['--win', '--unsigned'], {
      createTemporaryOutput: () => temporaryOutput,
      outputDirectory,
      restoreSource: () => restoreSource(path.join(fixtureRoot, 'electron')),
      runBuilder: (args) => {
        if (mode === 'failure') return false;
        const configPath = args[args.indexOf('--config') + 1];
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        fs.mkdirSync(config.directories.output, { recursive: true });
        fs.writeFileSync(path.join(config.directories.output, 'build-success.marker'), 'built');
        return true;
      },
    });
  `;

  for (const mode of ['success', 'failure']) {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), `ceramisys-builder-${mode}-`));
    t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
    const electronDir = path.join(fixtureRoot, 'electron');
    const securityDir = path.join(electronDir, 'security');
    const outputDirectory = path.join(fixtureRoot, 'release');
    fs.mkdirSync(securityDir, { recursive: true });
    fs.writeFileSync(path.join(electronDir, 'main.js'), "module.exports = require('./main.jsc');\n");
    fs.writeFileSync(path.join(electronDir, 'main.js.bak'), 'main source');
    fs.writeFileSync(path.join(securityDir, 'crypto.js'), "module.exports = require('./crypto.jsc');\n");
    fs.writeFileSync(path.join(securityDir, 'crypto.js.bak'), 'nested source');

    const child = spawnSync(process.execPath, [
      '-e',
      childScript,
      mode,
      projectRoot,
      fixtureRoot,
      outputDirectory,
    ], { encoding: 'utf8' });

    assert.equal(child.error, undefined, child.error?.message);
    assert.equal(child.status, mode === 'success' ? 0 : 1, child.stderr);

    const sourceFiles = [
      path.join(electronDir, 'main.js'),
      path.join(securityDir, 'crypto.js'),
    ];
    for (const sourcePath of sourceFiles) {
      assert.doesNotMatch(fs.readFileSync(sourcePath, 'utf8'), /require\(['"][^'"]+\.jsc['"]\)/);
      assert.equal(fs.existsSync(`${sourcePath}.bak`), false);
    }
    assert.equal(fs.readFileSync(sourceFiles[0], 'utf8'), 'main source');
    assert.equal(fs.readFileSync(sourceFiles[1], 'utf8'), 'nested source');
    assert.equal(
      fs.existsSync(path.join(outputDirectory, 'build-success.marker')),
      mode === 'success',
    );
  }
});

test('package scripts do not reference missing local script files', () => {
  const missingScripts = [];
  for (const [name, command] of Object.entries(packageConfig.scripts)) {
    const matches = command.matchAll(/\bnode\s+(?:(?:--[^\s]+\s+))*((?:scripts)\/[^\s&]+)/g);
    for (const match of matches) {
      if (!fs.existsSync(path.join(projectRoot, match[1]))) missingScripts.push(`${name}: ${match[1]}`);
    }
  }
  assert.deepEqual(missingScripts, []);
});

test('unsigned Windows distribution commands do not require a signing certificate', () => {
  for (const scriptName of [
    'electron:dist:x64:unsigned',
    'electron:dist:ia32:unsigned',
    'electron:dist:all:unsigned',
  ]) {
    assert.ok(packageConfig.scripts[scriptName], `missing ${scriptName}`);
  }

  assert.match(packageConfig.scripts['electron:dist:x64:unsigned'], /--unsigned/);
  assert.match(packageConfig.scripts['electron:dist:ia32:unsigned'], /--unsigned/);
  assert.match(packageConfig.scripts['electron:dist:all:unsigned'], /electron:dist:x64:unsigned.*electron:dist:ia32:unsigned/);
});

test('bytenode output executes the exact source passed to the compiler', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ceramisys-bytecode-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const sourcePath = path.join(directory, 'current-source.js');
  const outputPath = path.join(directory, 'current-source.jsc');
  fs.writeFileSync(sourcePath, "module.exports = () => 'from-current-source';\n");

  await bytenode.compileFile({ filename: sourcePath, output: outputPath });
  assert.equal(require(outputPath)(), 'from-current-source');
});
