# Interface: PluginDetailsViewLoadedEvent

Defined in: [redux/headlampEventSlice.ts:481](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L481)

Event fired when a plugin's settings details view is loaded.

## Extends

- [`HeadlampEvent`](HeadlampEvent.md)\<`HeadlampEventType.PLUGIN_DETAILS_VIEW`\>

## Properties

### data

```ts
data: object;
```

Defined in: [redux/headlampEventSlice.ts:483](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L483)

#### plugin

```ts
plugin: PluginInfo;
```

The plugin whose details are being displayed.

#### Overrides

[`HeadlampEvent`](HeadlampEvent.md).[`data`](HeadlampEvent.md#data)

***

### type

```ts
type: PLUGIN_DETAILS_VIEW;
```

Defined in: [redux/headlampEventSlice.ts:108](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L108)

#### Inherited from

[`HeadlampEvent`](HeadlampEvent.md).[`type`](HeadlampEvent.md#type)
