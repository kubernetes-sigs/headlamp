# Variable: MAX\_SUMMARY\_KEYS

```ts
const MAX_SUMMARY_KEYS: 10 = 10;
```

Defined in: [lib/k8s/api/v2/apiDiscovery.tsx:26](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/api/v2/apiDiscovery.tsx#L26)

Maximum number of top-level keys retained when summarizing an aggregated
discovery payload that arrived in an unexpected shape. Exported so the
test suite can pin the contract without hard-coding the value in two
places.
