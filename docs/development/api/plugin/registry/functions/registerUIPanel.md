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

[src/plugin/registry.tsx:1042](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/plugin/registry.tsx#L1042)
