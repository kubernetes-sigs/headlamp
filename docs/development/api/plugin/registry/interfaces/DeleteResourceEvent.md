# Interface: DeleteResourceEvent

Event fired when a resource is to be deleted.

## Extends

- [`HeadlampEvent`](HeadlampEvent.md)\<`HeadlampEventType.DELETE_RESOURCE`\>

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
status: CONFIRMED;
```

What exactly this event represents. 'CONFIRMED' when the user confirms the deletion of a resource.
For now only 'CONFIRMED' is sent.

#### Overrides

[`HeadlampEvent`](HeadlampEvent.md).[`data`](HeadlampEvent.md#data)

#### Defined in

[src/redux/headlampEventSlice.ts:101](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/redux/headlampEventSlice.ts#L101)

***

### type

```ts
type: DELETE_RESOURCE;
```

#### Inherited from

[`HeadlampEvent`](HeadlampEvent.md).[`type`](HeadlampEvent.md#type)

#### Defined in

[src/redux/headlampEventSlice.ts:84](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/redux/headlampEventSlice.ts#L84)
