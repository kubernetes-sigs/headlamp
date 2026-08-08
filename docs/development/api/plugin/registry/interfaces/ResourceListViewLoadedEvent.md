# Interface: ResourceListViewLoadedEvent

Defined in: [redux/headlampEventSlice.ts:330](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/redux/headlampEventSlice.ts#L330)

Event fired when a list view is loaded for a resource.

## Properties

### data

```ts
data: object;
```

Defined in: [redux/headlampEventSlice.ts:332](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/redux/headlampEventSlice.ts#L332)

#### error?

```ts
optional error?: Error;
```

The error, if an error has occurred

#### resourceKind

```ts
resourceKind: string;
```

The kind of resource that was loaded.

#### resources

```ts
resources: KubeObject<any>[];
```

The list of resources that were loaded.

***

### type

```ts
type: LIST_VIEW;
```

Defined in: [redux/headlampEventSlice.ts:331](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/redux/headlampEventSlice.ts#L331)
