# Interface: PluginListViewLoadedEvent

Defined in: [redux/headlampEventSlice.ts:470](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/redux/headlampEventSlice.ts#L470)

Event fired when the plugin list is loaded in the settings view.

## Extends

- [`HeadlampEvent`](HeadlampEvent.md)\<`HeadlampEventType.PLUGIN_LIST_VIEW`\>

## Properties

### data

```ts
data: object;
```

Defined in: [redux/headlampEventSlice.ts:472](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/redux/headlampEventSlice.ts#L472)

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

Defined in: [redux/headlampEventSlice.ts:108](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/redux/headlampEventSlice.ts#L108)

#### Inherited from

[`HeadlampEvent`](HeadlampEvent.md).[`type`](HeadlampEvent.md#type)
