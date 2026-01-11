# Function: registerClusterStatus()

```ts
function registerClusterStatus(item: ClusterStatusComponent): void
```

Register a new cluster status component.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `item` | `ClusterStatusComponent` | The component to add to the cluster status. Item is a function/component and its props are cluster and error. |

## Returns

`void`

## Example

```tsx
import { registerClusterStatus } from '@kinvolk/headlamp-plugin/lib';
import { ClusterStatus } from './ClusterStatus';
registerClusterStatus(({ cluster, error }) => {
  if (!isElectron() || !isMinikube(cluster)) {
    return null;
  }
  return <ClusterStatus cluster={cluster} error={error} />;
});
```

## Defined in

[src/plugin/registry.tsx:897](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/plugin/registry.tsx#L897)
