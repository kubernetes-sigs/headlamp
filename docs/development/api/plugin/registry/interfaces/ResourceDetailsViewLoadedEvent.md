# Interface: ResourceDetailsViewLoadedEvent

Event fired when a resource is loaded in the details view.

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

#### resource

```ts
resource: KubeObject<any>;
```

The resource that was loaded.

#### Defined in

[src/redux/headlampEventSlice.ts:285](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/redux/headlampEventSlice.ts#L285)

***

### type

```ts
type: DETAILS_VIEW;
```

#### Defined in

[src/redux/headlampEventSlice.ts:284](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/redux/headlampEventSlice.ts#L284)
