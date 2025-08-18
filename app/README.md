# Headlamp app

## Quickstart

### Running the app on Ubuntu WSL

Headlamp on WSL requires some packages installed (maybe it requires more) to run the app.

```bash
sudo apt install libgconf-2-4 libatk1.0-0 libatk-bridge2.0-0 libgdk-pixbuf2.0-0 libgtk-3-0 libgbm1 libnss3 libasound2 firefox libgstreamer-plugins-bad1.0-0 libegl1 libnotify4 libopengl0 libwoff1 libharfbuzz-icu0 libgstreamer-gl1.0-0 libwebpdemux2 libenchant1c2a libsecret-1-0 libhyphen0 libevdev2 libgles2 gstreamer1.0-libav
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
- `npm run prod-deps`: Creates production dependencies for built apps in a prod_deps/ folder.
- `npm start`: Starts the app in dev mode along with the backend server, and the frontend development server.
- `npm run test`: Runs the tests. See the \*.test.js files in the electron/ folder.
- `npm run tsc`: Runs the type checker.
