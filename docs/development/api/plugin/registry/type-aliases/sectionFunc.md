# ~~Type Alias: sectionFunc~~

```ts
type sectionFunc = (resource: KubeObject) => 
  | SectionFuncProps
  | null
  | undefined;
```

Defined in: [plugin/registry.tsx:188](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/plugin/registry.tsx#L188)

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
