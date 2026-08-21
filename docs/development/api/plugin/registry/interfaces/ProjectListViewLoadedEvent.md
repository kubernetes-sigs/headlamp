# Interface: ProjectListViewLoadedEvent

Defined in: [redux/headlampEventSlice.ts:378](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L378)

Event fired when the project list view is loaded.

## Extends

- [`HeadlampEvent`](HeadlampEvent.md)\<`HeadlampEventType.PROJECT_LIST_VIEW`\>

## Properties

### data

```ts
data: object;
```

Defined in: [redux/headlampEventSlice.ts:380](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L380)

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

Defined in: [redux/headlampEventSlice.ts:108](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L108)

#### Inherited from

[`HeadlampEvent`](HeadlampEvent.md).[`type`](HeadlampEvent.md#type)
