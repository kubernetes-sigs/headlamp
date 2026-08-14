# Interface: TerminalEvent

Defined in: [redux/headlampEventSlice.ts:238](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/redux/headlampEventSlice.ts#L238)

Event fired when using the terminal.

## Properties

### data

```ts
data: object;
```

Defined in: [redux/headlampEventSlice.ts:240](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/redux/headlampEventSlice.ts#L240)

#### resource?

```ts
optional resource?: KubeObject<any>;
```

The resource for which the terminal was opened (currently this only happens for Pod instances).

#### status

```ts
status: OPENED | CLOSED;
```

What exactly this event represents. 'OPEN' when the terminal is opened. 'CLOSED' when it
is closed.

***

### type

```ts
type: TERMINAL;
```

Defined in: [redux/headlampEventSlice.ts:239](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/redux/headlampEventSlice.ts#L239)
