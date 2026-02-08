# Interface: RestartResourceEvent

Event fired when restarting a resource.

## Extends

- [`HeadlampEvent`](HeadlampEvent.md)\<`HeadlampEventType.RESTART_RESOURCE`\>

## Properties

### data

```ts
data: object;
```

#### resource

```ts
resource: KubeObject<any>;
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

#### Defined in

[src/redux/headlampEventSlice.ts:159](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/redux/headlampEventSlice.ts#L159)

***

### type

```ts
type: RESTART_RESOURCE;
```

#### Inherited from

[`HeadlampEvent`](HeadlampEvent.md).[`type`](HeadlampEvent.md#type)

#### Defined in

[src/redux/headlampEventSlice.ts:84](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/redux/headlampEventSlice.ts#L84)
