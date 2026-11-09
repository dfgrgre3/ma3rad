const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const vm = require('node:vm');
const bytenode = require('bytenode');
const { createHash } = require('node:crypto');
const packageConfig = require('../package.json');
const { acquireBuildLock, resolveBuildFlavor } = require('../scripts/build-frontend.cjs');
const {
  filesToCompile,
  pinBytecodeIntegrityManifest,
  verifyBytecodeReproducibility,
  writeBytecodeIntegrityManifest,
} = require('../scripts/compile-bytenode.cjs');
const { getEntrySourceIntegrityHash } = require('../scripts/electron-security-integrity.cjs');
const { FileIntegrityChecker } = require('../electron/security/fileIntegrity.js');
const { prepareProductionBundle } = require('../scripts/prepare-production-bundle.cjs');
const { restoreSource } = require('../scripts/restore-source.cjs');

const projectRoot = path.resolve(__dirname, '..');

test('frontend builds wait for an active build lock before acquiring it', (t) => {
  const lockPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ceramisys-build-lock-')), 'build.lock');
  t.after(() => fs.rmSync(path.dirname(lockPath), { recursive: true, force: true }));
  fs.writeFileSync(lockPath, JSON.stringify({ pid: 123, token: 'active-build' }));

  let checks = 0;
  let waited = false;
  const releaseBuildLock = acquireBuildLock({
    lockPath,
    pid: 456,
    processRunning: () => {
      checks++;
      return checks === 1;
    },
    wait: () => {
      waited = true;
      fs.unlinkSync(lockPath);
    },
  });

  assert.equal(waited, true);
  assert.equal(JSON.parse(fs.readFileSync(lockPath, 'utf8')).pid, 456);
  releaseBuildLock();
  assert.equal(fs.existsSync(lockPath), false);
});

test('frontend build lock waiting stops after the configured timeout', (t) => {
  const lockPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ceramisys-build-lock-')), 'build.lock');
  t.after(() => fs.rmSync(path.dirname(lockPath), { recursive: true, force: true }));
  fs.writeFileSync(lockPath, JSON.stringify({ pid: 123, token: 'active-build' }));

  let time = 0;
  assert.throws(() => acquireBuildLock({
    lockPath,
    processRunning: () => true,
    wait: (delayMs) => { time += delayMs; },
    timeoutMs: 500,
    now: () => time,
  }), /Timed out waiting for frontend build lock held by PID 123/);
});

test('frontend build flavor is commercial by default and local only by explicit opt-in', () => {
  assert.equal(resolveBuildFlavor([]), 'commercial');
  assert.equal(resolveBuildFlavor(['--local']), 'local');
  assert.throws(() => resolveBuildFlavor(['--local', '--commercial']), /Unsupported frontend build argument/);
  assert.throws(() => resolveBuildFlavor(['--local', '--local']), /only be specified once/);
});

test('release packaging rejects local or bypass-enabled frontend artifacts', (t) => {
  const distDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ceramisys-build-info-'));
  t.after(() => fs.rmSync(distDirectory, { recursive: true, force: true }));
  const { assertCommercialBuild } = require('../scripts/electron-builder-with-temp-output.cjs');
  const metadataPath = path.join(distDirectory, 'build-info.json');

  fs.writeFileSync(metadataPath, JSON.stringify({ flavor: 'local', activationBypass: true }));
  assert.throws(() => assertCommercialBuild(distDirectory), /Refusing to package a non-commercial/);
  fs.writeFileSync(metadataPath, JSON.stringify({ flavor: 'commercial', activationBypass: true }));
  assert.throws(() => assertCommercialBuild(distDirectory), /Refusing to package a non-commercial/);
  fs.writeFileSync(metadataPath, JSON.stringify({ flavor: 'commercial', activationBypass: false }));
  assert.doesNotThrow(() => assertCommercialBuild(distDirectory));
});

test('release packaging restores Electron sources when the frontend flavor check fails', () => {
  const { buildWithTemporaryOutput } = require('../scripts/electron-builder-with-temp-output.cjs');
  let restored = false;
  assert.throws(() => buildWithTemporaryOutput(['--linux'], {
    assertCommercialBuild: () => { throw new Error('local frontend build'); },
    restoreSource: () => { restored = true; },
  }), /local frontend build/);
  assert.equal(restored, true);
});

