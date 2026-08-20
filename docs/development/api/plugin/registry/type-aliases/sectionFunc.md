# ~~Type Alias: sectionFunc~~

```ts
type sectionFunc = (resource: KubeObject) => 
  | SectionFuncProps
  | null
  | undefined;
```

Defined in: [plugin/registry.tsx:168](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/plugin/registry.tsx#L168)

## Parameters

| Parameter | Type |
| ------ | ------ |
| `resource` | [`KubeObject`](../../../lib/k8s/KubeObject/classes/KubeObject.md) |

## Returns

  \| [`SectionFuncProps`](../interfaces/SectionFuncProps.md)
  \| `null`
  \| `undefined`

## Deprecated

please used DetailsViewSectionType and registerDetailViewSection
