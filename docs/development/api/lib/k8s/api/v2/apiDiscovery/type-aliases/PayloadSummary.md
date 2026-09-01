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

Defined in: [lib/k8s/api/v2/apiDiscovery.tsx:33](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/api/v2/apiDiscovery.tsx#L33)

Discriminated shape returned by `summarizeAggregatedPayload`. Documents the
contract for callers/tests so they can pattern-match instead of duck-typing.
