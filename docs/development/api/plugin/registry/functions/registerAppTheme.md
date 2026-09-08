# Function: registerAppTheme()

```ts
function registerAppTheme(theme: AppTheme): void;
```

Defined in: [plugin/registry.tsx:1086](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/plugin/registry.tsx#L1086)

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
