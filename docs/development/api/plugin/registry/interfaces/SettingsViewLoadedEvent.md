# Interface: SettingsViewLoadedEvent

Defined in: [redux/headlampEventSlice.ts:449](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/redux/headlampEventSlice.ts#L449)

Event fired when the general settings view is loaded.

## Extends

- [`HeadlampEvent`](HeadlampEvent.md)\<`HeadlampEventType.SETTINGS_VIEW`\>

## Properties

### data

```ts
data: object;
```

Defined in: [redux/headlampEventSlice.ts:450](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/redux/headlampEventSlice.ts#L450)

#### theme

```ts
theme: string;
```

The name of the theme that is currently applied.

#### Overrides

[`HeadlampEvent`](HeadlampEvent.md).[`data`](HeadlampEvent.md#data)

***

### type

```ts
type: SETTINGS_VIEW;
```

Defined in: [redux/headlampEventSlice.ts:108](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/redux/headlampEventSlice.ts#L108)

#### Inherited from

[`HeadlampEvent`](HeadlampEvent.md).[`type`](HeadlampEvent.md#type)
