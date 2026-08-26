# Interface: EditResourceEvent

Defined in: [redux/headlampEventSlice.ts:132](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/redux/headlampEventSlice.ts#L132)

Event fired when editing a resource.

## Properties

### data

```ts
data: object;
```

Defined in: [redux/headlampEventSlice.ts:134](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/redux/headlampEventSlice.ts#L134)

#### resource

```ts
resource: KubeObject;
```

The resource for which the deletion was called.

#### status

```ts
status: OPENED | CLOSED;
```

What exactly this event represents. 'OPEN' when the edit dialog is opened. 'CLOSED' when it
is closed.

***

### type

```ts
type: EDIT_RESOURCE;
```

Defined in: [redux/headlampEventSlice.ts:133](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/redux/headlampEventSlice.ts#L133)
