# Function: registerKubeObjectGlance()

```ts
function registerKubeObjectGlance(glance: Glance): void
```

Custom glance component for Kubernetes objects in Headlamp's graph view.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `glance` | `Glance` | The glance object with a unique id and a React component to render. |

## Returns

`void`

## Example

```tsx
import { registerKubeObjectGlance } from '@kinvolk/headlamp-plugin/lib';

const NodeGlance = ({ node }) => {
 // Check if the node represents a Kubernetes Node object
 if (node.kubeObject && node.kubeObject.kind === 'Node') {
   return (
     <div>
       <strong>Node:</strong> {node.kubeObject.metadata?.name} (CPU: {node.kubeObject.status?.capacity?.cpu || 'N/A'})
     </div>
   );
 }

 // Handle non-Kubernetes nodes with label or fallback to a default
 if (node.label) {
   return (
     <div>
       <strong>Node:</strong> {node.label}
     </div>
   );
 }

 // Return null if the node cannot be rendered by this glance
 return null;
};

registerKubeObjectGlance({ id: 'node-glance', component: NodeGlance });
```

## Defined in

[src/plugin/registry.tsx:351](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/plugin/registry.tsx#L351)
