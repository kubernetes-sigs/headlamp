# Interface: PluginListViewLoadedEvent

Defined in: [redux/headlampEventSlice.ts:470](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L470)

Event fired when the plugin list is loaded in the settings view.

## Extends

- [`HeadlampEvent`](HeadlampEvent.md)\<`HeadlampEventType.PLUGIN_LIST_VIEW`\>

## Properties

### data

```ts
data: object;
```

Defined in: [redux/headlampEventSlice.ts:472](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L472)

#### plugins

```ts
plugins: PluginInfo[];
```

The plugins that were listed.

#### Overrides

[`HeadlampEvent`](HeadlampEvent.md).[`data`](HeadlampEvent.md#data)

***

### type

```ts
type: PLUGIN_LIST_VIEW;
```

Defined in: [redux/headlampEventSlice.ts:108](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L108)

#### Inherited from

[`HeadlampEvent`](HeadlampEvent.md).[`type`](HeadlampEvent.md#type)
