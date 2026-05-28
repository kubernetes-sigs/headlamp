# JobSet Components

This directory contains components for viewing and managing Kubernetes [JobSets](https://github.com/kubernetes-sigs/jobset).

## Components

### JobSetList

A list view for all JobSets in the cluster/namespace. It displays the name, namespace, cluster, conditions, and age of each JobSet.

### JobSetDetails

A dedicated detailed view for a specific JobSet. It includes the following sections:

- **Metadata**: Standard Kubernetes metadata.
- **Replicated Jobs**: A list of jobs defined in the JobSet spec.
- **Owned Jobs**: Jobs currently owned by this JobSet.
- **Owned Pods**: Pods currently owned by this JobSet.
- **Conditions**: Current status conditions of the JobSet.
- **Containers**: Containers defined in the JobSet's template.
- **Events**: Kubernetes events related to this JobSet.

## Usage

These components are automatically registered in the main router and accessible via the sidebar under "JobSets".
