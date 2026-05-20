# Resource Actions Example Plugin

This is an example plugin showing how to use the `registerResourceActionProvider` API in Headlamp.

It registers custom actions that are displayed in:
- The top-right actions header in a resource details view.
- The action context menus in list tables.

It also demonstrates how to translate/localize action labels dynamically using the standard `t()` function context parameter.

## Developing

1. Build `headlamp-plugin` first.
2. Run `npm install` inside this directory.
3. Run `npm run build` or `npm run start` to build the plugin.
