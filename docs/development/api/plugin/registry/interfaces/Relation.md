# Interface: Relation

Defined in: [components/resourceMap/graph/graphModel.tsx:193](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/components/resourceMap/graph/graphModel.tsx#L193)

## Properties

### buildEdgesWithIndex?

```ts
optional buildEdgesWithIndex?: (fromNodes: GraphNode[], nodesByUid: Map<string, GraphNode>) => GraphEdge[];
```

Defined in: [components/resourceMap/graph/graphModel.tsx:204](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/components/resourceMap/graph/graphModel.tsx#L204)

Optional index-based edge builder. When provided, this is used instead of the
O(fromNodes × toNodes) nested-loop predicate scan. The function receives the
fromNodes array and a Map<uid, GraphNode> index of all candidate target nodes,
and returns edges in O(fromNodes × avgRefs) time instead of O(fromNodes × allNodes).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `fromNodes` | `GraphNode`[] |
| `nodesByUid` | `Map`\<`string`, `GraphNode`\> |

#### Returns

`GraphEdge`[]

***

### edgeAttributes?

```ts
optional edgeAttributes?: (from: GraphNode, to: GraphNode) => Partial<Omit<GraphEdge, "id" | "source" | "target">>;
```

Defined in: [components/resourceMap/graph/graphModel.tsx:212](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/components/resourceMap/graph/graphModel.tsx#L212)

Optional extra attributes to apply to an edge created by this relation
when its predicate matches (e.g. marking a `nonGroupingSide`). Structural
fields (`id`/`source`/`target`) are always assigned by the caller and are
excluded from this callback's return type so they can't be overwritten.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `from` | `GraphNode` |
| `to` | `GraphNode` |

#### Returns

`Partial`\<`Omit`\<`GraphEdge`, `"id"` \| `"source"` \| `"target"`\>\>

***

### fromSource

```ts
fromSource: string;
```

Defined in: [components/resourceMap/graph/graphModel.tsx:195](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/components/resourceMap/graph/graphModel.tsx#L195)

***

### id

```ts
id: string;
```

Defined in: [components/resourceMap/graph/graphModel.tsx:194](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/components/resourceMap/graph/graphModel.tsx#L194)

***

### label?

```ts
optional label?: string;
```

Defined in: [components/resourceMap/graph/graphModel.tsx:205](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/components/resourceMap/graph/graphModel.tsx#L205)

***

### predicate

```ts
predicate: (from: GraphNode, to: GraphNode) => boolean;
```

Defined in: [components/resourceMap/graph/graphModel.tsx:197](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/components/resourceMap/graph/graphModel.tsx#L197)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `from` | `GraphNode` |
| `to` | `GraphNode` |

#### Returns

`boolean`

***

### toSource?

```ts
optional toSource?: string;
```

Defined in: [components/resourceMap/graph/graphModel.tsx:196](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/components/resourceMap/graph/graphModel.tsx#L196)
