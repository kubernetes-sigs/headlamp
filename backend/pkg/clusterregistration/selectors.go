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

package clusterregistration

import (
	"cmp"
	"errors"
	"fmt"
	"slices"
	"strings"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/apimachinery/pkg/util/validation"
)

// ParseSelectors parses the label selector and namespace list that limit one discovery
// source.
func ParseSelectors(labelSelector, namespaces string) (labels.Selector, []string, error) {
	selector, err := labels.Parse(labelSelector)
	if err != nil {
		return nil, nil, fmt.Errorf("parse label selector: %w", err)
	}

	parsed, err := ParseNamespaces(namespaces)
	if err != nil {
		return nil, nil, fmt.Errorf("parse namespaces: %w", err)
	}

	return selector, parsed, nil
}

// ParseNamespaces parses a comma-separated namespace list. "*" selects all namespaces
// and must be used on its own.
func ParseNamespaces(value string) ([]string, error) {
	if strings.TrimSpace(value) == "" {
		return nil, nil
	}

	var (
		namespaces    = make([]string, 0, strings.Count(value, ",")+1)
		allNamespaces bool
	)

	for _, namespace := range strings.Split(value, ",") {
		namespace = strings.TrimSpace(namespace)

		switch namespace {
		case "":
			return nil, errors.New("namespace must not be empty")
		case "*":
			if allNamespaces {
				return nil, errors.New(`"*" must be used on its own`)
			}

			allNamespaces = true
		default:
			if errs := validation.IsDNS1123Label(namespace); len(errs) > 0 {
				return nil, fmt.Errorf("%q: %s", namespace, strings.Join(errs, "; "))
			}

			namespaces = append(namespaces, namespace)
		}
	}

	if allNamespaces {
		if len(namespaces) > 0 {
			return nil, errors.New(`"*" must be used on its own`)
		}

		return []string{metav1.NamespaceAll}, nil
	}

	slices.Sort(namespaces)

	return slices.Compact(namespaces), nil
}

// NamespacesOrDefault returns the parsed namespaces, or defaultNamespace when none
// were configured.
func NamespacesOrDefault(namespaces []string, defaultNamespace string) []string {
	if len(namespaces) > 0 {
		return namespaces
	}

	return []string{cmp.Or(defaultNamespace, metav1.NamespaceDefault)}
}
