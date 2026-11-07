# Update channel (GitHub provider)

Root cause of `404 GET .../releases.atom` on v1.1.4: the repository
`dfgrgre3/ma3rad` is **private**, and `electron-updater` reads the update
feed anonymously, so GitHub returns 404 for private repos (the same response
is returned for non-existent repos). The raw error also embedded response
headers/cookies; `electron/autoUpdater.js` now sanitizes it via
`toSafeUpdateError()`.

## Fix (no rebuild required for installed clients)

Installed 1.1.4 builds already embed `provider: github, owner: dfgrgre3,
repo: ma3rad` (see `package.json` → `build.publish`), so once the steps
below are done the existing installs will check updates successfully.

1. GitHub → `dfgrgre3/ma3rad` → Settings → Danger Zone → **Change repository
   visibility → Make public**. (Source code becomes public — review before
   doing this; consider a private mirror repo if the source must stay
   secret, and point `build.publish` at it instead.)
2. Publish a release so the feed exists, e.g. bump `package.json` version,
   commit, then:
   ```powershell
   git tag v<version>
   git push origin v<version>
   ```
   The `Publish Windows Release` workflow (`.github/workflows/release-windows.yml`)
   builds, signs, and publishes the installer + `latest.yml` to the Release.
3. Verify before announcing:
   ```powershell
   curl.exe -I https://github.com/dfgrgre3/ma3rad/releases.atom
   curl.exe https://github.com/dfgrgre3/ma3rad/releases/download/v<version>/latest.yml
   ```
   Both must return 200 anonymously.
4. On an installed machine, open Settings → "تحديث التطبيق" → "تحقق من
   التحديثات". Expect "أنت تستخدم أحدث إصدار متاح" for the latest version,
   or a download when a newer Release exists.

Note: each architecture build overwrites `latest.yml` in the same Release
folder; publish x64 and ia32 from the same electron-builder run so a single
`latest.yml` lists all files, otherwise x64 machines may download the wrong
installer.
