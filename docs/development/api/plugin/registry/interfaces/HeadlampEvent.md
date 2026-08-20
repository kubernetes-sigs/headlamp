# Interface: HeadlampEvent\<EventType\>

Defined in: [redux/headlampEventSlice.ts:107](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/redux/headlampEventSlice.ts#L107)

Represents a Headlamp event. It can be one of the default events or a custom event.

## Extended by

- [`DeleteResourceEvent`](DeleteResourceEvent.md)
- [`RestartResourceEvent`](RestartResourceEvent.md)
- [`ProjectListViewLoadedEvent`](ProjectListViewLoadedEvent.md)
- [`ProjectDetailsViewLoadedEvent`](ProjectDetailsViewLoadedEvent.md)
- [`ProjectDetailsTabChangeEvent`](ProjectDetailsTabChangeEvent.md)
- [`CreateProjectEvent`](CreateProjectEvent.md)
- [`DeleteProjectEvent`](DeleteProjectEvent.md)
- [`SettingsViewLoadedEvent`](SettingsViewLoadedEvent.md)
- [`ClusterSettingsViewLoadedEvent`](ClusterSettingsViewLoadedEvent.md)
- [`PluginListViewLoadedEvent`](PluginListViewLoadedEvent.md)
- [`PluginDetailsViewLoadedEvent`](PluginDetailsViewLoadedEvent.md)

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `EventType` | `HeadlampEventType` \| `string` |

## Properties

### data?

```ts
optional data?: unknown;
```

Defined in: [redux/headlampEventSlice.ts:109](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/redux/headlampEventSlice.ts#L109)

***

### type

```ts
type: EventType;
```

Defined in: [redux/headlampEventSlice.ts:108](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/redux/headlampEventSlice.ts#L108)
