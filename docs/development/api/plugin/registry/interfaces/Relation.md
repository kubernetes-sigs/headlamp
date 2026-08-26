# Interface: Relation

Defined in: [components/resourceMap/graph/graphModel.tsx:178](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/components/resourceMap/graph/graphModel.tsx#L178)

## Properties

### buildEdgesWithIndex?

```ts
optional buildEdgesWithIndex?: (fromNodes: GraphNode[], nodesByUid: Map<string, GraphNode>) => GraphEdge[];
```

Defined in: [components/resourceMap/graph/graphModel.tsx:189](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/components/resourceMap/graph/graphModel.tsx#L189)

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

### fromSource

```ts
fromSource: string;
```

Defined in: [components/resourceMap/graph/graphModel.tsx:180](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/components/resourceMap/graph/graphModel.tsx#L180)

***

### id

```ts
id: string;
```

Defined in: [components/resourceMap/graph/graphModel.tsx:179](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/components/resourceMap/graph/graphModel.tsx#L179)

***

### label?

```ts
optional label?: string;
```

Defined in: [components/resourceMap/graph/graphModel.tsx:190](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/components/resourceMap/graph/graphModel.tsx#L190)

***

### predicate

```ts
predicate: (from: GraphNode, to: GraphNode) => boolean;
```

Defined in: [components/resourceMap/graph/graphModel.tsx:182](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/components/resourceMap/graph/graphModel.tsx#L182)

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

Defined in: [components/resourceMap/graph/graphModel.tsx:181](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/components/resourceMap/graph/graphModel.tsx#L181)
