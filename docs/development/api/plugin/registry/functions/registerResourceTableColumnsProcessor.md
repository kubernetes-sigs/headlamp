# Function: registerResourceTableColumnsProcessor()

```ts
function registerResourceTableColumnsProcessor(processor: TableColumnsProcessor | <T>(args: object) => (ColumnType | ResourceTableColumn<T>)[]): void
```

Add a processor for the resource table columns. Allowing the modification of what tables show.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `processor` | `TableColumnsProcessor` \| \<`T`\>(`args`: `object`) => (`ColumnType` \| `ResourceTableColumn`\<`T`\>)[] | The processor ID and function. See #TableColumnsProcessor. |

## Returns

`void`

## Example

```tsx
import { registerResourceTableColumnsProcessor } from '@kinvolk/headlamp-plugin/lib';

// Processor that adds a column to show how many init containers pods have (in the default pods' list table).
registerResourceTableColumnsProcessor(function ageRemover({ id, columns }) {
  if (id === 'headlamp-pods') {
    columns.push({
      label: 'Init Containers',
      // return plain value to allow filtering and sorting
      getValue: (pod: Pod) => {
        return pod.spec.initContainers.length;
      }
      // (optional) customise how the cell value is rendered
      render: (pod: Pod) => <div style={{ color: "red" }}>{pod.spec.initContainers.length}</div>
    });
  }

  return columns;
});
```

## Defined in

[src/plugin/registry.tsx:499](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/plugin/registry.tsx#L499)
