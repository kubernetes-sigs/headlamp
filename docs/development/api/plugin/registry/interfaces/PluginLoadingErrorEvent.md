# Interface: PluginLoadingErrorEvent

Defined in: [redux/headlampEventSlice.ts:281](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/redux/headlampEventSlice.ts#L281)

Event fired when there is an error while loading a plugin.

## Properties

### data

```ts
data: object;
```

Defined in: [redux/headlampEventSlice.ts:283](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/redux/headlampEventSlice.ts#L283)

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

##### pluginInfo.name

```ts
name: string;
```

The name of the plugin.

##### pluginInfo.version

```ts
version: string;
```

The version of the plugin.

***

### type

```ts
type: PLUGIN_LOADING_ERROR;
```

Defined in: [redux/headlampEventSlice.ts:282](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/redux/headlampEventSlice.ts#L282)
