[API](../API.md) / [plugin/lib](../modules/plugin_lib.md) / DesktopApi

# Interface: DesktopApi

[plugin/lib](../modules/plugin_lib.md).DesktopApi

APIs exposed to Headlamp's renderer process by the desktop preload bridge.

## Indexable

▪ [key: `string`]: `any`

Additional APIs exposed by the desktop preload bridge.

## Properties

### isDevelopment

• `Optional` **isDevelopment**: `boolean`

Whether Electron is running in development mode, independent of the frontend build mode.

#### Defined in

[plugin/lib.ts:75](https://github.com/kubernetes-sigs/headlamp/blob/449ae946d/frontend/src/plugin/lib.ts#L75)

___

### platform

• **platform**: `Platform`

Operating system platform hosting the desktop app.

#### Defined in

[plugin/lib.ts:73](https://github.com/kubernetes-sigs/headlamp/blob/449ae946d/frontend/src/plugin/lib.ts#L73)
