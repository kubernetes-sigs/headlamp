# Variable: PV\_SOURCE\_TYPES

```ts
const PV_SOURCE_TYPES: readonly ["csi", "hostPath", "nfs", "local", "iscsi", "cephfs", "rbd", "glusterfs", "awsElasticBlockStore", "gcePersistentDisk", "azureDisk", "azureFile", "fc", "flexVolume", "flocker", "photonPersistentDisk", "portworxVolume", "scaleIO", "storageos", "vsphereVolume"];
```

Defined in: [lib/k8s/persistentVolume.ts:33](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/persistentVolume.ts#L33)

Volume source keys recognized on a PersistentVolume spec, in the order they should be reported.

## See

[https://kubernetes.io/docs/concepts/storage/persistent-volumes/#types-of-persistent-volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/#types-of-persistent-volumes)
