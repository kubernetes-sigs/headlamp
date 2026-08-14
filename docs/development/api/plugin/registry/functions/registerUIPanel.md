# Function: registerUIPanel()

```ts
function registerUIPanel(panel: UIPanel): void;
```

Defined in: [plugin/registry.tsx:1087](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/plugin/registry.tsx#L1087)

Registers a UI panel in the application's UI.

See UIPanel for more details on Panel definition

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `panel` | `UIPanel` | The UI panel configuration object to be registered |

## Returns

`void`

## Example

```tsx
registerUIPanel({
  id: 'my-panel',
  location: 'right'
  component: () => <div style={{ width: '100px', flexShrink: 0 }}>Hello world</div>,
});
```
