# Variable: MAX\_SUMMARY\_KEYS

```ts
const MAX_SUMMARY_KEYS: 10 = 10;
```

Defined in: [lib/k8s/api/v2/apiDiscovery.tsx:26](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/apiDiscovery.tsx#L26)

Maximum number of top-level keys retained when summarizing an aggregated
discovery payload that arrived in an unexpected shape. Exported so the
test suite can pin the contract without hard-coding the value in two
places.
