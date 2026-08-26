# Interface: PluginLoadingErrorEvent

Defined in: [redux/headlampEventSlice.ts:281](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/redux/headlampEventSlice.ts#L281)

Event fired when there is an error while loading a plugin.

## Properties

### data

```ts
data: object;
```

Defined in: [redux/headlampEventSlice.ts:283](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/redux/headlampEventSlice.ts#L283)

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

Defined in: [redux/headlampEventSlice.ts:282](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/redux/headlampEventSlice.ts#L282)
