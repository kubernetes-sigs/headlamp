# lib/k8s/backendTrafficPolicy

## Index

### Classes

| Class | Description |
| ------ | ------ |
| [BackendTrafficPolicy](classes/BackendTrafficPolicy.md) | XBackendTrafficPolicy – Gateway API experimental resource that controls client behaviour (retries, session stickiness, etc.) when talking to a backend. |

### Interfaces

| Interface | Description |
| ------ | ------ |
| [BackendTrafficPolicySpec](interfaces/BackendTrafficPolicySpec.md) | BackendTrafficPolicySpec defines the desired policy. |
| [BackendTrafficPolicyTargetRef](interfaces/BackendTrafficPolicyTargetRef.md) | BackendTrafficPolicyTargetRef defines a backend object that the policy applies to (Service, ServiceImport, or implementation‑specific backendRef). |
| [BudgetDetails](interfaces/BudgetDetails.md) | BudgetDetails limits the share of active requests that may be retries and the time window for calculating that budget. |
| [KubeBackendTrafficPolicy](interfaces/KubeBackendTrafficPolicy.md) | KubeBackendTrafficPolicy is the concrete Kubernetes resource interface. |
| [RequestRate](interfaces/RequestRate.md) | RequestRate expresses “X requests per Y time‑interval”. |
| [RetryConstraint](interfaces/RetryConstraint.md) | RetryConstraint dynamically constrains client‑side retries using a percentage‑based budget and a safety‑net minimum rate. |
| [SessionPersistence](interfaces/SessionPersistence.md) | SessionPersistence keeps successive requests from the same client on a consistent backend. The exact shape is still evolving in the spec, so this is typed loosely for now. |
