const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const bytenode = require('bytenode');
const packageConfig = require('../package.json');

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
  assert.ok(packageConfig.build.files.includes('electron/**/*'), 'the packaged files must include generated .jsc files');
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
