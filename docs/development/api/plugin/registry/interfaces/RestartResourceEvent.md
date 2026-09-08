# Interface: RestartResourceEvent

Defined in: [redux/headlampEventSlice.ts:198](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L198)

Event fired when restarting a resource.

## Extends

- [`HeadlampEvent`](HeadlampEvent.md)\<`HeadlampEventType.RESTART_RESOURCE`\>

## Properties

### data

```ts
data: object;
```

Defined in: [redux/headlampEventSlice.ts:199](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L199)

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

Defined in: [redux/headlampEventSlice.ts:108](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L108)

#### Inherited from

[`HeadlampEvent`](HeadlampEvent.md).[`type`](HeadlampEvent.md#type)
