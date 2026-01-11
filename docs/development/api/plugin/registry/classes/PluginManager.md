# Class: PluginManager

A wrapper class for initiating calls to Electron via desktopApi for managing plugins.

## Constructors

### new PluginManager()

```ts
new PluginManager(): PluginManager
```

#### Returns

[`PluginManager`](PluginManager.md)

## Methods

### cancel()

```ts
static cancel(identifier: string): Promise<void>
```

Sends a request to cancel the operation (install, update, uninstall) for a plugin with the specified identifier.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `identifier` | `string` | The unique identifier for the plugin. |

#### Returns

`Promise`\<`void`\>

#### Static

#### Async

#### Example

```ts
PluginManager.cancel('pluginID');
```

#### Defined in

[src/components/App/pluginManager.ts:146](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/components/App/pluginManager.ts#L146)

***

### getStatus()

```ts
static getStatus(identifier: string): Promise<ProgressResp>
```

Sends a request to get the status of a plugin with the specified identifier.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `identifier` | `string` | The unique identifier for the plugin. |

#### Returns

`Promise`\<`ProgressResp`\>

- A promise that resolves with the status of the plugin, or rejects with an error if the message limit or timeout is exceeded.

#### Static

#### Async

#### Example

```ts
try {
  const status = await PluginManager.getStatus('pluginID');
  console.log('Plugin status:', status);
} catch (error) {
  console.error('Error:', error.message);
}
```

#### Defined in

[src/components/App/pluginManager.ts:202](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/components/App/pluginManager.ts#L202)

***

### install()

```ts
static install(
   identifier: string, 
   name: string, 
   URL: string): void
```

Sends a request to install a plugin from the specified ArtifactHub URL.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `identifier` | `string` | The unique identifier for the plugin. |
| `name` | `string` | The name of the plugin to be installed. |
| `URL` | `string` | The URL from where the plugin will be installed. |

#### Returns

`void`

#### Static

#### Example

```ts
PluginManager.install('pluginID', ' https://artifacthub.io/packages/headlamp/<repo_name>/<plugin_name>');
```

#### Defined in

[src/components/App/pluginManager.ts:85](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/components/App/pluginManager.ts#L85)

***

### list()

```ts
static list(): Promise<undefined | Record<string, any>>
```

Sends a request to list all installed plugins.

#### Returns

`Promise`\<`undefined` \| `Record`\<`string`, `any`\>\>

- A promise that resolves with a record of all installed plugins, or undefined if there was an error.

#### Throws

- Throws an error if the response type is 'error'.

#### Static

#### Async

#### Example

```ts
try {
  const plugins = await PluginManager.list();
  console.log('Installed plugins:', plugins);
} catch (error) {
  console.error('Error:', error.message);
}
```

#### Defined in

[src/components/App/pluginManager.ts:171](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/components/App/pluginManager.ts#L171)

***

### uninstall()

```ts
static uninstall(identifier: string, name: string): void
```

Sends a request to uninstall a plugin with the specified identifier and name.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `identifier` | `string` | The unique identifier for the plugin. |
| `name` | `string` | The name of the plugin to be uninstalled. |

#### Returns

`void`

#### Static

#### Example

```ts
PluginManager.uninstall('pluginID', 'my-plugin');
```

#### Defined in

[src/components/App/pluginManager.ts:126](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/components/App/pluginManager.ts#L126)

***

### update()

```ts
static update(identifier: string, name: string): void
```

Sends a request to update a plugin with the specified identifier and name.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `identifier` | `string` | The unique identifier for the plugin. |
| `name` | `string` | The name of the plugin to be updated. |

#### Returns

`void`

#### Static

#### Example

```ts
PluginManager.update('pluginID', 'my-plugin');
```

#### Defined in

[src/components/App/pluginManager.ts:106](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/components/App/pluginManager.ts#L106)
