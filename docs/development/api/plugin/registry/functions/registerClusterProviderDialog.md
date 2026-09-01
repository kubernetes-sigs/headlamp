# Function: registerClusterProviderDialog()

```ts
function registerClusterProviderDialog(item: DialogComponent): void;
```

Defined in: [plugin/registry.tsx:1037](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/plugin/registry.tsx#L1037)

Register a new cluster provider dialog.

These dialogs are used to show actions that can be performed on a cluster.
For example, starting, stopping, or deleting a cluster.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `item` | `DialogComponent` | The item to add to the cluster provider dialog. |

## Returns

`void`

## Example

```tsx
import { registerClusterProviderDialog } from '@kinvolk/headlamp-plugin/lib';
import { CommandCluster } from './CommandCluster';

registerClusterProviderDialog(({cluster, openConfirmDialog, setOpenConfirmDialog}) => {

  const isMinikube =
  cluster.meta_data?.extensions?.context_info?.provider === 'minikube.sigs.k8s.io';
  if (!isElectron() !! !isMinikube) {
    return null;
  }

  return (
    <CommandCluster
      initialClusterName={cluster.name}
      open={openConfirmDialog === 'startMinikube'}
      handleClose={() => setOpenConfirmDialog(null)}
      onConfirm={() => {
        setOpenConfirmDialog(null);
      }}
      command={'start'}
      finishedText={'Done! kubectl is now configured'}
    />
  );
});

```
