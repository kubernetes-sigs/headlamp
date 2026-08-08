# Interface: ScaleResourceEvent

Defined in: [redux/headlampEventSlice.ts:147](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/redux/headlampEventSlice.ts#L147)

Event fired when scaling a resource.

## Properties

### data

```ts
data: object;
```

Defined in: [redux/headlampEventSlice.ts:149](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/redux/headlampEventSlice.ts#L149)

#### resource

```ts
resource: KubeObject;
```

The resource for which the deletion was called.

#### status

```ts
status: CONFIRMED;
```

What exactly this event represents. 'CONFIRMED' when the scaling is selected by the user.
For now only 'CONFIRMED' is sent.

***

### type

```ts
type: SCALE_RESOURCE;
```

Defined in: [redux/headlampEventSlice.ts:148](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/redux/headlampEventSlice.ts#L148)
