# Interface: ProjectDetailsViewLoadedEvent

Defined in: [redux/headlampEventSlice.ts:389](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L389)

Event fired when a project is loaded in the project details view.

## Extends

- [`HeadlampEvent`](HeadlampEvent.md)\<`HeadlampEventType.PROJECT_DETAILS_VIEW`\>

## Properties

### data

```ts
data: object;
```

Defined in: [redux/headlampEventSlice.ts:391](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L391)

#### project

```ts
project: ProjectDefinition;
```

The project that was loaded.

#### resources

```ts
resources: KubeObject<any>[];
```

The resources belonging to the project.

#### Overrides

[`HeadlampEvent`](HeadlampEvent.md).[`data`](HeadlampEvent.md#data)

***

### type

```ts
type: PROJECT_DETAILS_VIEW;
```

Defined in: [redux/headlampEventSlice.ts:108](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L108)

#### Inherited from

[`HeadlampEvent`](HeadlampEvent.md).[`type`](HeadlampEvent.md#type)
