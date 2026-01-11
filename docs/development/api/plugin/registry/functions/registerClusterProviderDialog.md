# Function: registerClusterProviderDialog()

```ts
function registerClusterProviderDialog(item: DialogComponent): void
```

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

## Defined in

[src/plugin/registry.tsx:944](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/plugin/registry.tsx#L944)
