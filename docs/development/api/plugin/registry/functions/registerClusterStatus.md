# Function: registerClusterStatus()

```ts
function registerClusterStatus(item: ClusterStatusComponent): void;
```

Defined in: [plugin/registry.tsx:944](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/plugin/registry.tsx#L944)

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
