# Interface: TerminalEvent

Defined in: [redux/headlampEventSlice.ts:258](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/redux/headlampEventSlice.ts#L258)

Event fired when using the terminal.

## Properties

### data

```ts
data: object;
```

Defined in: [redux/headlampEventSlice.ts:260](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/redux/headlampEventSlice.ts#L260)

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

Defined in: [redux/headlampEventSlice.ts:259](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/redux/headlampEventSlice.ts#L259)
