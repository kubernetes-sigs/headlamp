# Class: `abstract` Plugin

Plugins may call Headlamp.registerPlugin(pluginId: string, pluginObj: Plugin) to register themselves.

They will have their initialize(register) method called at plugin initialization time.

## Constructors

### new Plugin()

```ts
new Plugin(): Plugin
```

#### Returns

[`Plugin`](Plugin.md)

## Methods

### initialize()

```ts
abstract initialize(register: Registry): boolean | void
```

initialize is called for each plugin with a Registry which gives the plugin methods for doing things.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `register` | [`Registry`](../../registry/classes/Registry.md) |

#### Returns

`boolean` \| `void`

The return code is not used, but used to be required.

#### See

Registry

#### Defined in

[src/plugin/lib.ts:67](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/plugin/lib.ts#L67)
