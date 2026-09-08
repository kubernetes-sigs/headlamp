# Function: registerClusterChooser()

```ts
function registerClusterChooser(chooser: ClusterChooserType): void;
```

Defined in: [plugin/registry.tsx:717](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/plugin/registry.tsx#L717)

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
