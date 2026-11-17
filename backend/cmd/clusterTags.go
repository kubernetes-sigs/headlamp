/*
Copyright 2025 The Kubernetes Authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/util/validation"
	"k8s.io/client-go/tools/clientcmd/api"
)

// updateHeadlampInfo preserves extension fields owned by other Headlamp features.
func updateHeadlampInfo(context *api.Context, updates map[string]interface{}) error {
	fields := map[string]json.RawMessage{}

	if existing := context.Extensions["headlamp_info"]; existing != nil {
		data, err := json.Marshal(existing)
		if err != nil {
			return err
		}

		if err := json.Unmarshal(data, &fields); err != nil {
			return err
		}
	}

	if fields == nil {
		fields = map[string]json.RawMessage{}
	}

	for key, value := range updates {
		data, err := json.Marshal(value)
		if err != nil {
			return err
		}

		fields[key] = data
	}

	data, err := json.Marshal(fields)
	if err != nil {
		return err
	}

	if context.Extensions == nil {
		context.Extensions = make(map[string]runtime.Object)
	}

	context.Extensions["headlamp_info"] = &runtime.Unknown{Raw: data}

	return nil
}

func validateClusterTags(tags map[string]string) error {
	if tags == nil {
		return fmt.Errorf("tags must be an object")
	}

	for key, value := range tags {
		if len(validation.IsQualifiedName(key)) > 0 || len(validation.IsValidLabelValue(value)) > 0 {
			return fmt.Errorf("invalid cluster tag %q", key)
		}
	}

	return nil
}

// updateClusterTags only writes to a context already loaded by this server.
func (c *HeadlampConfig) updateClusterTags(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Tags      map[string]string `json:"tags"`
		ClusterID string            `json:"clusterID"`
	}

	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64*1024)).Decode(&body); err != nil {
		http.Error(w, "invalid cluster tags request", http.StatusBadRequest)
		return
	}

	if err := validateClusterTags(body.Tags); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	name := mux.Vars(r)["name"]

	context, err := c.KubeConfigStore.GetContext(name)
	if err != nil || context.Internal || context.KubeContext == nil ||
		(body.ClusterID != "" && context.ClusterID != body.ClusterID) {
		http.Error(w, "cluster context not found", http.StatusNotFound)
		return
	}

	if (context.Source != kubeconfig.KubeConfig && context.Source != kubeconfig.DynamicCluster) ||
		(context.Source == kubeconfig.KubeConfig && c.UseInCluster && !c.AllowKubeconfigChanges) {
		http.Error(w, "this cluster has no writable kubeconfig context", http.StatusForbidden)
		return
	}

	path := context.KubeConfigPath
	if path == "" {
		path, err = c.getKubeConfigPath(context.SourceStr())
	}

	if err == nil {
		err = c.writeCachedClusterTags(path, context, body.Tags)
	}

	if err != nil {
		logger.Log(logger.LevelError, map[string]string{logFieldCluster: name}, err, "saving cluster tags")

		status := http.StatusInternalServerError
		if errors.Is(err, errClusterTagsConflict) {
			status = http.StatusConflict
		}

		http.Error(w, err.Error(), status)

		return
	}

	c.getConfig(w, r)
}

var errClusterTagsConflict = errors.New("cluster context changed during tag save")

func (c *HeadlampConfig) writeCachedClusterTags(
	path string, expected *kubeconfig.Context, tags map[string]string,
) error {
	var current *kubeconfig.Context

	var contextName string

	return kubeconfig.ModifyConfigFile(path, func(config *api.Config) error {
		var err error

		current, err = c.KubeConfigStore.GetContext(expected.Name)
		if err != nil || current.ClusterID != expected.ClusterID || current.Source != expected.Source ||
			current.KubeConfigPath != expected.KubeConfigPath || current.Internal {
			return errClusterTagsConflict
		}

		if !strings.HasPrefix(expected.ClusterID, path+"+") {
			return fmt.Errorf("cluster has no stable kubeconfig identity")
		}

		identity := strings.TrimPrefix(expected.ClusterID, path+"+")
		for name := range config.Contexts {
			if kubeconfig.MakeDNSFriendly(name) == identity {
				if contextName != "" {
					return fmt.Errorf("ambiguous kubeconfig context identity %q", identity)
				}

				contextName = name
			}
		}

		if contextName == "" {
			return errClusterTagsConflict
		}

		return updateHeadlampInfo(config.Contexts[contextName], map[string]interface{}{"tags": tags})
	}, func(config *api.Config) error {
		updated := current.Copy()

		updated.KubeContext = config.Contexts[contextName].DeepCopy()
		if err := c.KubeConfigStore.UpdateContextIfCurrent(current, updated); err != nil {
			return fmt.Errorf("%w: %v", errClusterTagsConflict, err)
		}

		return nil
	})
}

func writeClusterTags(
	path, name string, tags map[string]string, committed ...func(*api.Config) error,
) error {
	return kubeconfig.ModifyConfigFile(path, func(config *api.Config) error {
		contextName := findMatchingContextName(config, name)

		context, ok := config.Contexts[contextName]
		if !ok {
			return fmt.Errorf("context %q not found in kubeconfig", name)
		}

		return updateHeadlampInfo(context, map[string]interface{}{"tags": tags})
	}, committed...)
}
