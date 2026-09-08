# Function: registerMapSource()

```ts
function registerMapSource(source: GraphSource): void;
```

Defined in: [plugin/registry.tsx:877](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/plugin/registry.tsx#L877)

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
