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

[src/plugin/registry.tsx:897](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/plugin/registry.tsx#L897)
