# Interface: RestartResourceEvent

Defined in: [redux/headlampEventSlice.ts:178](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/redux/headlampEventSlice.ts#L178)

Event fired when restarting a resource.

## Extends

- [`HeadlampEvent`](HeadlampEvent.md)\<`HeadlampEventType.RESTART_RESOURCE`\>

## Properties

### data

```ts
data: object;
```

Defined in: [redux/headlampEventSlice.ts:179](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/redux/headlampEventSlice.ts#L179)

#### resource

```ts
resource: KubeObject;
```

The resource for which restart was called.

#### status

```ts
status: CONFIRMED;
```

What exactly this event represents. 'CONFIRMED' when restart is selected by the user.
For now only 'CONFIRMED' is sent.

#### Overrides

[`HeadlampEvent`](HeadlampEvent.md).[`data`](HeadlampEvent.md#data)

***

### type

```ts
type: RESTART_RESOURCE;
```

Defined in: [redux/headlampEventSlice.ts:88](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/redux/headlampEventSlice.ts#L88)

#### Inherited from

[`HeadlampEvent`](HeadlampEvent.md).[`type`](HeadlampEvent.md#type)
