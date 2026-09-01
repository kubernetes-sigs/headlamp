# Function: registerDetailsViewHeaderAction()

```ts
function registerDetailsViewHeaderAction(headerAction: HeaderActionType): void;
```

Defined in: [plugin/registry.tsx:495](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/plugin/registry.tsx#L495)

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
