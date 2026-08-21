# Interface: ProjectDetailsTabChangeEvent

Defined in: [redux/headlampEventSlice.ts:402](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L402)

Event fired when the user switches to a different tab in the project details view.

## Extends

- [`HeadlampEvent`](HeadlampEvent.md)\<`HeadlampEventType.PROJECT_DETAILS_TAB_CHANGE`\>

## Properties

### data

```ts
data: object;
```

Defined in: [redux/headlampEventSlice.ts:404](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L404)

#### previousTab

```ts
previousTab: ProjectDetailsTab;
```

The tab that was selected before.

#### project

```ts
project: ProjectDefinition;
```

The project whose details view the tab belongs to.

#### resources

```ts
resources: KubeObject<any>[];
```

The resources belonging to the project.

#### tab

```ts
tab: ProjectDetailsTab;
```

The tab that is now selected.

#### Overrides

[`HeadlampEvent`](HeadlampEvent.md).[`data`](HeadlampEvent.md#data)

***

### type

```ts
type: PROJECT_DETAILS_TAB_CHANGE;
```

Defined in: [redux/headlampEventSlice.ts:108](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L108)

#### Inherited from

[`HeadlampEvent`](HeadlampEvent.md).[`type`](HeadlampEvent.md#type)
