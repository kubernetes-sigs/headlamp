# lib/k8s/api/v1/streamingApi

## Interfaces

| Interface | Description |
| ------ | ------ |
| [StreamArgs](interfaces/StreamArgs.md) | Configure a stream with... StreamArgs. |
| [StreamConnection](interfaces/StreamConnection.md) | The connection handle returned by the stream connection helpers. |
| [StreamResultsParams](interfaces/StreamResultsParams.md) | Configuration options for establishing a stream to a cluster. Groups the cluster name along with the callbacks used to process incoming data and errors. |

## Type Aliases

| Type Alias | Description |
| ------ | ------ |
| [StreamErrCb](type-aliases/StreamErrCb.md) | - |
| [StreamResultsCb](type-aliases/StreamResultsCb.md) | - |
| [StreamUpdate](type-aliases/StreamUpdate.md) | - |
| [StreamUpdatesCb](type-aliases/StreamUpdatesCb.md) | - |

## Functions

| Function | Description |
| ------ | ------ |
| [connectStream](functions/connectStream.md) | Connects to a WebSocket stream at the specified path and returns an object with a `close` function and a `socket` property. Sends messages to `cb` callback. |
| [connectStreamWithParams](functions/connectStreamWithParams.md) | connectStreamWithParams is a wrapper around connectStream that allows for more flexibility in the parameters that can be passed to the WebSocket connection. |
| [stream](functions/stream.md) | Establishes a WebSocket connection to the specified URL and streams the results to the provided callback function. |
| [streamResult](functions/streamResult.md) | Fetches the data and watches for changes to the data. |
| [streamResults](functions/streamResults.md) | Streams the results of a Kubernetes API request. |
| [streamResultsForCluster](functions/streamResultsForCluster.md) | Establishes a stream to the Kubernetes API for a specific cluster. |
