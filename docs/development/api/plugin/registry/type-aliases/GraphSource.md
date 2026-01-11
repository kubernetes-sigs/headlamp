# Type Alias: GraphSource

```ts
type GraphSource: object & object | object;
```

Graph Source defines a group of Nodes and Edges
that can be loaded on the Map

Graph Source may contain other GraphSources

## Type declaration

### icon?

```ts
optional icon: ReactNode;
```

Optional icon to display

### id

```ts
id: string;
```

ID of the source, should be uniquie

### isEnabledByDefault?

```ts
optional isEnabledByDefault: boolean;
```

Controls wherther the source is shown by default

#### Default

```ts
true
```

### label

```ts
label: string;
```

Descriptive label of the source

## Defined in

[src/components/resourceMap/graph/graphModel.tsx:88](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/components/resourceMap/graph/graphModel.tsx#L88)
