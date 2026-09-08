# Interface: PodAttachEvent

Defined in: [redux/headlampEventSlice.ts:273](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L273)

Event fired when attaching to a pod.

## Properties

### data

```ts
data: object;
```

Defined in: [redux/headlampEventSlice.ts:275](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L275)

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

Defined in: [redux/headlampEventSlice.ts:274](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L274)
