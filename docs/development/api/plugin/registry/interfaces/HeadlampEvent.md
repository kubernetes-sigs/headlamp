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

[src/redux/headlampEventSlice.ts:85](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/redux/headlampEventSlice.ts#L85)

***

### type

```ts
type: EventType;
```

#### Defined in

[src/redux/headlampEventSlice.ts:84](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/redux/headlampEventSlice.ts#L84)
