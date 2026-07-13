# Custom Theme Example

This plugin demonstrates how to add a custom theme, including an example of
how to make sure the **xterm** colors used by the pod logs viewer, the pod
exec terminal and the node shell stay readable.

```bash
cd plugins/examples/custom-theme
npm install
npm start
```

The main code for the example plugin is in [src/index.tsx](src/index.tsx) and
the registered themes are in [src/themes.ts](src/themes.ts).

## Overriding terminal (xterm) colors

By default Headlamp derives terminal colors from the surrounding MUI palette
(the same way every other UI surface picks up your custom colors), so most
plugins don't need to do anything special.

If you want the terminal to look different from the rest of the app — e.g.
keeping a dark terminal inside an otherwise light theme — set the `terminal`
field directly on the same `AppTheme` you pass to `registerAppTheme(...)`:

```ts
registerAppTheme({
  name: 'my custom theme with terminal',
  base: 'light',
  // …palette overrides…
  terminal: {
    background: '#1e1e1e',
    foreground: '#f5f5f5',
    cursor: '#ffcc00',
    ansi: {
      red: '#ff5555',
      green: '#50fa7b',
      // …
    },
  },
});
```

Anything you leave out of `terminal` falls back to a value derived from the
surrounding MUI palette, so you only need to specify what you want to change.

## Making sure the colors are accessible

To keep terminal output readable, `terminal.foreground` should have a 4.5:1
contrast ratio against `terminal.background` (WCAG 2.1 AA), and the cursor
should remain clearly visible on the same background.

[`src/themeAccessibility.test.ts`](src/themeAccessibility.test.ts) shows how
to assert this from a plugin's own test suite using a small WCAG contrast
helper, so a regression in the theme colors fails the test.

```bash
cd plugins/examples/custom-theme
npm test
```
