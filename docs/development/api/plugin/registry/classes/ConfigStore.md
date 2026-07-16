# Class: ConfigStore\<T\>

Defined in: [plugin/configStore.ts:26](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/plugin/configStore.ts#L26)

A class to manage the configuration state for plugins in a Redux store.

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| `T` | The type of the configuration object. |

## Constructors

### Constructor

```ts
new ConfigStore<T>(configKey: string): ConfigStore<T>;
```

Defined in: [plugin/configStore.ts:34](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/plugin/configStore.ts#L34)

Creates an instance of the ConfigStore class.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `configKey` | `string` | The key to identify the specific plugin configuration. |

#### Returns

`ConfigStore`\<`T`\>

## Methods

### get()

```ts
get(): T;
```

Defined in: [plugin/configStore.ts:70](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/plugin/configStore.ts#L70)

Retrieves the current configuration for the specified key from the Redux store.

#### Returns

`T`

The current configuration object.

***

### set()

```ts
set(configValue: T): void;
```

Defined in: [plugin/configStore.ts:45](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/plugin/configStore.ts#L45)

Sets the entire configuration for a specific plugin.

This method will overwrite the entire configuration object for the given key.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `configValue` | `T` | The new configuration object. |

#### Returns

`void`

***

### update()

```ts
update(partialUpdates: Partial<T>): void;
```

Defined in: [plugin/configStore.ts:61](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/plugin/configStore.ts#L61)

Updates the configuration for a specific plugin.

This method will merge the provided partial updates into the current configuration object.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `partialUpdates` | `Partial`\<`T`\> | An object containing the updates to be merged into the current configuration. |

#### Returns

`void`

***

### useConfig()

```ts
useConfig(): () => T;
```

Defined in: [plugin/configStore.ts:82](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/plugin/configStore.ts#L82)

Creates a custom React hook for accessing the plugin's configuration state reactively.

This hook allows components to access and react to changes in the plugin's configuration.

#### Returns

A custom React hook that returns the configuration state.

() => `T`