test('development loads source directly and packaged Electron verifies bytecode before requiring main.jsc', () => {
  const entryPath = path.join(projectRoot, 'electron', 'entry.js');
  const source = fs.readFileSync(entryPath, 'utf8');
  const electronDir = path.dirname(entryPath);
  const manifestPath = path.join(electronDir, 'bytecode-integrity.json');
  const jscPath = path.join(electronDir, 'main.jsc');
  const mockManifestContents = JSON.stringify({ 'electron/main.jsc': 'a'.repeat(64) });
  const pinnedManifestHash = source.match(/BYTECODE_INTEGRITY_MANIFEST_SHA256 = '([a-f0-9]{64})'/)?.[1];

  const loadEntry = ({ isPackaged, actualHash = 'a'.repeat(64), jscFails = false } = {}) => {
    const calls = [];
    const fakeRequire = (id) => {
      if (id === 'electron') return { app: { isPackaged, quit: () => calls.push('quit') } };
      if (id === 'path') return path;
      if (id === 'fs') return {
        readdirSync: () => [{
          name: 'main.jsc',
          isDirectory: () => false,
          isFile: () => true,
        }],
        readFileSync: (target) => {
          if (target === manifestPath) return mockManifestContents;
          if (target === jscPath) return Buffer.from('bytecode');
          throw new Error(`Unexpected file read: ${target}`);
        },
      };
      if (id === 'node:crypto') return {
        createHash: () => {
          let input;
          return {
            update(value) {
              input = value.toString();
              return this;
            },
            digest: () => {
              if (!input.startsWith('{')) return actualHash;
              return input === mockManifestContents ? pinnedManifestHash : '0'.repeat(64);
            },
          };
        },
      };
      if (id === 'bytenode') {
        calls.push(id);
        return {};
      }
      if (id === jscPath && jscFails) {
        calls.push(id);
        throw new Error('bytecode load failed');
      }
      calls.push(id);
      return {};
    };
    vm.runInNewContext(source, {
      __dirname: path.dirname(entryPath),
      require: fakeRequire,
      console: { error: () => {} },
    }, { filename: entryPath });
    return calls;
  };

  assert.deepEqual(loadEntry({ isPackaged: false }), ['./main.js']);
  assert.deepEqual(loadEntry({ isPackaged: true }), ['bytenode', jscPath]);
  assert.deepEqual(loadEntry({ isPackaged: true, actualHash: 'b'.repeat(64) }), ['quit']);
  assert.deepEqual(loadEntry({ isPackaged: true, jscFails: true }), ['bytenode', jscPath, 'quit']);
});

test('packaged Electron rejects tampering with every bytecode module before loading main.jsc', () => {
  const entryPath = path.join(projectRoot, 'electron', 'entry.js');
  const source = fs.readFileSync(entryPath, 'utf8');
  const electronDir = path.dirname(entryPath);
  const appRoot = path.dirname(electronDir);
  const manifestPath = path.join(electronDir, 'bytecode-integrity.json');
  const jscPath = path.join(electronDir, 'main.jsc');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const bytecodePaths = Object.keys(manifest).map((file) => path.resolve(appRoot, file));

  for (const tamperedPath of [manifestPath, ...bytecodePaths]) {
    const calls = [];
    const fakeRequire = (id) => {
      if (id === 'electron') return { app: { isPackaged: true, quit: () => calls.push('quit') } };
      if (id === 'path') return path;
      if (id === 'fs') return {
        readdirSync: fs.readdirSync.bind(fs),
        readFileSync: (target, ...args) => {
          const contents = fs.readFileSync(target, ...args);
          if (path.resolve(target) !== tamperedPath) return contents;
          return Buffer.concat([contents, Buffer.from('tampered')]);
        },
      };
      if (id === 'node:crypto') return { createHash };
      if (id === 'bytenode') {
        calls.push(id);
        return {};
      }
      if (id === jscPath) calls.push(id);
      return {};
    };

    vm.runInNewContext(source, {
      __dirname: electronDir,
      require: fakeRequire,
      console: { error: () => {} },
    }, { filename: entryPath });

    assert.deepEqual(calls, ['quit'], `${path.relative(appRoot, tamperedPath)} must be rejected before loading bytecode`);
  }
});

test('bytecode integrity manifest is pinned and covers every compiled Electron module', (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ceramisys-bytecode-manifest-'));
  const electronDir = path.join(tempRoot, 'electron');
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));

  for (const file of filesToCompile) {
    const bytecodePath = path.join(electronDir, file.replace(/\.js$/, '.jsc'));
    fs.mkdirSync(path.dirname(bytecodePath), { recursive: true });
    fs.writeFileSync(bytecodePath, `compiled:${file}`);
  }
  fs.mkdirSync(electronDir, { recursive: true });
  const entryPath = path.join(electronDir, 'entry.js');
  const originalEntry = `const BYTECODE_INTEGRITY_MANIFEST_SHA256 = '${'0'.repeat(64)}';\n`;
  fs.writeFileSync(entryPath, originalEntry);
  writeBytecodeIntegrityManifest(electronDir);
  pinBytecodeIntegrityManifest(electronDir);

  const manifest = JSON.parse(fs.readFileSync(path.join(electronDir, 'bytecode-integrity.json'), 'utf8'));
  const entrySource = fs.readFileSync(entryPath, 'utf8');
  const manifestHash = createHash('sha256')
    .update(fs.readFileSync(path.join(electronDir, 'bytecode-integrity.json')))
    .digest('hex');
  assert.ok(entrySource.includes(manifestHash));
  assert.equal(fs.existsSync(`${entryPath}.bak`), true);
  assert.deepEqual(Object.keys(manifest).sort(), filesToCompile
    .map((file) => `electron/${file.replace(/\.js$/, '.jsc')}`)
    .sort());
  for (const [file, hash] of Object.entries(manifest)) {
    assert.equal(
      hash,
      createHash('sha256').update(fs.readFileSync(path.join(tempRoot, file))).digest('hex'),
    );
  }

  const checkedInManifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'electron', 'bytecode-integrity.json'), 'utf8'));
  assert.deepEqual(Object.keys(checkedInManifest).sort(), Object.keys(manifest).sort());
  for (const [file, hash] of Object.entries(checkedInManifest)) {
    assert.equal(
      hash,
      createHash('sha256').update(fs.readFileSync(path.join(projectRoot, file))).digest('hex'),
      `${file} must match its checked-in integrity hash`,
    );
  }
  restoreSource(electronDir);
  assert.equal(fs.readFileSync(entryPath, 'utf8'), originalEntry);
});

