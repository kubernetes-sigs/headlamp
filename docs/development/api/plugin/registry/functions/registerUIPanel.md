# Function: registerUIPanel()

```ts
function registerUIPanel(panel: UIPanel): void;
```

Defined in: [plugin/registry.tsx:1135](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/plugin/registry.tsx#L1135)

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
