# Interface: HeadlampEvent\<EventType\>

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
optional data: unknown;
```

#### Defined in

[src/redux/headlampEventSlice.ts:85](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/redux/headlampEventSlice.ts#L85)

***

### type

```ts
type: EventType;
```

#### Defined in

[src/redux/headlampEventSlice.ts:84](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/redux/headlampEventSlice.ts#L84)
