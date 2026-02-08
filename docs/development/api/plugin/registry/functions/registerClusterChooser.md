# Function: registerClusterChooser()

```ts
function registerClusterChooser(chooser: ClusterChooserType): void
```

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

## Defined in

[src/plugin/registry.tsx:664](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/plugin/registry.tsx#L664)
