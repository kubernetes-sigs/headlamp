[API](../API.md) / [lib/k8s/apiProxy](../modules/lib_k8s_apiProxy.md) / QueryParameters

# Interface: QueryParameters

[lib/k8s/apiProxy](../modules/lib_k8s_apiProxy.md).QueryParameters

QueryParamaters is a map of query parameters for the Kubernetes API.

## Hierarchy

- **`QueryParameters`**

  ↳ [`ApiListOptions`](lib_k8s_cluster.ApiListOptions.md)

## Properties

### allowWatchBookmarks

• `Optional` **allowWatchBookmarks**: `string`

allowWatchBookmarks means watch events with type "BOOKMARK" will also be sent.

Can be 'true'

**`see`** https://kubernetes.io/docs/reference/using-api/api-concepts/#watch-bookmarks

#### Defined in

[lib/k8s/apiProxy.ts:164](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/apiProxy.ts#L164)

___

### continue

• `Optional` **continue**: `string`

Continue token for paging through large result sets.

The continue option should be set when retrieving more results from the server.
Since this value is server defined, clients may only use the continue value
from a previous query result with identical query parameters
(except for the value of continue) and the server may reject a continue value
it does not recognize. If the specified continue value is no longer valid
whether due to expiration (generally five to fifteen minutes) or a
configuration change on the server, the server will respond with a
410 ResourceExpired error together with a continue token. If the client
needs a consistent list, it must restart their list without the continue field.
Otherwise, the client may send another list request with the token received
with the 410 error, the server will respond with a list starting from the next
key, but from the latest snapshot, which is inconsistent from the previous
list results - objects that are created, modified, or deleted after the first
list request will be included in the response, as long as their keys are after
the "next key".

This field is not supported when watch is true. Clients may start a watch from
the last resourceVersion value returned by the server and not miss any modifications.

**`see`** https://kubernetes.io/docs/reference/using-api/api-concepts/#retrieving-large-results-sets-in-chunks

#### Defined in

[lib/k8s/apiProxy.ts:112](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/apiProxy.ts#L112)

___

### dryRun

• `Optional` **dryRun**: `string`

dryRun causes apiserver to simulate the request, and report whether the object would be modified.
Can be '' or 'All'

**`see`** https://kubernetes.io/docs/reference/using-api/api-concepts/#dry-run

#### Defined in

[lib/k8s/apiProxy.ts:119](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/apiProxy.ts#L119)

___

### fieldSelector

• `Optional` **fieldSelector**: `string`

fieldSeletor restricts the list of returned objects by their fields. Defaults to everything.

**`see`** https://kubernetes.io/docs/concepts/overview/working-with-objects/field-selectors/

#### Defined in

[lib/k8s/apiProxy.ts:125](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/apiProxy.ts#L125)

___

### labelSelector

• `Optional` **labelSelector**: `string`

labelSelector restricts the list of returned objects by their labels. Defaults to everything.

**`see`** https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/#api

**`see`** https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/#label-selectors

#### Defined in

[lib/k8s/apiProxy.ts:132](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/apiProxy.ts#L132)

___

### limit

• `Optional` **limit**: `string` \| `number`

limit is a maximum number of responses to return for a list call.

If more items exist, the server will set the continue field on the list
metadata to a value that can be used with the same initial query to retrieve
the next set of results. Setting a limit may return fewer than the requested
amount of items (up to zero items) in the event all requested objects are
filtered out and clients should only use the presence of the continue field
to determine whether more results are available. Servers may choose not to
support the limit argument and will return all of the available results.
If limit is specified and the continue field is empty, clients may assume
that no more results are available.

This field is not supported if watch is true.

**`see`** https://kubernetes.io/docs/reference/using-api/api-concepts/#retrieving-large-results-sets-in-chunks

#### Defined in

[lib/k8s/apiProxy.ts:149](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/apiProxy.ts#L149)

___

### pretty

• `Optional` **pretty**: `string`

If 'true', then the output is pretty printed.
Can be '' or 'true'

**`see`** https://kubernetes.io/docs/reference/using-api/api-concepts/#output-options

#### Defined in

[lib/k8s/apiProxy.ts:184](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/apiProxy.ts#L184)

___

### resourceVersion

• `Optional` **resourceVersion**: `string`

resourceVersion sets a constraint on what resource versions a request may be served from.
Defaults to unset

**`see`** https://kubernetes.io/docs/reference/using-api/api-concepts/#efficient-detection-of-changes

**`see`** https://kubernetes.io/docs/reference/using-api/api-concepts/#resource-versions

#### Defined in

[lib/k8s/apiProxy.ts:157](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/apiProxy.ts#L157)

___

### resourceVersionMatch

• `Optional` **resourceVersionMatch**: `string`

The resource version to match.

**`see`** https://kubernetes.io/docs/reference/using-api/api-concepts/#semantics-for-get-and-list

#### Defined in

[lib/k8s/apiProxy.ts:178](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/apiProxy.ts#L178)

___

### sendInitialEvents

• `Optional` **sendInitialEvents**: `string`

sendInitialEvents controls whether the server will send the events
for a watch before sending the current list state.

Can be 'true'.

**`see`** https://kubernetes.io/docs/reference/using-api/api-concepts/#streaming-lists

#### Defined in

[lib/k8s/apiProxy.ts:172](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/apiProxy.ts#L172)

___

### watch

• `Optional` **watch**: `string`

watch instead of a list or get, watch for changes to the requested object(s).

Can be 1.

**`see`** https://kubernetes.io/docs/reference/using-api/api-concepts/#efficient-detection-of-changes

#### Defined in

[lib/k8s/apiProxy.ts:191](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/apiProxy.ts#L191)
