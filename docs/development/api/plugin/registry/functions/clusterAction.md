# Function: clusterAction()

```ts
function clusterAction(callback: (...args: any[]) => void, actionOptions: CallbackActionOptions): void
```

Starts an action after a period of time giving the user an opportunity to cancel the action.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `callback` | (...`args`: `any`[]) => `void` | called after some time. |
| `actionOptions` | [`CallbackActionOptions`](../interfaces/CallbackActionOptions.md) | options for text messages and callbacks. |

## Returns

`void`

## Example

```tsx
  clusterAction(() => runFunc(clusterName), {
    startMessage: `About to "${command}" cluster "${clusterName}"…`,
    cancelledMessage: `Cancelled "${command}" cluster "${clusterName}".`,
    successMessage: `Cluster "${command}" of "${clusterName}" begun.`,
    errorMessage: `Failed to "${command}" ${clusterName}.`,
    cancelCallback: () => {
      setActing(false);
      setRunning(false);
      handleClose();
      setOpenDialog(false);
  })
```

## Defined in

[src/plugin/registry.tsx:1020](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/plugin/registry.tsx#L1020)
