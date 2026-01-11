# Class: ConfigStore\<T\>

A class to manage the configuration state for plugins in a Redux store.

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| `T` | The type of the configuration object. |

## Constructors

### new ConfigStore()

```ts
new ConfigStore<T>(configKey: string): ConfigStore<T>
```

Creates an instance of the ConfigStore class.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `configKey` | `string` | The key to identify the specific plugin configuration. |

#### Returns

[`ConfigStore`](ConfigStore.md)\<`T`\>

#### Defined in

[src/plugin/configStore.ts:34](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/plugin/configStore.ts#L34)

## Methods

### get()

```ts
get(): T
```

Retrieves the current configuration for the specified key from the Redux store.

#### Returns

`T`

The current configuration object.

#### Defined in

[src/plugin/configStore.ts:70](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/plugin/configStore.ts#L70)

***

### set()

```ts
set(configValue: T): void
```

Sets the entire configuration for a specific plugin.

This method will overwrite the entire configuration object for the given key.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `configValue` | `T` | The new configuration object. |

#### Returns

`void`

#### Defined in

[src/plugin/configStore.ts:45](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/plugin/configStore.ts#L45)

***

### update()

```ts
update(partialUpdates: Partial<T>): void
```

Updates the configuration for a specific plugin.

This method will merge the provided partial updates into the current configuration object.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `partialUpdates` | `Partial`\<`T`\> | An object containing the updates to be merged into the current configuration. |

#### Returns

`void`

#### Defined in

[src/plugin/configStore.ts:61](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/plugin/configStore.ts#L61)

***

### useConfig()

```ts
useConfig(): () => T
```

Creates a custom React hook for accessing the plugin's configuration state reactively.

This hook allows components to access and react to changes in the plugin's configuration.

#### Returns

`Function`

A custom React hook that returns the configuration state.

##### Returns

`T`

#### Defined in

[src/plugin/configStore.ts:82](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/plugin/configStore.ts#L82)
