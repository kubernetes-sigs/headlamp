# lib/k8s/api/v1/factories

## Index

### Interfaces

| Interface | Description |
| ------ | ------ |
| [ApiClient](interfaces/ApiClient.md) | - |
| [ApiInfo](interfaces/ApiInfo.md) | Describes the API for a certain resource. |
| [ApiWithNamespaceClient](interfaces/ApiWithNamespaceClient.md) | - |

### Type Aliases

| Type alias | Description |
| ------ | ------ |
| [ApiFactoryArguments](type-aliases/ApiFactoryArguments.md) | - |
| [ApiFactoryWithNamespaceArguments](type-aliases/ApiFactoryWithNamespaceArguments.md) | - |
| [CancelFunction](type-aliases/CancelFunction.md) | - |
| [MultipleApiFactoryArguments](type-aliases/MultipleApiFactoryArguments.md) | - |
| [MultipleApiFactoryWithNamespaceArguments](type-aliases/MultipleApiFactoryWithNamespaceArguments.md) | - |
| [RecursivePartial](type-aliases/RecursivePartial.md) | - |
| [SimpleApiFactoryWithNamespaceArguments](type-aliases/SimpleApiFactoryWithNamespaceArguments.md) | - |
| [SingleApiFactoryArguments](type-aliases/SingleApiFactoryArguments.md) | - |

### Functions

| Function | Description |
| ------ | ------ |
| [apiFactory](functions/apiFactory.md) | Creates an API client for a single or multiple Kubernetes resources. |
| [apiFactoryWithNamespace](functions/apiFactoryWithNamespace.md) | - |
| [multipleApiFactory](functions/multipleApiFactory.md) | Creates an API endpoint object for multiple API endpoints. It first tries the first endpoint, then the second, and so on until it gets a successful response. |
| [resourceDefToApiFactory](functions/resourceDefToApiFactory.md) | - |
| [singleApiFactory](functions/singleApiFactory.md) | - |
