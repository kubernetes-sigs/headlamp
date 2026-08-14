# Interface: EventListEvent

Defined in: [redux/headlampEventSlice.ts:345](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/redux/headlampEventSlice.ts#L345)

Event fired when kubernetes events are loaded (for a resource or not).

## Properties

### data

```ts
data: object;
```

Defined in: [redux/headlampEventSlice.ts:347](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/redux/headlampEventSlice.ts#L347)

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

Defined in: [redux/headlampEventSlice.ts:346](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/redux/headlampEventSlice.ts#L346)
