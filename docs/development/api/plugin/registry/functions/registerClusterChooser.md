# Function: registerClusterChooser()

```ts
function registerClusterChooser(chooser: ClusterChooserType): void;
```

Defined in: [plugin/registry.tsx:697](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/plugin/registry.tsx#L697)

Use a custom cluster chooser button

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `chooser` | [`ClusterChooserType`](../type-aliases/ClusterChooserType.md) | is a React Component that takes one required props `clickHandler` which is the action handler that happens when the custom chooser button component click event occurs |

## Returns

`void`

## Example

```tsx
import { ClusterChooserProps, registerClusterChooser } from '@kinvolk/headlamp-plugin/lib';

registerClusterChooser(({ clickHandler, cluster }: ClusterChooserProps) => {
  return <button onClick={clickHandler}>my chooser Current cluster: {cluster}</button>;
})
```

## See

[Cluster Chooser example](http://github.com/kinvolk/headlamp/plugins/examples/cluster-chooser/)
