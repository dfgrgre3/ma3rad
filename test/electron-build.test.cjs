const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const bytenode = require('bytenode');
const packageConfig = require('../package.json');
const { prepareProductionBundle } = require('../scripts/prepare-production-bundle.cjs');

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
