# Function: registerAddClusterProvider()

```ts
function registerAddClusterProvider(item: ClusterProviderInfo): void
```

For adding a card to the Add Cluster page in the providers list.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `item` | `ClusterProviderInfo` | The iformation to add to the Add Cluster page. |

## Returns

`void`

## Example

```tsx
import { useTranslation } from 'react-i18next';
import { registerAddClusterProvider } from '@kinvolk/headlamp-plugin/lib';
import { Card, CardHeader, CardContent, Typography, Button } from '@mui/material';
import { MinikubeIcon } from './MinikubeIcon';
const { t } = useTranslation();

registerAddClusterProvider({
  title: 'Minikube',
  icon: MinikubeIcon,
  description:
    'Minikube is a lightweight tool that simplifies the process of setting up a Kubernetes environment on your local PC. It provides a localStorage, single-node Kubernetes cluster that you can use for learning, development, and testing purposes.',
  url: '/create-cluster-minikube',
});

```

## Defined in

[src/plugin/registry.tsx:972](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/plugin/registry.tsx#L972)
