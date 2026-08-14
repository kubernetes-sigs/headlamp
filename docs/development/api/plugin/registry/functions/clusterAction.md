# Function: clusterAction()

```ts
function clusterAction(callback: (...args: any[]) => void, actionOptions?: CallbackActionOptions): void;
```

Defined in: [plugin/registry.tsx:1065](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/plugin/registry.tsx#L1065)

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
