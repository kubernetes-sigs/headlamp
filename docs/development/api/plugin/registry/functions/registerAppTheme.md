# Function: registerAppTheme()

```ts
function registerAppTheme(theme: AppTheme): void;
```

Defined in: [plugin/registry.tsx:1038](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/plugin/registry.tsx#L1038)

Add a new theme that will be available in the settings.
Theme name should be unique

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `theme` | [`AppTheme`](../../../lib/AppTheme/interfaces/AppTheme.md) | App Theme definition |

## Returns

`void`

## Example

```ts
registerAppTheme({
  name: "My Custom Theme",
  base: "light",
  primary: "#ff0000",
  secondary: "#333",
})
