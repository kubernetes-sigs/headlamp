# Function: SingleActivityRenderer()

```ts
function SingleActivityRenderer(__namedParameters: object): Element;
```

Defined in: [components/activity/Activity.tsx:124](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/components/activity/Activity.tsx#L124)

Renders a single activity

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `__namedParameters` | \{ `activity`: [`Activity`](../interfaces/Activity.md); `index`: `number`; `isOverview`: `boolean`; `onClick`: `PointerEventHandler`\<`HTMLDivElement`\>; `zIndex`: `number`; \} | - |
| `__namedParameters.activity` | [`Activity`](../interfaces/Activity.md) | - |
| `__namedParameters.index` | `number` | Index of this activity within a list of all activities |
| `__namedParameters.isOverview` | `boolean` | Render in a small window for the overview state |
| `__namedParameters.onClick` | `PointerEventHandler`\<`HTMLDivElement`\> | Click event callback |
| `__namedParameters.zIndex` | `number` | - |

## Returns

`Element`
