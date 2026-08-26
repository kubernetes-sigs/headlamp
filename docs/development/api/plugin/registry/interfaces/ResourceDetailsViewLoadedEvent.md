# Interface: ResourceDetailsViewLoadedEvent

Defined in: [redux/headlampEventSlice.ts:337](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/redux/headlampEventSlice.ts#L337)

Event fired when a resource is loaded in the details view.

## Properties

### data

```ts
data: object;
```

Defined in: [redux/headlampEventSlice.ts:339](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/redux/headlampEventSlice.ts#L339)

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

Defined in: [redux/headlampEventSlice.ts:338](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/redux/headlampEventSlice.ts#L338)
