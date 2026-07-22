# Function: SingleActivityRenderer()

```ts
function SingleActivityRenderer(__namedParameters: object): Element;
```

Defined in: [components/activity/Activity.tsx:124](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/components/activity/Activity.tsx#L124)

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
