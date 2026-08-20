# Interface: ResourceListViewLoadedEvent

Defined in: [redux/headlampEventSlice.ts:350](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/redux/headlampEventSlice.ts#L350)

Event fired when a list view is loaded for a resource.

## Properties

### data

```ts
data: object;
```

Defined in: [redux/headlampEventSlice.ts:352](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/redux/headlampEventSlice.ts#L352)

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

Defined in: [redux/headlampEventSlice.ts:351](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/redux/headlampEventSlice.ts#L351)
