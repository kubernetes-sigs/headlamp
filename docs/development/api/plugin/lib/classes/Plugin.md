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

[src/plugin/lib.ts:67](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/plugin/lib.ts#L67)
