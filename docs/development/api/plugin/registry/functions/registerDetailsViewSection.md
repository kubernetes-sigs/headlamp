# Function: registerDetailsViewSection()

```ts
function registerDetailsViewSection(viewSection: DetailsViewSectionType): void;
```

Defined in: [plugin/registry.tsx:606](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/plugin/registry.tsx#L606)

Append a component to the details view for a given resource.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `viewSection` | [`DetailsViewSectionType`](../type-aliases/DetailsViewSectionType.md) | The section to add on different view screens. |

## Returns

`void`

## Example

```tsx
import {
  registerDetailsViewSection,
  DetailsViewSectionProps
} from '@kinvolk/headlamp-plugin/lib';

registerDetailsViewSection(({ resource }: DetailsViewSectionProps) => {
  if (resource.kind === 'Pod') {
    return (
      <SectionBox title="A very fine section title">
        The body of our Section for {resource.kind}
      </SectionBox>
    );
  }
  return null;
});
```
