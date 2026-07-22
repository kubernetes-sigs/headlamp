# Function: registerMapSource()

```ts
function registerMapSource(source: GraphSource): void;
```

Defined in: [plugin/registry.tsx:855](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/plugin/registry.tsx#L855)

Registers a new graph source in the store.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `source` | [`GraphSource`](../type-aliases/GraphSource.md) | The graph source to be registered. |

## Returns

`void`

## Example

```tsx
const mySource = {
  id: 'my-source',
  label: 'Sample source',
  useData() {
    return {
      nodes: [{ id: 'my-node', type: 'kubeObject', data: { resource: myCustomResource } }],
      edges: []
    };
  }
}

registerMapSource(mySource);
```
