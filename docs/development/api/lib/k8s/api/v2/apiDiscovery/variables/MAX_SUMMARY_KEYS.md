# Variable: MAX\_SUMMARY\_KEYS

```ts
const MAX_SUMMARY_KEYS: 10 = 10;
```

Defined in: [lib/k8s/api/v2/apiDiscovery.tsx:26](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v2/apiDiscovery.tsx#L26)

Maximum number of top-level keys retained when summarizing an aggregated
discovery payload that arrived in an unexpected shape. Exported so the
test suite can pin the contract without hard-coding the value in two
places.
