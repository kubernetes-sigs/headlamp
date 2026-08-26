# Type Alias: GraphSource

```ts
type GraphSource = object & 
  | {
  sources: GraphSource[];
}
  | {
  useData: () => 
     | {
     edges?: GraphEdge[];
     nodes?: GraphNode[];
   }
    | null;
};
```

Defined in: [components/resourceMap/graph/graphModel.tsx:160](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/components/resourceMap/graph/graphModel.tsx#L160)

Graph Source defines a group of Nodes and Edges
that can be loaded on the Map

Graph Source may contain other GraphSources

## Type Declaration

### icon?

```ts
optional icon?: ReactNode;
```

Optional icon to display

### id

```ts
id: string;
```

ID of the source, should be uniquie

### isEnabledByDefault?

```ts
optional isEnabledByDefault?: boolean;
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
