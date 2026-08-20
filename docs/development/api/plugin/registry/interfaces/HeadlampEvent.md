# Interface: HeadlampEvent\<EventType\>

Defined in: [redux/headlampEventSlice.ts:87](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/redux/headlampEventSlice.ts#L87)

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

Defined in: [redux/headlampEventSlice.ts:89](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/redux/headlampEventSlice.ts#L89)

***

### type

```ts
type: EventType;
```

Defined in: [redux/headlampEventSlice.ts:88](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/redux/headlampEventSlice.ts#L88)
