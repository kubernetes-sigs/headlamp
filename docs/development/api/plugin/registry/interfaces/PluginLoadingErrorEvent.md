# Interface: PluginLoadingErrorEvent

Event fired when there is an error while loading a plugin.

## Properties

### data

```ts
data: object;
```

#### error

```ts
error: Error;
```

The error that occurred while loading the plugin.

#### pluginInfo

```ts
pluginInfo: object;
```

Information about the plugin.

#### pluginInfo.name

```ts
name: string;
```

The name of the plugin.

#### pluginInfo.version

```ts
version: string;
```

The version of the plugin.

#### Defined in

[src/redux/headlampEventSlice.ts:249](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/redux/headlampEventSlice.ts#L249)

***

### type

```ts
type: PLUGIN_LOADING_ERROR;
```

#### Defined in

[src/redux/headlampEventSlice.ts:248](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/redux/headlampEventSlice.ts#L248)
