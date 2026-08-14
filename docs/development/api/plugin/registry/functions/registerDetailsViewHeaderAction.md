# Function: registerDetailsViewHeaderAction()

```ts
function registerDetailsViewHeaderAction(headerAction: HeaderActionType): void;
```

Defined in: [plugin/registry.tsx:473](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/plugin/registry.tsx#L473)

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
