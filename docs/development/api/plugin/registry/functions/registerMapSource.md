# Function: registerMapSource()

```ts
function registerMapSource(source: GraphSource): void;
```

Defined in: [plugin/registry.tsx:857](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/plugin/registry.tsx#L857)

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
