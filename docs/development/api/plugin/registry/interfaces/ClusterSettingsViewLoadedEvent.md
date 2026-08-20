# Interface: ClusterSettingsViewLoadedEvent

Defined in: [redux/headlampEventSlice.ts:459](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/redux/headlampEventSlice.ts#L459)

Event fired when the cluster settings view is loaded.

## Extends

- [`HeadlampEvent`](HeadlampEvent.md)\<`HeadlampEventType.CLUSTER_SETTINGS_VIEW`\>

## Properties

### data

```ts
data: object;
```

Defined in: [redux/headlampEventSlice.ts:461](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/redux/headlampEventSlice.ts#L461)

#### cluster

```ts
cluster: string;
```

The cluster whose settings are being displayed.

#### Overrides

[`HeadlampEvent`](HeadlampEvent.md).[`data`](HeadlampEvent.md#data)

***

### type

```ts
type: CLUSTER_SETTINGS_VIEW;
```

Defined in: [redux/headlampEventSlice.ts:108](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/redux/headlampEventSlice.ts#L108)

#### Inherited from

[`HeadlampEvent`](HeadlampEvent.md).[`type`](HeadlampEvent.md#type)
