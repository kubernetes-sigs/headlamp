# Interface: DeleteProjectEvent

Defined in: [redux/headlampEventSlice.ts:433](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L433)

Event fired when a project is to be deleted.

## Extends

- [`HeadlampEvent`](HeadlampEvent.md)\<`HeadlampEventType.DELETE_PROJECT`\>

## Properties

### data

```ts
data: object;
```

Defined in: [redux/headlampEventSlice.ts:434](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L434)

#### deleteNamespaces

```ts
deleteNamespaces: boolean;
```

Whether the project's namespaces are deleted along with the project.

#### project

```ts
project: ProjectDefinition;
```

The project for which the deletion was called.

#### status

```ts
status: CONFIRMED;
```

What exactly this event represents. 'CONFIRMED' when the user confirms the deletion of a
project. For now only 'CONFIRMED' is sent.

#### Overrides

[`HeadlampEvent`](HeadlampEvent.md).[`data`](HeadlampEvent.md#data)

***

### type

```ts
type: DELETE_PROJECT;
```

Defined in: [redux/headlampEventSlice.ts:108](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L108)

#### Inherited from

[`HeadlampEvent`](HeadlampEvent.md).[`type`](HeadlampEvent.md#type)
