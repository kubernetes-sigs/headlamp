[API](../API.md) / [plugin/registry](../modules/plugin_registry.md) / PluginManager

# Class: PluginManager

[plugin/registry](../modules/plugin_registry.md).PluginManager

A wrapper class for initiating calls to Electron via desktopApi for managing plugins.

## Constructors

### constructor

• **new PluginManager**()

## Methods

### cancel

▸ `Static` **cancel**(`identifier`): `Promise`<`void`\>

Sends a request to cancel the operation (install, update, uninstall) for a plugin with the specified identifier.

**`static`**

**`async`**

**`example`**
PluginManager.cancel('pluginID');

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `identifier` | `string` | The unique identifier for the plugin. |

#### Returns

`Promise`<`void`\>

#### Defined in

[components/App/pluginManager.ts:130](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/components/App/pluginManager.ts#L130)

___

### getStatus

▸ `Static` **getStatus**(`identifier`): `Promise`<`ProgressResp`\>

Sends a request to get the status of a plugin with the specified identifier.

**`static`**

**`async`**

**`example`**
try {
  const status = await PluginManager.getStatus('pluginID');
  console.log('Plugin status:', status);
} catch (error) {
  console.error('Error:', error.message);
}

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `identifier` | `string` | The unique identifier for the plugin. |

#### Returns

`Promise`<`ProgressResp`\>

- A promise that resolves with the status of the plugin, or rejects with an error if the message limit or timeout is exceeded.

#### Defined in

[components/App/pluginManager.ts:186](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/components/App/pluginManager.ts#L186)

___

### install

▸ `Static` **install**(`identifier`, `name`, `URL`): `void`

Sends a request to install a plugin from the specified ArtifactHub URL.

**`static`**

**`example`**
PluginManager.install('pluginID', ' https://artifacthub.io/packages/headlamp/<repo_name>/<plugin_name>');

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `identifier` | `string` | The unique identifier for the plugin. |
| `name` | `string` | The name of the plugin to be installed. |
| `URL` | `string` | The URL from where the plugin will be installed. |

#### Returns

`void`

#### Defined in

[components/App/pluginManager.ts:69](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/components/App/pluginManager.ts#L69)

___

### list

▸ `Static` **list**(): `Promise`<`undefined` \| `Record`<`string`, `any`\>\>

Sends a request to list all installed plugins.

**`throws`** {Error} - Throws an error if the response type is 'error'.

**`static`**

**`async`**

**`example`**
try {
  const plugins = await PluginManager.list();
  console.log('Installed plugins:', plugins);
} catch (error) {
  console.error('Error:', error.message);
}

#### Returns

`Promise`<`undefined` \| `Record`<`string`, `any`\>\>

- A promise that resolves with a record of all installed plugins, or undefined if there was an error.

#### Defined in

[components/App/pluginManager.ts:155](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/components/App/pluginManager.ts#L155)

___

### uninstall

▸ `Static` **uninstall**(`identifier`, `name`): `void`

Sends a request to uninstall a plugin with the specified identifier and name.

**`static`**

**`example`**
PluginManager.uninstall('pluginID', 'my-plugin');

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `identifier` | `string` | The unique identifier for the plugin. |
| `name` | `string` | The name of the plugin to be uninstalled. |

#### Returns

`void`

#### Defined in

[components/App/pluginManager.ts:110](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/components/App/pluginManager.ts#L110)

___

### update

▸ `Static` **update**(`identifier`, `name`): `void`

Sends a request to update a plugin with the specified identifier and name.

**`static`**

**`example`**
PluginManager.update('pluginID', 'my-plugin');

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `identifier` | `string` | The unique identifier for the plugin. |
| `name` | `string` | The name of the plugin to be updated. |

#### Returns

`void`

#### Defined in

[components/App/pluginManager.ts:90](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/components/App/pluginManager.ts#L90)
