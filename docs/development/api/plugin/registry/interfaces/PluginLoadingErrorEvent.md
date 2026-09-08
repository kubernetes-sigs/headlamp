# Interface: PluginLoadingErrorEvent

Defined in: [redux/headlampEventSlice.ts:301](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L301)

Event fired when there is an error while loading a plugin.

## Properties

### data

```ts
data: object;
```

Defined in: [redux/headlampEventSlice.ts:303](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L303)

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

Defined in: [redux/headlampEventSlice.ts:302](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L302)
