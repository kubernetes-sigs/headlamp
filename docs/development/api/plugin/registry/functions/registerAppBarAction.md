# Function: registerAppBarAction()

```ts
function registerAppBarAction(headerAction: AppBarAction | AppBarActionsProcessor | AppBarActionProcessorType | AppBarActionType): void
```

Add a component into the app bar (at the top of the app).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `headerAction` | `AppBarAction` \| `AppBarActionsProcessor` \| [`AppBarActionProcessorType`](../type-aliases/AppBarActionProcessorType.md) \| `AppBarActionType` | The action (link) to put in the app bar. |

## Returns

`void`

## Example

```tsx
import { registerAppBarAction } from '@kinvolk/headlamp-plugin/lib';
import { Button } from '@mui/material';

function ConsoleLogger() {
  return (
    <Button
      onClick={() => {
        console.log('Hello from ConsoleLogger!')
      }}
    >
      Print Log
    </Button>
  );
}

registerAppBarAction(ConsoleLogger);
```

## Defined in

[src/plugin/registry.tsx:541](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/plugin/registry.tsx#L541)
