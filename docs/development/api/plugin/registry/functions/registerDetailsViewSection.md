# Function: registerDetailsViewSection()

```ts
function registerDetailsViewSection(viewSection: DetailsViewSectionType): void;
```

Defined in: [plugin/registry.tsx:628](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/plugin/registry.tsx#L628)

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
