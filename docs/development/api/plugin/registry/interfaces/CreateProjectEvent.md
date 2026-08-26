# Interface: CreateProjectEvent

Defined in: [redux/headlampEventSlice.ts:419](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/redux/headlampEventSlice.ts#L419)

Event fired when a project is to be created.

## Extends

- [`HeadlampEvent`](HeadlampEvent.md)\<`HeadlampEventType.CREATE_PROJECT`\>

## Properties

### data

```ts
data: object;
```

Defined in: [redux/headlampEventSlice.ts:420](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/redux/headlampEventSlice.ts#L420)

#### project

```ts
project: ProjectDefinition;
```

The project for which the creation was called.

#### status

```ts
status: CONFIRMED;
```

What exactly this event represents. 'CONFIRMED' when the user confirms the creation of a
project. For now only 'CONFIRMED' is sent.

#### Overrides

[`HeadlampEvent`](HeadlampEvent.md).[`data`](HeadlampEvent.md#data)

***

### type

```ts
type: CREATE_PROJECT;
```

Defined in: [redux/headlampEventSlice.ts:108](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/redux/headlampEventSlice.ts#L108)

#### Inherited from

[`HeadlampEvent`](HeadlampEvent.md).[`type`](HeadlampEvent.md#type)
