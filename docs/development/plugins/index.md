---
title: Plugins
sidebar_position: 6
---

Plugins are one of the key features of Headlamp. They allow you to change how and what information is displayed and may serve various use cases. The plugins system aims to allow vendors to add features to Headlamp without having to maintain a fork of the project.

## Using plugins

Headlamp looks for plugins in different places.
It looks at the Headlamp's configuration folder first:

On a Mac and Linux desktop, the plugins folder is by default:
`$HOME/.config/Headlamp/plugins`

On Windows, it is by default:
`$APPDATA/Headlamp/Config/plugins`

In the plugins directory, plugins should be in the following format:

```
MyPlugin1/
    main.js
MyPlugin2/
    main.js
MyPlugin3/
    main.js
```

See the [shipping & deploying plugins](./building.md#shipping-and-deploying-plugins) section
for more details.

## Developing Plugins

Plugins are meant to be build and shipped out-of-tree (i.e., outside of the project and loaded by
Headlamp). This is opposed to managing the plugins' code within the Headlamp
project or within a Headlamp fork. Such a setup would require always
rebuilding/maintaining Headlamp when changing a plugin.

Learn [how to create a Headlamp plugin](./building.md).
