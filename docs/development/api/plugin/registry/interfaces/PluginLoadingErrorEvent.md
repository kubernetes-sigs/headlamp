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

[src/redux/headlampEventSlice.ts:249](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/redux/headlampEventSlice.ts#L249)

***

### type

```ts
type: PLUGIN_LOADING_ERROR;
```

#### Defined in

[src/redux/headlampEventSlice.ts:248](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/redux/headlampEventSlice.ts#L248)
