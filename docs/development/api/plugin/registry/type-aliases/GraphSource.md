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

Defined in: [components/resourceMap/graph/graphModel.tsx:145](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/components/resourceMap/graph/graphModel.tsx#L145)

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
