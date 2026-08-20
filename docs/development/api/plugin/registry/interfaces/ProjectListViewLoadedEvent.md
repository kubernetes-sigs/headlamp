# Interface: ProjectListViewLoadedEvent

Defined in: [redux/headlampEventSlice.ts:378](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/redux/headlampEventSlice.ts#L378)

Event fired when the project list view is loaded.

## Extends

- [`HeadlampEvent`](HeadlampEvent.md)\<`HeadlampEventType.PROJECT_LIST_VIEW`\>

## Properties

### data

```ts
data: object;
```

Defined in: [redux/headlampEventSlice.ts:380](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/redux/headlampEventSlice.ts#L380)

#### projects

```ts
projects: ProjectDefinition[];
```

The list of projects that were loaded.

#### Overrides

[`HeadlampEvent`](HeadlampEvent.md).[`data`](HeadlampEvent.md#data)

***

### type

```ts
type: PROJECT_LIST_VIEW;
```

Defined in: [redux/headlampEventSlice.ts:108](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/redux/headlampEventSlice.ts#L108)

#### Inherited from

[`HeadlampEvent`](HeadlampEvent.md).[`type`](HeadlampEvent.md#type)
