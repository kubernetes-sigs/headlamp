# Function: registerPluginSettings()

```ts
function registerPluginSettings(
   name: string, 
   component: PluginSettingsComponentType, 
   displaySaveButton: boolean): void
```

Register a plugin settings component.

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `name` | `string` | `undefined` | The name of the plugin. |
| `component` | [`PluginSettingsComponentType`](../type-aliases/PluginSettingsComponentType.md) | `undefined` | The component to use for the settings. |
| `displaySaveButton` | `boolean` | `false` | Whether to display the save button. |

## Returns

`void`

void

## Example

```tsx
import { registerPluginSettings } from '@kinvolk/headlamp-plugin/lib';
import { TextField } from '@mui/material';

function MyPluginSettingsComponent(props: PluginSettingsDetailsProps) {
  const { data, onDataChange } = props;

  function onChange(value: string) {
    if (onDataChange) {
      onDataChange({ works: value });
    }
  }

  return (
    <TextField
      value={data?.works || ''}
      onChange={e => onChange(e.target.value)}
      label="Normal Input"
      variant="outlined"
      fullWidth
    />
  );
}

const displaySaveButton = true;
// Register a plugin settings component.
registerPluginSettings('my-plugin', MyPluginSettingsComponent, displaySaveButton);
```

More complete plugin settings example in plugins/examples/change-logo:

## See

[Change Logo Example](https://github.com/kubernetes-sigs/headlamp/tree/main/plugins/examples/change-logo)

## Defined in

[src/plugin/registry.tsx:770](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/plugin/registry.tsx#L770)
