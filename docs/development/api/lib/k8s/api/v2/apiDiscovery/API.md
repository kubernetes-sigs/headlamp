# lib/k8s/api/v2/apiDiscovery

## Type Aliases

| Type Alias | Description |
| ------ | ------ |
| [PayloadSummary](type-aliases/PayloadSummary.md) | Discriminated shape returned by `summarizeAggregatedPayload`. Documents the contract for callers/tests so they can pattern-match instead of duck-typing. |

## Variables

| Variable | Description |
| ------ | ------ |
| [MAX\_SUMMARY\_KEYS](variables/MAX_SUMMARY_KEYS.md) | Maximum number of top-level keys retained when summarizing an aggregated discovery payload that arrived in an unexpected shape. Exported so the test suite can pin the contract without hard-coding the value in two places. |

## Functions

| Function | Description |
| ------ | ------ |
| [apiDiscovery](functions/apiDiscovery.md) | Discovers available API resources from Kubernetes clusters. - Only resources that support the 'list' verb are included in the results |
