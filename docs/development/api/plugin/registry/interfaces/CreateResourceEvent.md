# Interface: CreateResourceEvent

Event fired when creating a resource.

## Properties

### data

```ts
data: object;
```

#### status

```ts
status: CONFIRMED;
```

What exactly this event represents. 'CONFIRMED' when the user chooses to apply the new resource.
For now only 'CONFIRMED' is sent.

#### Defined in

[src/redux/headlampEventSlice.ts:236](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/redux/headlampEventSlice.ts#L236)

***

### type

```ts
type: CREATE_RESOURCE;
```

#### Defined in

[src/redux/headlampEventSlice.ts:235](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/redux/headlampEventSlice.ts#L235)
