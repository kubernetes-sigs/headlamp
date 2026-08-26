# Type Alias: PayloadSummary

```ts
type PayloadSummary = 
  | {
  type: "null";
}
  | {
  length: number;
  type: "array";
}
  | {
  keys: string[];
  truncated: boolean;
  type: "object";
}
  | {
  length: number;
  preview: string;
  type: "string";
}
  | {
  type: "number" | "boolean" | "undefined" | "bigint" | "symbol" | "function";
  value: unknown;
};
```

Defined in: [lib/k8s/api/v2/apiDiscovery.tsx:33](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/api/v2/apiDiscovery.tsx#L33)

Discriminated shape returned by `summarizeAggregatedPayload`. Documents the
contract for callers/tests so they can pattern-match instead of duck-typing.
