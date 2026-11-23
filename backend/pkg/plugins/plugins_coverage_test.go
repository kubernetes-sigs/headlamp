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

package plugins_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/plugins"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestListPluginsAndWatch(t *testing.T) {
	staticDir := t.TempDir()
	userDir := t.TempDir()
	devDir := t.TempDir()

	// Create valid plugin in staticDir, plus a non-dir file and missing-main.js dir in devDir.
	shipped := filepath.Join(staticDir, "shipped-one")
	require.NoError(t, os.MkdirAll(shipped, 0o750))
	require.NoError(t, os.WriteFile(filepath.Join(shipped, "main.js"), []byte("ok"), 0o600))
	require.NoError(t, os.WriteFile(filepath.Join(shipped, "package.json"), []byte(`{"name":"shipped-one"}`), 0o600))

	require.NoError(t, os.WriteFile(filepath.Join(devDir, "not-a-dir.txt"), []byte("x"), 0o600))
	require.NoError(t, os.MkdirAll(filepath.Join(devDir, "no-main"), 0o750))

	require.NoError(t, plugins.ListPlugins(staticDir, userDir, devDir))

	ch := cache.New[interface{}]()
	plugins.PopulatePluginsCache(staticDir, userDir, devDir, ch)

	list, err := ch.Get(context.Background(), plugins.PluginListKey)
	require.NoError(t, err)
	assert.Equal(t, []plugins.PluginMetadata{
		{
			Path:   "static-plugins/shipped-one",
			Type:   plugins.PluginTypeShipped,
			Source: plugins.PluginTypeShipped,
			Name:   "shipped-one",
		},
	}, list)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	notify := make(chan string, 16)
	ready := make(chan struct{}, 1)
	done := make(chan struct{})

	go func() {
		defer close(done)

		plugins.Watch(ctx, devDir, notify, ready)
	}()

	select {
	case <-ready:
	case <-time.After(2 * time.Second):
		require.Fail(t, "Watch did not signal readiness")
	}

	cancel()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		require.Fail(t, "Watch did not exit after cancellation")
	}
}