test('development runtime pins the current Electron entry source hash', () => {
  const entryPath = path.join(projectRoot, 'electron', 'entry.js');
  const entryHash = getEntrySourceIntegrityHash(entryPath);
  const mainSource = fs.readFileSync(path.join(projectRoot, 'electron', 'main.js'), 'utf8');

  assert.ok(mainSource.includes(`ENTRY_SOURCE_INTEGRITY_SHA256 = '${entryHash}'`));
  assert.match(mainSource, /!\s*app\.isPackaged\s*\?\s*\{\s*'electron\/entry\.js': ENTRY_SOURCE_INTEGRITY_SHA256\s*\}/);
  assert.equal(new FileIntegrityChecker(projectRoot).hashFile('electron/entry.js'), entryHash);
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
  assert.match(compiler, /'databaseMemoryPolicy\.js'/);
  const legacyBuilder = fs.readFileSync(path.join(projectRoot, 'scripts', 'build-legacy-windows.cjs'), 'utf8');
  assert.match(legacyBuilder, /'databaseMemoryPolicy\.js'/);
  assert.match(legacyBuilder, /entry\.name === 'bytecode-integrity\.json'/);
  const productionPreparation = fs.readFileSync(path.join(projectRoot, 'scripts', 'prepare-production-bundle.cjs'), 'utf8');
  assert.match(productionPreparation, /'databaseMemoryPolicy'/);
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
    let copyAttempts = 0;

    buildWithTemporaryOutput(['--win', '--unsigned'], {
      createTemporaryOutput: () => temporaryOutput,
      outputDirectory,
      assertCommercialBuild: () => {},
      restoreSource: () => restoreSource(path.join(fixtureRoot, 'electron')),
      runBuilder: (args) => {
        if (mode === 'failure') return false;
        const configPath = args[args.indexOf('--config') + 1];
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        fs.mkdirSync(config.directories.output, { recursive: true });
        fs.writeFileSync(path.join(config.directories.output, 'build-success.marker'), 'built');
        return true;
      },
      copyOutput: (source, destination) => {
        if (mode === 'copy-retry' || mode === 'copy-failure') {
          copyAttempts++;
          fs.writeFileSync(path.join(fixtureRoot, 'copy-attempts'), String(copyAttempts));
          if (mode === 'copy-failure' || copyAttempts < 3) {
            const error = new Error('simulated file sharing failure');
            error.code = 'EPIPE';
            throw error;
          }
        }
        fs.cpSync(source, destination, { recursive: true, force: true });
      },
      waitForCopyRetry: () => {},
    });
  `;

  for (const mode of ['success', 'failure', 'copy-retry', 'copy-failure']) {
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
    const shouldSucceed = mode === 'success' || mode === 'copy-retry';
    assert.equal(child.status, shouldSucceed ? 0 : 1, child.stderr);

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
    if (mode === 'copy-retry' || mode === 'copy-failure') {
      assert.equal(
        fs.readFileSync(path.join(fixtureRoot, 'copy-attempts'), 'utf8'),
        mode === 'copy-retry' ? '3' : '6',
      );
    }
    assert.equal(
      fs.existsSync(path.join(outputDirectory, 'build-success.marker')),
      shouldSucceed,
    );
    assert.equal(
      fs.existsSync(path.join(fixtureRoot, 'temporary-output', 'build-success.marker')),
      mode === 'copy-failure',
    );
    if (mode === 'copy-failure') {
      assert.match(child.stderr, /temporary output retained at:/);
      assert.match(child.stderr, /simulated file sharing failure/);
    }
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

test('release bytecode can be reproduced exactly from its Electron source', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ceramisys-bytecode-repro-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const sourcePath = path.join(directory, 'main.js');
  const artifactPath = path.join(directory, 'main.jsc');
  fs.writeFileSync(sourcePath, "module.exports = () => 'reproducible';\n");
  await bytenode.compileFile({
    filename: sourcePath,
    output: artifactPath,
    electronMain: true,
  });

  await verifyBytecodeReproducibility({ directory, files: ['main.js'] });

  fs.writeFileSync(sourcePath, "module.exports = () => 'changed';\n");
  await assert.rejects(
    verifyBytecodeReproducibility({ directory, files: ['main.js'] }),
    /does not reproducibly match its source/,
  );
});
