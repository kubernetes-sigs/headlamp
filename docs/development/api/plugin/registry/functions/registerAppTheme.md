# Function: registerAppTheme()

```ts
function registerAppTheme(theme: AppTheme): void
```

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

## Defined in

[src/plugin/registry.tsx:993](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/plugin/registry.tsx#L993)
