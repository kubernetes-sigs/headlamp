# Interface: ResourceListViewLoadedEvent

Defined in: [redux/headlampEventSlice.ts:350](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L350)

Event fired when a list view is loaded for a resource.

## Properties

### data

```ts
data: object;
```

Defined in: [redux/headlampEventSlice.ts:352](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L352)

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

Defined in: [redux/headlampEventSlice.ts:351](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L351)
