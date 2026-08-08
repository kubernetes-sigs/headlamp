# Interface: DeleteResourceEvent

Defined in: [redux/headlampEventSlice.ts:104](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/redux/headlampEventSlice.ts#L104)

Event fired when a resource is to be deleted.

## Extends

- [`HeadlampEvent`](HeadlampEvent.md)\<`HeadlampEventType.DELETE_RESOURCE`\>

## Properties

### data

```ts
data: object;
```

Defined in: [redux/headlampEventSlice.ts:105](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/redux/headlampEventSlice.ts#L105)

#### resource

```ts
resource: KubeObject;
```

The resource for which the deletion was called.

#### status

```ts
status: CONFIRMED;
```

What exactly this event represents. 'CONFIRMED' when the user confirms the deletion of a resource.
For now only 'CONFIRMED' is sent.

#### Overrides

[`HeadlampEvent`](HeadlampEvent.md).[`data`](HeadlampEvent.md#data)

***

### type

```ts
type: DELETE_RESOURCE;
```

Defined in: [redux/headlampEventSlice.ts:88](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/redux/headlampEventSlice.ts#L88)

#### Inherited from

[`HeadlampEvent`](HeadlampEvent.md).[`type`](HeadlampEvent.md#type)
