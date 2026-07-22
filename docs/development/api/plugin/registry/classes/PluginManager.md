# Class: PluginManager

Defined in: [components/App/pluginManager.ts:36](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/components/App/pluginManager.ts#L36)

A wrapper class for initiating calls to Electron via desktopApi for managing plugins.

## Constructors

### Constructor

```ts
new PluginManager(): PluginManager;
```

#### Returns

`PluginManager`

## Methods

### cancel()

```ts
static cancel(identifier: string): Promise<void>;
```

Defined in: [components/App/pluginManager.ts:146](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/components/App/pluginManager.ts#L146)

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

***

### getStatus()

```ts
static getStatus(identifier: string): Promise<ProgressResp>;
```

Defined in: [components/App/pluginManager.ts:202](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/components/App/pluginManager.ts#L202)

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

***

### install()

```ts
static install(
   identifier: string, 
   name: string, 
   URL: string): void;
```

Defined in: [components/App/pluginManager.ts:85](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/components/App/pluginManager.ts#L85)

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

***

### list()

```ts
static list(): Promise<Record<string, any> | undefined>;
```

Defined in: [components/App/pluginManager.ts:171](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/components/App/pluginManager.ts#L171)

Sends a request to list all installed plugins.

#### Returns

`Promise`\<`Record`\<`string`, `any`\> \| `undefined`\>

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

***

### uninstall()

```ts
static uninstall(identifier: string, name: string): void;
```

Defined in: [components/App/pluginManager.ts:126](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/components/App/pluginManager.ts#L126)

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

***

### update()

```ts
static update(identifier: string, name: string): void;
```

Defined in: [components/App/pluginManager.ts:106](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/components/App/pluginManager.ts#L106)

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
