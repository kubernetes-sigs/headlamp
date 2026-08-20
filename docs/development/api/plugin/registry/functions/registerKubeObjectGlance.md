# Function: registerKubeObjectGlance()

```ts
function registerKubeObjectGlance(glance: Glance): void;
```

Defined in: [plugin/registry.tsx:365](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/plugin/registry.tsx#L365)

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
