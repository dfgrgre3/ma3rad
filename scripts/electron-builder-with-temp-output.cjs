const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const packageJson = require(path.join(projectRoot, 'package.json'));
const builderCli = require.resolve('electron-builder/cli.js');

function runBuilder(args) {
  const child = spawnSync(process.execPath, [builderCli, ...args], {
    cwd: projectRoot,
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

function buildWithTemporaryOutput(args) {
  const legacyWin7 = args.includes('--legacy-win7');
  args = args.filter((arg) => arg !== '--legacy-win7');

  if (args.includes('--version') || args.includes('--help') || args.includes('-h')) {
    runBuilder(args);
    return;
  }

  const windowsBuild = args.includes('--win');
  const publisherName = process.env.CERAMISYS_PUBLISHER_NAME?.trim();
  if (windowsBuild && !publisherName) {
    throw new Error(
      'CERAMISYS_PUBLISHER_NAME must match the Windows signing certificate publisher for signed builds and update verification.',
    );
  }

  const temporaryOutput = fs.mkdtempSync(path.join(os.tmpdir(), 'ceramisys-electron-builder-'));
  const temporaryConfig = `${temporaryOutput}.json`;
  let succeeded = false;

  try {
    const windowsBuildConfig = {
      ...packageJson.build.win,
      ...(windowsBuild ? { publisherName } : {}),
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

    if (!runBuilder(['--config', temporaryConfig, ...args])) {
      return;
    }

    const outputDirectory = path.resolve(
      projectRoot,
      packageJson.build.directories.output || 'release',
    );
    fs.mkdirSync(outputDirectory, { recursive: true });
    fs.cpSync(temporaryOutput, outputDirectory, { recursive: true, force: true });
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

    require('./restore-source.cjs');
  }
}

try {
  buildWithTemporaryOutput(process.argv.slice(2));
} catch (error) {
  console.error('electron-builder failed:', error);
  process.exitCode = 1;
}
