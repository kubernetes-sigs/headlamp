/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ClusterChooserProps, K8s, registerClusterChooser } from '@kinvolk/headlamp-plugin/lib';
import { Button } from '@mui/material';

/** Props for the ClusterChooserButton component. */
export interface ClusterChooserButtonProps {
  /** Handler called when the button is clicked. */
  clickHandler: ClusterChooserProps['clickHandler'];
  /** Currently selected cluster name. */
  cluster: ClusterChooserProps['cluster'];
}

/** A button that shows the current cluster and total cluster count using useClustersConf. */
export function ClusterChooserButton({ clickHandler, cluster }: ClusterChooserButtonProps) {
  const clusters = K8s.useClustersConf();
  const clusterNames = clusters ? Object.keys(clusters) : [];

  return (
    <Button onClick={clickHandler}>
      Our Cluster Chooser button. Cluster: {cluster} ({clusterNames.length} clusters)
    </Button>
  );
}

// Replaces the default cluster chooser in the top bar with a button that shows
// the current cluster name and total number of configured clusters (e.g. "Cluster: minikube (3 clusters)").
registerClusterChooser(({ clickHandler, cluster }: ClusterChooserProps) => (
  <ClusterChooserButton clickHandler={clickHandler} cluster={cluster} />
));
