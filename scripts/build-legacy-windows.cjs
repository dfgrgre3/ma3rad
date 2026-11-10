const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const electronDirectory = path.join(projectRoot, 'electron');
const legacyElectronVersion = '22.3.27';
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ceramisys-win7-'));
const savedArtifacts = new Map();
const generatedBytecode = [];
let productionBundleStarted = false;

function findBytecode(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      findBytecode(entryPath);
    } else if (entry.name.endsWith('.jsc') || entry.name === 'bytecode-integrity.json') {
      savedArtifacts.set(entryPath, fs.readFileSync(entryPath));
    }
  }
}

function run(command, args, env = process.env) {
  const child = spawnSync(command, args, {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
  });

  if (child.error) throw child.error;
  if (child.signal) throw new Error(`${command} was terminated by ${child.signal}`);
  if (child.status !== 0) {
    throw new Error(`${command} exited with status ${child.status}`);
  }
}

async function downloadLegacyElectron() {
  const { downloadArtifact } = await import('@electron/get');
  const mirrorOptions = process.env.ELECTRON_MIRROR
    ? {}
    : { mirrorOptions: { mirror: 'https://npmmirror.com/mirrors/electron/' } };
  const archivePath = await downloadArtifact({
    version: legacyElectronVersion,
    artifactName: 'electron',
    platform: 'win32',
    arch: 'ia32',
    ...mirrorOptions,
  });
  const extractedDirectory = path.join(temporaryDirectory, 'electron');
  fs.mkdirSync(extractedDirectory, { recursive: true });

  const extraction = spawnSync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${extractedDirectory.replace(/'/g, "''")}' -Force`,
  ], { stdio: 'inherit' });

  if (extraction.error) throw extraction.error;
  if (extraction.status !== 0) {
    throw new Error(`Could not extract Electron ${legacyElectronVersion}`);
  }

  const electronPath = path.join(extractedDirectory, 'electron.exe');
  if (!fs.existsSync(electronPath)) {
    throw new Error(`Electron executable not found: ${electronPath}`);
  }
  return electronPath;
}

function restoreSourcesAndBytecode() {
  if (productionBundleStarted) {
    run(process.execPath, [path.join(__dirname, 'restore-source.cjs')]);
  }
  for (const [filePath, contents] of savedArtifacts) {
    fs.writeFileSync(filePath, contents);
  }
  for (const filePath of generatedBytecode) {
    if (!savedArtifacts.has(filePath) && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

async function build() {
  if (process.platform !== 'win32') {
    throw new Error('The Windows 7 / ia32 installer must be built on Windows.');
  }

  const unsignedBuild = process.argv.includes('--unsigned');
  const npmCliPath = process.env.npm_execpath;
  if (!npmCliPath) {
    throw new Error('npm_execpath is unavailable; run the ia32 build through its npm script.');
  }

  findBytecode(electronDirectory);
  const electronPath = await downloadLegacyElectron();
  const legacyEnvironment = {
    ...process.env,
    CERAMISYS_LEGACY_BUILD: '1',
    ELECTRON_MIRROR: process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/',
  };

  run(process.execPath, [npmCliPath, 'run', 'build'], legacyEnvironment);

  const compiledFiles = [
    'main.js',
    'licenseGuard.js',
    'hardwareId.js',
    'security.js',
    'databaseHandlers.js',
    'databaseMemoryPolicy.js',
    'appHandlers.js',
    'centralApi.js',
    'documentHandlers.js',
    'printing.js',
    'syncClientConfig.js',
    'syncRelay.js',
    'gracefulShutdown.js',
    'autoUpdater.js',
    'safeStorageCompat.js',
    'security/crypto.js',
    'security/licenseValidator.js',
    'security/fileIntegrity.js',
    'security/ipcGuard.js',
    'security/auditLogger.js',
    'security/index.js',
  ];
  for (const file of compiledFiles) {
    const bytecodePath = path.join(electronDirectory, file.replace(/\.js$/, '.jsc'));
    if (!savedArtifacts.has(bytecodePath)) generatedBytecode.push(bytecodePath);
  }

  run(process.execPath, [
    path.join(__dirname, 'compile-bytenode.cjs'),
    '--electron-path',
    electronPath,
    '--skip-verify',
  ]);
  productionBundleStarted = true;
  run(process.execPath, [path.join(__dirname, 'prepare-production-bundle.cjs')]);
  run(process.execPath, [
    path.join(__dirname, 'electron-builder-with-temp-output.cjs'),
    '--legacy-win7',
    ...(unsignedBuild ? ['--unsigned'] : []),
    '--win',
    'nsis',
    '--ia32',
  ]);
  run(process.execPath, [
    path.join(__dirname, 'create-installer-launcher.cjs'),
    '--arch',
    'ia32',
  ]);
}

build()
  .catch((error) => {
    console.error('Windows 7 / ia32 build failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      restoreSourcesAndBytecode();
    } finally {
      try {
        fs.rmSync(temporaryDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
      } catch (cleanupError) {
        console.warn(`Could not immediately remove temporary directory ${temporaryDirectory}:`, cleanupError.message);
      }
    }
  });
