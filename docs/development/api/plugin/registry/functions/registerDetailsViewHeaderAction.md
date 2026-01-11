# Function: registerDetailsViewHeaderAction()

```ts
function registerDetailsViewHeaderAction(headerAction: HeaderActionType): void
```

Add a component into the details view header.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `headerAction` | `HeaderActionType` | The action (link) to put in the app bar. |

## Returns

`void`

## Example

```tsx
import { ActionButton } from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import { registerDetailsViewHeaderAction } from '@kinvolk/headlamp-plugin/lib';

function IconAction() {
  return (
    <ActionButton
     description="Launch"
     icon="mdi:comment-quote"
     onClick={() => console.log('Hello from IconAction!')}
   />
  )
}

registerDetailsViewHeaderAction(IconAction);
```

## Defined in

[src/plugin/registry.tsx:442](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/plugin/registry.tsx#L442)
