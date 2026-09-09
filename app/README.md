# Headlamp app

## Quickstart

### Running the app on Ubuntu WSL

Headlamp on WSL requires some packages installed (maybe it requires more) to run the app.

Note: `libgconf-2-4` was removed starting with Ubuntu 24.04 and newer
releases. If you are on an older release where it is still available you can
install it as well, otherwise you can safely omit it.

```bash
sudo apt install libatk1.0-0 libatk-bridge2.0-0 libgdk-pixbuf2.0-0 libgtk-3-0 libgbm1 libnss3 libasound2 firefox libgstreamer-plugins-bad1.0-0 libegl1 libnotify4 libopengl0 libwoff1 libharfbuzz-icu0 libgstreamer-gl1.0-0 libwebpdemux2 libenchant1c2a libsecret-1-0 libhyphen0 libevdev2 libgles2 gstreamer1.0-libav
```

To get going with development run these:

```bash
npm install
npm start
```

Note, it runs the development servers for the backend and the frontend as well. So if you have them running already you may want to stop them first.

## scripts

- `npm run build`: Copies in all the files and compiles the code. Builds into an unpacked folder in dist/. Useful for testing.
- `npm run compile-electron`: Compiles the TypeScript code in electron/ folder into JavaScript.
- `npm run copy-icons`: Copies the icons from the frontend/ folders into build/icons.
- `npm run copy-plugins`: Used to bundle plugins in the .plugins folder into the built app.
- `npm run dev`: Uses the built code in ../frontend from `npm run build` in that folder.
- `npm run dev-only-app`: Uses the development front end server.
- `npm run i18n`: Extract the translations discovered in the electron/ folder source code.
- `npm run package`: Creates binary packages for different platforms and outputs them in the dist/ folder.
- `npm run package-msi`: Creates the windows installer format msi package in the dist/ folder.
- `npm start`: Starts the app in dev mode along with the backend server, and the frontend development server.
- `npm run test`: Runs the tests. See the \*.test.ts files in the electron/ folder.
- `npm run tsc`: Runs the type checker.
- `npm run verify-build-linux`: Verifies the Linux build artifacts and binaries (requires built app in dist/).
- `npm run verify-build-mac`: Verifies the macOS build artifacts and binaries (requires built app in dist/).
- `npm run verify-build-windows`: Verifies the Windows build artifacts and binaries (requires built app in dist/).

## Build manifest

Desktop packages use `app-build-manifest.json` to configure product-specific
build behavior. Set `HEADLAMP_BUILD_MANIFEST` to select another manifest; relative
paths are resolved from the current working directory. The selected file is also
copied into the packaged app as `app-build-manifest.json` for runtime features.

When a manifest omits `targets`, Electron Builder uses the targets from
`app/package.json`. A manifest can replace the target list for one or more
platforms while preserving the other platform settings:

```json
{
  "targets": {
    "linux": ["AppImage"],
    "mac": [{ "target": "dmg", "arch": ["arm64"] }],
    "win": [{ "target": "nsis", "arch": ["x64"] }]
  }
}
```

Only `linux`, `mac`, and `win` platform keys are supported. Each configured
platform must have a non-empty array whose entries are either a non-blank target
name or an object containing a non-blank `target` and a non-empty `arch` array.
Supported architectures depend on the platform: Linux supports `arm64`, `armv7l`,
and `x64`; macOS supports `arm64`, `universal`, and `x64`; and Windows supports
`arm64`, `ia32`, and `x64`. Invalid target configuration stops the build before
Electron Builder packaging.

A manifest can also append files and directories to Electron Builder's common
or platform-specific `extraResources`. Resource `from` paths are resolved
relative to the selected manifest file, so product assets can live beside their
manifest:

```json
{
  "resources": {
    "common": [{ "from": "./shared", "to": "shared" }],
    "linux": [{ "from": "./tools/linux", "to": "tools" }],
    "mac": [{ "from": "./tools/mac", "to": "tools", "filter": ["**/*"] }],
    "win": [{ "from": "./tools/windows.exe", "to": "tools/tool.exe" }]
  }
}
```

Only `common`, `linux`, `mac`, and `win` resource groups are supported. Each
group must be an array of objects containing a `from` string and optional `to`
string or `filter` string array. Manifest resources are appended to Headlamp's
existing resources rather than replacing them. Invalid resource configuration
stops the build before Electron Builder packaging.

Packagers can also require selected files to match SHA-256 digests after
Electron Builder copies them. Verification paths are relative to the packaged
resources directory and must resolve to regular files beneath that directory:

```json
{
  "verify": [
    {
      "path": "tools/helper",
      "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      "platforms": ["linux", "mac"]
    }
  ]
}
```

The optional `platforms` array accepts `linux`, `mac`, and `win`; entries without
it apply to every package. Verification runs from Electron Builder's `afterPack`
hook and stops packaging when a resource is missing, outside the resources
directory, not a regular file, or does not match its declared digest.

For example, from the repository root:

```bash
HEADLAMP_BUILD_MANIFEST=../product/app-build-manifest.json npm --prefix app run package
```

## Verifying Builds

After building the desktop app with `npm run package`, you can verify that the built binaries work correctly:

**Linux:**

```bash
npm run verify-build-linux
```

**macOS:**

```bash
npm run verify-build-mac
```

**Windows:**

```powershell
npm run verify-build-windows
```

These verification scripts will:

1. Check that build artifacts (AppImage, tar.gz, DMG, or NSIS installer) exist
2. Extract and test the backend server binary with `--version` flag
3. Run the Electron app with `list-plugins` command to ensure it executes

The scripts are located in `app/scripts/` and can also be run directly if needed.
