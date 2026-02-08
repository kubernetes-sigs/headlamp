# lib/util

## Index

### Namespaces

| Namespace | Description |
| ------ | ------ |
| [auth](namespaces/auth/API.md) | - |
| [units](namespaces/units/API.md) | - |

### Interfaces

| Interface | Description |
| ------ | ------ |
| [TimeAgoOptions](interfaces/TimeAgoOptions.md) | - |

### Type Aliases

| Type alias | Description |
| ------ | ------ |
| [DateFormatOptions](type-aliases/DateFormatOptions.md) | - |
| [DateParam](type-aliases/DateParam.md) | - |

### Variables

| Variable | Description |
| ------ | ------ |
| [CLUSTER\_ACTION\_GRACE\_PERIOD](variables/CLUSTER_ACTION_GRACE_PERIOD.md) | - |

### Functions

| Function | Description |
| ------ | ------ |
| [combineClusterListErrors](functions/combineClusterListErrors.md) | Combines errors per cluster. |
| [compareUnits](functions/compareUnits.md) | - |
| [filterGeneric](functions/filterGeneric.md) | Filters a generic item based on the filter state. |
| [filterResource](functions/filterResource.md) | Filters a resource based on the filter state. |
| [flattenClusterListItems](functions/flattenClusterListItems.md) | This function joins a list of items per cluster into a single list of items. |
| [formatDuration](functions/formatDuration.md) | Format a duration in milliseconds to a human-readable string. |
| [getCluster](functions/getCluster.md) | Get the currently selected cluster name. |
| [getClusterGroup](functions/getClusterGroup.md) | Gets clusters. |
| [getClusterPrefixedPath](functions/getClusterPrefixedPath.md) | - |
| [getPercentStr](functions/getPercentStr.md) | - |
| [getReadyReplicas](functions/getReadyReplicas.md) | - |
| [getResourceMetrics](functions/getResourceMetrics.md) | - |
| [getResourceStr](functions/getResourceStr.md) | - |
| [getTotalReplicas](functions/getTotalReplicas.md) | - |
| [localeDate](functions/localeDate.md) | - |
| [normalizeUnit](functions/normalizeUnit.md) | - |
| [timeAgo](functions/timeAgo.md) | Show the time passed since the given date, in the desired format. |
| [useErrorState](functions/useErrorState.md) | - |
| [useFilterFunc](functions/useFilterFunc.md) | Get a function to filter kube resources based on the current global filter state. |
| [useId](functions/useId.md) | Creates a unique ID, with the given prefix. If UNDER_TEST is set to true, it will return the same ID every time, so snapshots do not get invalidated. |
| [useURLState](functions/useURLState.md) | A hook to manage a state variable that is also stored in the URL. |
