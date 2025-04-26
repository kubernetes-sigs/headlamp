[API](../API.md) / [plugin/registry](../modules/plugin_registry.md) / PluginsLoadedEvent

# Interface: PluginsLoadedEvent

[plugin/registry](../modules/plugin_registry.md).PluginsLoadedEvent

Event fired when all plugins are loaded.

## Properties

### data

• **data**: `Object`

#### Type declaration

| Name | Type | Description |
| :------ | :------ | :------ |
| `plugins` | { `isEnabled`: `boolean` ; `name`: `string` ; `version`: `string`  }[] | The list of loaded plugins. |

#### Defined in

[redux/headlampEventSlice.ts:224](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/redux/headlampEventSlice.ts#L224)

___

### type

• **type**: `PLUGINS_LOADED`

#### Defined in

[redux/headlampEventSlice.ts:223](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/redux/headlampEventSlice.ts#L223)
