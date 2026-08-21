# Interface: HeadlampEvent\<EventType\>

Defined in: [redux/headlampEventSlice.ts:107](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L107)

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

Defined in: [redux/headlampEventSlice.ts:109](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L109)

***

### type

```ts
type: EventType;
```

Defined in: [redux/headlampEventSlice.ts:108](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L108)
