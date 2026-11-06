/*
Copyright 2026 The Kubernetes Authors.

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

package kubeconfig

// ConnectionPresentation contains public labels, separate from the connection identity.
type ConnectionPresentation struct {
	DisplayName string            `json:"displayName"`
	Fields      map[string]string `json:"fields"`
}

func (p *ConnectionPresentation) Copy() *ConnectionPresentation {
	if p == nil {
		return nil
	}

	fields := make(map[string]string, len(p.Fields))
	for key, value := range p.Fields {
		fields[key] = value
	}

	return &ConnectionPresentation{DisplayName: p.DisplayName, Fields: fields}
}

// PublicPresentation falls back to the original kubeconfig fields for static contexts.
func (c *Context) PublicPresentation() *ConnectionPresentation {
	if c.Presentation != nil {
		return c.Presentation.Copy()
	}

	fields := map[string]string{"context": c.KubeConfigContextName, "file": c.KubeConfigPath}
	if fields["context"] == "" {
		fields["context"] = c.Name
	}

	if c.KubeContext != nil {
		fields["cluster"] = c.KubeContext.Cluster
		fields["contextNamespace"] = c.KubeContext.Namespace
	}

	return &ConnectionPresentation{DisplayName: c.Name, Fields: fields}
}
