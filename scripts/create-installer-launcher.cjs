const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const packageJson = require(path.join(projectRoot, 'package.json'));
const outputDirectory = path.resolve(
  projectRoot,
  packageJson.build.directories.output || 'release',
);
const architectureArg = process.argv.indexOf('--arch');
const architecture = architectureArg === -1
  ? 'x64'
  : process.argv[architectureArg + 1];
const installerArchitecture = architecture === 'ia32' ? 'x86' : architecture;
if (!['x64', 'x86'].includes(installerArchitecture)) {
  throw new Error(`Unsupported installer architecture: ${architecture}`);
}
const installerName = `CeramiSys-Setup-${packageJson.version}-${installerArchitecture}.exe`;
const installerPath = path.join(outputDirectory, installerName);

if (!fs.existsSync(installerPath)) {
  throw new Error(`Installer not found: ${installerPath}`);
}

const launcher = `@echo off
setlocal
if not defined LOCALAPPDATA (
  echo Windows did not provide a local application-data folder.
  exit /b 1
)

set "INSTALLER_TEMP=%LOCALAPPDATA%\\CeramiSysERP\\InstallerTemp"
if not exist "%INSTALLER_TEMP%\\" mkdir "%INSTALLER_TEMP%"
if errorlevel 1 goto temp_error

set "TEMP=%INSTALLER_TEMP%"
set "TMP=%INSTALLER_TEMP%"
set "TEMP_PROBE=%INSTALLER_TEMP%\\write-test-%RANDOM%.tmp"
>"%TEMP_PROBE%" echo temp-write-ok
if errorlevel 1 goto temp_error
del "%TEMP_PROBE%" >nul 2>nul

if /I "%~1"=="--check-temp" (
  echo Installer temp folder is writable: "%INSTALLER_TEMP%"
  exit /b 0
)

set "INSTALLER=%~dp0${installerName}"
if not exist "%INSTALLER%" (
  echo Installer not found: "%INSTALLER%"
  exit /b 1
)

"%INSTALLER%" %*
exit /b %ERRORLEVEL%

:temp_error
echo Cannot write to the installer temp folder: "%INSTALLER_TEMP%"
echo Check its permissions and available disk space, then try again.
exit /b 1
`;

const launcherName = installerArchitecture === 'x64'
  ? 'Install-CeramiSys.cmd'
  : `Install-CeramiSys-${installerArchitecture}.cmd`;
fs.writeFileSync(path.join(outputDirectory, launcherName), launcher, 'utf8');
console.log(`Installer launcher created for ${installerName}.`);
