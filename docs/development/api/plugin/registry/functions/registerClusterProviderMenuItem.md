# Function: registerClusterProviderMenuItem()

```ts
function registerClusterProviderMenuItem(item: MenuItemComponent): void;
```

Defined in: [plugin/registry.tsx:942](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/plugin/registry.tsx#L942)

Register a new cluster action menu item.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `item` | `MenuItemComponent` | The item to add to the cluster action menu. |

## Returns

`void`

## Example

```tsx
import { registerClusterProviderMenuItem } from '@kinvolk/headlamp-plugin/lib';
import { MenuItem, ListItemText } from '@mui/material';
registerClusterProviderMenuItem(({cluster, setOpenConfirmDialog, handleMenuClose}) => {
 const isMinikube =
  cluster.meta_data?.extensions?.context_info?.provider === 'minikube.sigs.k8s.io';
  if (!isElectron() !! !isMinikube) {
    return null;
  }
  return (
    <MenuItem
      onClick={() => {
       setOpenConfirmDialog('deleteMinikube');
       handleMenuClose();
      }}
    >
      <ListItemText>{t('translation|Delete')}</ListItemText>
    </MenuItem>
  );
)}
```
