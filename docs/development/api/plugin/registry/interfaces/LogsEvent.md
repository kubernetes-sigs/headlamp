# Interface: LogsEvent

Defined in: [redux/headlampEventSlice.ts:220](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/redux/headlampEventSlice.ts#L220)

Event fired when viewing pod logs.

## Properties

### data

```ts
data: object;
```

Defined in: [redux/headlampEventSlice.ts:222](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/redux/headlampEventSlice.ts#L222)

#### resource?

```ts
optional resource?: KubeObject<any>;
```

The resource for which the terminal was opened (currently this only happens for Pod instances).

#### status

```ts
status: OPENED | CLOSED;
```

What exactly this event represents. 'OPEN' when the logs dialog is opened. 'CLOSED' when it
is closed.

***

### type

```ts
type: LOGS;
```

Defined in: [redux/headlampEventSlice.ts:221](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/redux/headlampEventSlice.ts#L221)
