# Function: registerClusterChooser()

```ts
function registerClusterChooser(chooser: ClusterChooserType): void;
```

Defined in: [plugin/registry.tsx:695](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/plugin/registry.tsx#L695)

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
