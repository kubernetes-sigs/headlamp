# Interface: EditResourceEvent

Defined in: [redux/headlampEventSlice.ts:152](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L152)

Event fired when editing a resource.

## Properties

### data

```ts
data: object;
```

Defined in: [redux/headlampEventSlice.ts:154](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L154)

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

Defined in: [redux/headlampEventSlice.ts:153](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L153)
