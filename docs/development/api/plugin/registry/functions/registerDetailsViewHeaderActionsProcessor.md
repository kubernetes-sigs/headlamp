# Function: registerDetailsViewHeaderActionsProcessor()

```ts
function registerDetailsViewHeaderActionsProcessor(processor: HeaderActionsProcessor | HeaderActionFuncType): void;
```

Defined in: [plugin/registry.tsx:518](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/plugin/registry.tsx#L518)

Add a processor for the details view header actions. Allowing the modification of header actions.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `processor` | `HeaderActionsProcessor` \| `HeaderActionFuncType` | The processor to add. Receives a resource (for which we are processing the header actions) and the current header actions and returns the new header actions. Return an empty array to remove all header actions. |

## Returns

`void`

## Example

```tsx
import { registerDetailsViewHeaderActionsProcessor, DetailsViewDefaultHeaderActions } from '@kinvolk/headlamp-plugin/lib';

// Processor that removes the default edit action.
registerDetailsViewHeaderActionsProcessor((resource, headerActions) => {
 return headerActions.filter(action => action.name !== DetailsViewDefaultHeaderActions.EDIT);
});

More complete detail view example in plugins/examples/details-view:
@see {@link http://github.com/kinvolk/headlamp/plugins/examples/details-view/ Detail View Example}
