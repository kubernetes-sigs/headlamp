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

[src/plugin/registry.tsx:1020](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/plugin/registry.tsx#L1020)
