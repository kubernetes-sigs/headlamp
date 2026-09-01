# Interface: LogsEvent

Defined in: [redux/headlampEventSlice.ts:240](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L240)

Event fired when viewing pod logs.

## Properties

### data

```ts
data: object;
```

Defined in: [redux/headlampEventSlice.ts:242](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L242)

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

Defined in: [redux/headlampEventSlice.ts:241](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L241)
