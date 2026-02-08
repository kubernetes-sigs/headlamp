# Interface: EventListEvent

Event fired when kubernetes events are loaded (for a resource or not).

## Properties

### data

```ts
data: object;
```

#### events

```ts
events: Event[];
```

The list of events that were loaded.

#### resource?

```ts
optional resource: KubeObject<any>;
```

The resource for which the events were loaded.

#### Defined in

[src/redux/headlampEventSlice.ts:313](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/redux/headlampEventSlice.ts#L313)

***

### type

```ts
type: OBJECT_EVENTS;
```

#### Defined in

[src/redux/headlampEventSlice.ts:312](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/redux/headlampEventSlice.ts#L312)
