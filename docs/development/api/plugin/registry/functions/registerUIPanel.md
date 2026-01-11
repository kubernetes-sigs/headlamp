# Function: registerUIPanel()

```ts
function registerUIPanel(panel: UIPanel): void
```

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

## Defined in

[src/plugin/registry.tsx:1042](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/plugin/registry.tsx#L1042)
