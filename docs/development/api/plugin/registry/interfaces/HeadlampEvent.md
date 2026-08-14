# Interface: HeadlampEvent\<EventType\>

Defined in: [redux/headlampEventSlice.ts:87](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/redux/headlampEventSlice.ts#L87)

Represents a Headlamp event. It can be one of the default events or a custom event.

## Extended by

- [`DeleteResourceEvent`](DeleteResourceEvent.md)
- [`RestartResourceEvent`](RestartResourceEvent.md)

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `EventType` | `HeadlampEventType` \| `string` |

## Properties

### data?

```ts
optional data?: unknown;
```

Defined in: [redux/headlampEventSlice.ts:89](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/redux/headlampEventSlice.ts#L89)

***

### type

```ts
type: EventType;
```

Defined in: [redux/headlampEventSlice.ts:88](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/redux/headlampEventSlice.ts#L88)
