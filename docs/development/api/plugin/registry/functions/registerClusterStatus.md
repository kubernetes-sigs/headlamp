# Function: registerClusterStatus()

```ts
function registerClusterStatus(item: ClusterStatusComponent): void;
```

Defined in: [plugin/registry.tsx:964](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/plugin/registry.tsx#L964)

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
