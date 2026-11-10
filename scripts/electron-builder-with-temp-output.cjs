const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { refreshBytecodeIntegrityManifest } = require('./compile-bytenode.cjs');

const projectRoot = path.resolve(__dirname, '..');
const packageJson = require(path.join(projectRoot, 'package.json'));
const builderCli = require.resolve('electron-builder/cli.js');

const COPY_RETRY_DELAYS_MS = [250, 500, 1000, 2000, 2000];
const RETRYABLE_COPY_ERROR_CODES = new Set(['EACCES', 'EBUSY', 'EPIPE', 'EPERM']);

function waitBeforeRetry(delayMs) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
}

function copyOutputWithRetry(source, destination, copyOutput, wait = waitBeforeRetry) {
  for (let attempt = 0; ; attempt++) {
    try {
      copyOutput(source, destination);
      return;
    } catch (error) {
      const delayMs = COPY_RETRY_DELAYS_MS[attempt];
      if (!RETRYABLE_COPY_ERROR_CODES.has(error.code) || delayMs === undefined) {
        throw error;
      }

      console.warn(
        `Temporary output copy failed with ${error.code} (attempt ${attempt + 1}/${COPY_RETRY_DELAYS_MS.length + 1}); retrying in ${delayMs}ms.`,
      );
      wait(delayMs);
    }
  }
}

function assertCommercialBuild(distDirectory = path.join(projectRoot, 'dist')) {
  const metadataPath = path.join(distDirectory, 'build-info.json');
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  if (metadata.flavor !== 'commercial' || metadata.activationBypass !== false) {
    throw new Error(
      'Refusing to package a non-commercial frontend build; run the commercial build before creating a release artifact.',
    );
  }
}

function runBuilder(args, env = process.env) {
  const child = spawnSync(process.execPath, [builderCli, ...args], {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
  });

  if (child.error) {
    throw child.error;
  }
  if (child.signal) {
    throw new Error(`electron-builder was terminated by ${child.signal}`);
  }
  if (child.status !== 0) {
    process.exitCode = child.status || 1;
    return false;
  }
  return true;
}

function buildWithTemporaryOutput(args, {
  runBuilder: runBuilderProcess = runBuilder,
  restoreSource: restoreSourceFiles = () => require('./restore-source.cjs').restoreSource(),
  assertCommercialBuild: assertCommercialFrontend = assertCommercialBuild,
  refreshPackageIntegrity = refreshBytecodeIntegrityManifest,
  createTemporaryOutput = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ceramisys-electron-builder-')),
  outputDirectory = path.resolve(projectRoot, packageJson.build.directories.output || 'release'),
  copyOutput = (source, destination) => fs.cpSync(source, destination, { recursive: true, force: true }),
  waitForCopyRetry = waitBeforeRetry,
} = {}) {
  const legacyWin7 = args.includes('--legacy-win7');
  const unsignedBuild = args.includes('--unsigned');
  args = args.filter((arg) => arg !== '--legacy-win7' && arg !== '--unsigned');

  if (args.includes('--version') || args.includes('--help') || args.includes('-h')) {
    runBuilder(args);
    return;
  }

  try {
    assertCommercialFrontend();
  } catch (error) {
    restoreSourceFiles();
    throw error;
  }

  const windowsBuild = args.includes('--win');
  const publisherName = process.env.CERAMISYS_PUBLISHER_NAME?.trim();
  if (windowsBuild && !unsignedBuild && !publisherName) {
    throw new Error(
      'CERAMISYS_PUBLISHER_NAME must match the Windows signing certificate publisher for signed builds and update verification.',
    );
  }

  const builderEnvironment = { ...process.env };
  if (unsignedBuild) {
    delete builderEnvironment.CSC_LINK;
    delete builderEnvironment.CSC_KEY_PASSWORD;
    delete builderEnvironment.WIN_CSC_LINK;
    delete builderEnvironment.WIN_CSC_KEY_PASSWORD;
    builderEnvironment.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
  }

  const temporaryOutput = createTemporaryOutput();
  const temporaryConfig = `${temporaryOutput}.json`;
  let succeeded = false;

  try {
    refreshPackageIntegrity();

    const windowsBuildConfig = {
      ...packageJson.build.win,
      ...(windowsBuild && unsignedBuild
        ? { forceCodeSigning: false, verifyUpdateCodeSignature: false }
        : windowsBuild
          ? { publisherName }
          : {}),
      ...(legacyWin7
        ? {
            target: [{ target: 'nsis', arch: ['ia32'] }],
            artifactName: 'CeramiSys-Setup-${version}-x86.${ext}',
          }
        : {}),
    };
    const buildConfig = {
      ...packageJson.build,
      ...(legacyWin7 ? { electronVersion: '22.3.27' } : {}),
      ...(windowsBuild ? { win: windowsBuildConfig } : {}),
      directories: {
        ...packageJson.build.directories,
        output: temporaryOutput,
      },
    };
    fs.writeFileSync(temporaryConfig, JSON.stringify(buildConfig, null, 2));

    if (!runBuilderProcess(['--config', temporaryConfig, ...args], builderEnvironment)) {
      process.exitCode = process.exitCode || 1;
      return;
    }

    fs.mkdirSync(outputDirectory, { recursive: true });
    copyOutputWithRetry(temporaryOutput, outputDirectory, copyOutput, waitForCopyRetry);
    succeeded = true;
  } finally {
    if (fs.existsSync(temporaryConfig)) {
      fs.unlinkSync(temporaryConfig);
    }
    if (succeeded) {
      fs.rmSync(temporaryOutput, { recursive: true, force: true });
    } else {
      console.error(`electron-builder temporary output retained at: ${temporaryOutput}`);
    }

    restoreSourceFiles();
  }
}

if (require.main === module) {
  try {
    buildWithTemporaryOutput(process.argv.slice(2));
  } catch (error) {
    console.error('electron-builder failed:', error);
    process.exitCode = 1;
  }
}

module.exports = { assertCommercialBuild, buildWithTemporaryOutput };
