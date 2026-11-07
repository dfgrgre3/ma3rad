# Licensing build flavors

Renderer builds are commercial by default: they require first-run activation and
central license validation. `npm run build` and the secure packaging pipeline
always use this flavor.

Local development may skip activation:

- `npm run dev` serves the local flavor.
- `npm run build:local` creates a local renderer for `npm start`/`npm run electron:start`.

The local build embeds its flavor in `dist/build-info.json`. The Electron release
packager refuses to create release artifacts unless this metadata says
`flavor: "commercial"` and `activationBypass: false`. Do not distribute local
builds as licensed releases.

`npm run typecheck` also checks Electron JavaScript handlers through
`tsconfig.electron-check.json`. Before writing `electron/bytecode-integrity.json`,
the bytecode build recompiles each protected Electron source file in a temporary
directory and requires an exact byte-for-byte match with its `.jsc` artifact.
The packaged entry verifies the manifest against every `.jsc` file before
loading the Electron main process.
