# Interface: ResourceListViewLoadedEvent

Event fired when a list view is loaded for a resource.

## Properties

### data

```ts
data: object;
```

#### error?

```ts
optional error: Error;
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

#### Defined in

[src/redux/headlampEventSlice.ts:298](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/redux/headlampEventSlice.ts#L298)

***

### type

```ts
type: LIST_VIEW;
```

#### Defined in

[src/redux/headlampEventSlice.ts:297](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/redux/headlampEventSlice.ts#L297)
