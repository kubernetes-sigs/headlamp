# Example Plugin: Plugin Extensions

This plugin demonstrates how one plugin can define a plugin-owned extension point and how another plugin can register extension data for it.

The example keeps both sides in one file so it is easy to follow:

- the extension point owner reads and validates registered values
- the extension contributor registers a resource insight extension

To run the plugin:

```bash
cd plugins/examples/plugin-extensions
npm install
npm start
```

The plugin adds an app bar item showing how many resource insight extensions were registered. Hover over it to see the registered extension details.
