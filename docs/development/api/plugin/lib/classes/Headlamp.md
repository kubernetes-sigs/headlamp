# Class: `abstract` Headlamp

This class is a more convenient way for plugins to call registerPlugin in
order to register themselves.

## Constructors

### new Headlamp()

```ts
new Headlamp(): Headlamp
```

#### Returns

[`Headlamp`](Headlamp.md)

## Methods

### getProductName()

```ts
getProductName(): string
```

Returns the name of the product.

#### Returns

`string`

the name of the product.

#### Defined in

[src/plugin/lib.ts:190](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/plugin/lib.ts#L190)

***

### getVersion()

```ts
getVersion(): object
```

Returns the version of Headlamp as an object with a VERSION (application version) and
GIT_VERSION (commit) fields. Like:
{ VERSION: 'v0.0.0', GIT_VERSION: '0000000000000}

#### Returns

`object`

the version of Headlamp.

##### GIT\_VERSION

```ts
GIT_VERSION: any;
```

##### VERSION

```ts
VERSION: any;
```

#### Defined in

[src/plugin/lib.ts:180](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/plugin/lib.ts#L180)

***

### isRunningAsApp()

```ts
static isRunningAsApp(): boolean
```

Returns whether Headlamp is running as a desktop app.

#### Returns

`boolean`

true if Headlamp is running as a desktop app.

#### Defined in

[src/plugin/lib.ts:169](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/plugin/lib.ts#L169)

***

### registerPlugin()

```ts
static registerPlugin(pluginId: string, pluginObj: Plugin): void
```

Got a new plugin to add? Well, registerPlugin is your friend.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `pluginId` | `string` | a unique id string for your plugin. |
| `pluginObj` | [`Plugin`](Plugin.md) | the plugin being added. |

#### Returns

`void`

#### Example

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

#### Defined in

[src/plugin/lib.ts:124](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/plugin/lib.ts#L124)

***

### setAppMenu()

```ts
static setAppMenu(appMenuFunc: (currentAppMenuSpec: null | AppMenu[]) => null | AppMenu[]): void
```

Changes the app menu.
If Headlamp is not running as a desktop app, then this method prints an error and doesn't do anything.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `appMenuFunc` | (`currentAppMenuSpec`: `null` \| [`AppMenu`](../interfaces/AppMenu.md)[]) => `null` \| [`AppMenu`](../interfaces/AppMenu.md)[] | A function that receives the current app menu configuration and a new one. If the function returns null, the menu is not changed. |

#### Returns

`void`

#### Defined in

[src/plugin/lib.ts:153](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/plugin/lib.ts#L153)

***

### setCluster()

```ts
static setCluster(clusterReq: ClusterRequest): Promise<any>
```

Configure (or update) a cluster that can then be used throughout Headlamp.
If the request is successful, further calls to `K8s.useClustersConf()`
will show the newly configured cluster.

**Important:** This is only available in the desktop version and will result in a
bad request when running in-cluster.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `clusterReq` | [`ClusterRequest`](../../../lib/k8s/api/v1/clusterRequests/interfaces/ClusterRequest.md) | the cluster to be added or updated. |

#### Returns

`Promise`\<`any`\>

a promise which completes to Headlamp's configuration (showing the list of configured clusters).

#### Defined in

[src/plugin/lib.ts:141](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/plugin/lib.ts#L141)
