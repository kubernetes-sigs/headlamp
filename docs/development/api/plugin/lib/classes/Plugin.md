# Abstract Class: Plugin

Defined in: [plugin/lib.ts:59](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/plugin/lib.ts#L59)

Plugins may call Headlamp.registerPlugin(pluginId: string, pluginObj: Plugin) to register themselves.

They will have their initialize(register) method called at plugin initialization time.

## Constructors

### Constructor

```ts
new Plugin(): Plugin;
```

#### Returns

`Plugin`

## Methods

### initialize()

```ts
abstract initialize(register: Registry): boolean | void;
```

Defined in: [plugin/lib.ts:67](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/plugin/lib.ts#L67)

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
