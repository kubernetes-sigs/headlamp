[API](../API.md) / [plugin/lib](../modules/plugin_lib.md) / Headlamp

# Class: Headlamp

[plugin/lib](../modules/plugin_lib.md).Headlamp

This class is a more convenient way for plugins to call registerPlugin in
order to register themselves.

## Constructors

### constructor

• **new Headlamp**()

## Methods

### getProductName

▸ **getProductName**(): `string`

Returns the name of the product.

#### Returns

`string`

the name of the product.

#### Defined in

[plugin/lib.ts:172](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/plugin/lib.ts#L172)

___

### getVersion

▸ **getVersion**(): `Object`

Returns the version of Headlamp as an object with a VERSION (application version) and
GIT_VERSION (commit) fields. Like:
{ VERSION: 'v0.0.0', GIT_VERSION: '0000000000000}

#### Returns

`Object`

the version of Headlamp.

| Name | Type |
| :------ | :------ |
| `GIT_VERSION` | `any` |
| `VERSION` | `any` |

#### Defined in

[plugin/lib.ts:162](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/plugin/lib.ts#L162)

___

### isRunningAsApp

▸ `Static` **isRunningAsApp**(): `boolean`

Returns whether Headlamp is running as a desktop app.

#### Returns

`boolean`

true if Headlamp is running as a desktop app.

#### Defined in

[plugin/lib.ts:151](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/plugin/lib.ts#L151)

___

### registerPlugin

▸ `Static` **registerPlugin**(`pluginId`, `pluginObj`): `void`

Got a new plugin to add? Well, registerPlugin is your friend.

**`example`**

```javascript
const myPlugin = {
  initialize: (register) => {
    // do some stuff with register
    // use some libraries in window.pluginLib
    return true;
  }
}

Headlamp.registerPlugin("aPluginIdString", myPlugin)
```

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `pluginId` | `string` | a unique id string for your plugin. |
| `pluginObj` | [`Plugin`](plugin_lib.Plugin.md) | the plugin being added. |

#### Returns

`void`

#### Defined in

[plugin/lib.ts:106](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/plugin/lib.ts#L106)

___

### setAppMenu

▸ `Static` **setAppMenu**(`appMenuFunc`): `void`

Changes the app menu.
If Headlamp is not running as a desktop app, then this method prints an error and doesn't do anything.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `appMenuFunc` | (`currentAppMenuSpec`: ``null`` \| [`AppMenu`](../interfaces/plugin_lib.AppMenu.md)[]) => ``null`` \| [`AppMenu`](../interfaces/plugin_lib.AppMenu.md)[] | A function that receives the current app menu configuration and a new one. If the function returns null, the menu is not changed. |

#### Returns

`void`

#### Defined in

[plugin/lib.ts:135](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/plugin/lib.ts#L135)

___

### setCluster

▸ `Static` **setCluster**(`clusterReq`): `Promise`<`any`\>

Configure (or update) a cluster that can then be used throughout Headlamp.
If the request is successful, further calls to `K8s.useClustersConf()`
will show the newly configured cluster.

**Important:** This is only available in the desktop version and will result in a
bad request when running in-cluster.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `clusterReq` | [`ClusterRequest`](../interfaces/lib_k8s_apiProxy.ClusterRequest.md) | the cluster to be added or updated. |

#### Returns

`Promise`<`any`\>

a promise which completes to Headlamp's configuration (showing the list of configured clusters).

#### Defined in

[plugin/lib.ts:123](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/plugin/lib.ts#L123)
