# Interface: EventListEvent

Defined in: [redux/headlampEventSlice.ts:365](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L365)

Event fired when kubernetes events are loaded (for a resource or not).

## Properties

### data

```ts
data: object;
```

Defined in: [redux/headlampEventSlice.ts:367](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L367)

#### events

```ts
events: Event[];
```

The list of events that were loaded.

#### resource?

```ts
optional resource?: KubeObject<any>;
```

The resource for which the events were loaded.

***

### type

```ts
type: OBJECT_EVENTS;
```

Defined in: [redux/headlampEventSlice.ts:366](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L366)
