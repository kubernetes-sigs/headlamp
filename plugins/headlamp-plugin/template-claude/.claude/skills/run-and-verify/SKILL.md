---
name: run-and-verify
description: Bring up the live development loop and prove the plugin actually loads — the user launches Headlamp with remote debugging, you run the watch build, attach the chrome-devtools MCP, and run the non-skippable load smoke check (no Plugin execution error, contribution renders, i18n resolves, a11y tree has names/roles). Use to develop, live-verify, or re-check the plugin after any change. This is where gate-green ≠ loads is enforced.
allowed-tools:
  - mcp__chrome-devtools__*
  - Bash(npm start:*)
  - Bash(npm run tsc:*)
  - Bash(npm run lint:*)
  - Bash(npm run lint-fix:*)
  - Bash(npm run build:*)
  - Bash(curl:*)
  - Bash(kubectl get:*)
  - Write(src/**)
  - Edit(src/**)
  - Edit(PLAN.md)
---

# run-and-verify

Run the plugin inside the real Headlamp app and use the browser session as ground truth. A green
`tsc`/`lint`/`build` does **not** mean the plugin loaded — a value imported from a non-externalized
path is `undefined` at runtime and throws on load while the build stays green (CLAUDE.md). This skill
is where that's caught.

## Who launches the app

**The user launches the Electron GUI from their own terminal — you attach, you don't launch.**
Electron won't initialize from a headless background shell. Ask the user to start it and confirm
`:9222` is up before attaching.

## Steps

1. **User launches Headlamp with remote debugging.** Either:
   - from the Headlamp source repo: `npm run start:with-app:debug` (backend `:4466` + Vite `:3000` +
     Electron `--remote-debugging-port=9222`) — **free `:4466`/`:3000`/`:9222` first**; a stale
     backend makes it silently fall back; or
   - the installed app: `/Applications/Headlamp.app/Contents/MacOS/Headlamp --remote-debugging-port=9222 --user-data-dir=/tmp/headlamp-debug`.

   Cluster-scoped route URLs are `http://localhost:3000/#/c/<cluster>/<route-path>`.

2. **Confirm the CDP target** the MCP will attach to:
   ```bash
   curl -s http://localhost:9222/json | grep -o '"url":"[^"]*"'   # note the type:"page" Headlamp UI target
   ```

3. **Start the watch build** (background it; rebuilds on save, app hot-reloads):
   ```bash
   npm start
   ```

4. **Attach + run the load smoke check (NON-SKIPPABLE)** via the chrome-devtools MCP:
   - `list_console_messages` → **no `Plugin execution error in <name>`** (Headlamp logs exactly this
     when a plugin throws on load) and no other plugin errors.
   - `list_pages`/`select_page` → the Headlamp UI page; `navigate_page` to your route.
   - `take_snapshot` → your **actual contribution** is in the DOM/a11y tree (sidebar entry / route
     content / widget) — "the app rendered" ≠ "the plugin loaded".
   - **i18n resolves** — custom column headers/labels show real text. Blank custom headers while
     built-in ones (Namespace/Age) show = the plugin's translation namespace didn't load (stale/empty
     bundle): `npm run build` (check `dist/locales/<lang>/translation.json` is non-empty), **fully
     restart Headlamp**, and `evaluate_script` `t('X')` to confirm it's non-empty.
   - **a11y** — every interactive control in the snapshot has a name/role.
   - `take_screenshot` for visual confirmation; `evaluate_script` for specific state.

   **If the contribution is missing or the console shows a plugin execution error, the plugin did
   NOT load.** Re-run this after **every new value import or `extends`** — that's the change that
   introduces this bug invisibly.

5. **Iterate.** On an error/missing contribution/wrong render: read the message, fix `src/` (suspect a
   non-externalized value import first), let the watch build reload, re-check. **Never hand-create a
   symlink to force a not-loading plugin** — a missing contribution is a load-time crash or a wrong
   route/sidebar name, not a placement problem; `npm start` already links the build where the app
   loads it.

6. **Close the gate + teardown.** Once behavior is right, run `npm run tsc && npm run lint && npm run
   build` so the production build matches what you verified. When the session is over, stop the watch
   build and remove the dev-load artifact `npm start` left in Headlamp's **dev-plugins** dir
   (`~/Library/Application Support/Headlamp/dev-plugins/<name>` on macOS) so the app stops loading the
   dev version — `rm` only that symlink/dir under the Headlamp config base, never the repo source. To
   keep the plugin installed permanently, use the packaged tarball.

## MCP notes

- The chrome-devtools MCP attaches to `http://127.0.0.1:9222` (`.mcp.json`). It only connects once
  Headlamp is up (loaded ≠ connected) — launch the app first.
- If `mcp__chrome-devtools__*` tools don't exist: project `.mcp.json` servers load at **startup**, so
  a just-added server needs a **Claude Code restart** (not just `/mcp`); and a server listed in
  `disabledMcpjsonServers` (settings.local.json) is blocked until removed.
- Operate on the React UI `page` target (Electron exposes several); evaluated scripts see the
  DOM/React UI only, not Node/Electron internals.
