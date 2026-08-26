# Function: registerDetailsViewSectionsProcessor()

```ts
function registerDetailsViewSectionsProcessor(processor: DetailsViewsSectionProcessor | HeaderActionFuncType): void;
```

Defined in: [plugin/registry.tsx:646](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/plugin/registry.tsx#L646)

Add a processor for the details view sections. Allowing the modification of what sections are shown.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `processor` | `DetailsViewsSectionProcessor` \| `HeaderActionFuncType` | The processor to add. Receives a resource (for which we are processing the sections) and the current sections and returns the new sections. Return an empty array to remove all sections. |

## Returns

`void`

## Example

```tsx
import { registerDetailsViewSectionsProcessor } from '@kinvolk/headlamp-plugin/lib';

registerDetailsViewSectionsProcessor(function addTopSection( resource, sections ) {
  // Ignore if there is no resource.
  if (!resource) {
   return sections;
  }

  // Check if we already have added our custom section (this function may be called multiple times).
  const customSectionId = 'my-custom-section';
  if (sections.findIndex(section => section.id === customSectionId) !== -1) {
    return sections;
  }

  return [
    {
      id: 'my-custom-section',
      section: (
        <SectionBox title="I'm the top of the world!" />
        ),
    },
    ...sections,
  ];
});
```
