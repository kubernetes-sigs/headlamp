# lib/k8s/kubeconfig

## Index

### Interfaces

| Interface | Description |
| ------ | ------ |
| [KubeconfigObject](interfaces/KubeconfigObject.md) | KubeconfigObject is the object that is stored in indexDB as string format. It is a JSON encoded version of the kubeconfig file. It is used to store the kubeconfig for stateless clusters. This is basically a k8s client - go Kubeconfig object. KubeconfigObject holds the information needed to build connect to remote kubernetes clusters as a given user * |
