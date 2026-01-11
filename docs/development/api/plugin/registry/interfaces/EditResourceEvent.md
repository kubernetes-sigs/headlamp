# Interface: EditResourceEvent

Event fired when editing a resource.

## Properties

### data

```ts
data: object;
```

#### resource

```ts
resource: KubeObject<any>;
```

The resource for which the deletion was called.

#### status

```ts
status: OPENED | CLOSED;
```

What exactly this event represents. 'OPEN' when the edit dialog is opened. 'CLOSED' when it
is closed.

#### Defined in

[src/redux/headlampEventSlice.ts:130](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/redux/headlampEventSlice.ts#L130)

***

### type

```ts
type: EDIT_RESOURCE;
```

#### Defined in

[src/redux/headlampEventSlice.ts:129](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/redux/headlampEventSlice.ts#L129)
