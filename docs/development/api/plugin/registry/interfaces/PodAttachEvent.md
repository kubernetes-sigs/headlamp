# Interface: PodAttachEvent

Defined in: [redux/headlampEventSlice.ts:253](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/redux/headlampEventSlice.ts#L253)

Event fired when attaching to a pod.

## Properties

### data

```ts
data: object;
```

Defined in: [redux/headlampEventSlice.ts:255](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/redux/headlampEventSlice.ts#L255)

#### resource?

```ts
optional resource?: Pod;
```

The resource for which the terminal was opened (currently this only happens for Pod instances).

#### status

```ts
status: OPENED | CLOSED;
```

What exactly this event represents. 'OPEN' when the attach dialog is opened. 'CLOSED' when it
is closed.

***

### type

```ts
type: POD_ATTACH;
```

Defined in: [redux/headlampEventSlice.ts:254](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/redux/headlampEventSlice.ts#L254)
