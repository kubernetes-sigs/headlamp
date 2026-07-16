# Function: registerAddClusterProvider()

```ts
function registerAddClusterProvider(item: ClusterProviderInfo): void;
```

Defined in: [plugin/registry.tsx:1017](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/plugin/registry.tsx#L1017)

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
