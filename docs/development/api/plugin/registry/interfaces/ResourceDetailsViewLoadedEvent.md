# Interface: ResourceDetailsViewLoadedEvent

Defined in: [redux/headlampEventSlice.ts:317](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/redux/headlampEventSlice.ts#L317)

Event fired when a resource is loaded in the details view.

## Properties

### data

```ts
data: object;
```

Defined in: [redux/headlampEventSlice.ts:319](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/redux/headlampEventSlice.ts#L319)

#### error?

```ts
optional error?: Error;
```

The error, if an error has occurred

#### resource

```ts
resource: KubeObject;
```

The resource that was loaded.

***

### type

```ts
type: DETAILS_VIEW;
```

Defined in: [redux/headlampEventSlice.ts:318](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/redux/headlampEventSlice.ts#L318)
