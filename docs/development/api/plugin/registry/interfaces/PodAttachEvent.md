# Interface: PodAttachEvent

Event fired when attaching to a pod.

## Properties

### data

```ts
data: object;
```

#### resource?

```ts
optional resource: Pod;
```

The resource for which the terminal was opened (currently this only happens for Pod instances).

#### status

```ts
status: OPENED | CLOSED;
```

What exactly this event represents. 'OPEN' when the attach dialog is opened. 'CLOSED' when it
is closed.

#### Defined in

[src/redux/headlampEventSlice.ts:221](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/redux/headlampEventSlice.ts#L221)

***

### type

```ts
type: POD_ATTACH;
```

#### Defined in

[src/redux/headlampEventSlice.ts:220](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/redux/headlampEventSlice.ts#L220)
