# Function: registerDetailsViewHeaderAction()

```ts
function registerDetailsViewHeaderAction(headerAction: HeaderActionType): void;
```

Defined in: [plugin/registry.tsx:475](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/plugin/registry.tsx#L475)

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
