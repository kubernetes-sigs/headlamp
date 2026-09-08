# Function: clusterAction()

```ts
function clusterAction(callback: (...args: any[]) => void, actionOptions?: CallbackActionOptions): void;
```

Defined in: [plugin/registry.tsx:1113](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/plugin/registry.tsx#L1113)

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
