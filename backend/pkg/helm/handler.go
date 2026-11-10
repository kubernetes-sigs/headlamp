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

package helm

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"

	"helm.sh/helm/v3/pkg/action"
	"helm.sh/helm/v3/pkg/cli"
	"k8s.io/apimachinery/pkg/api/meta"
	"k8s.io/cli-runtime/pkg/genericclioptions"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/discovery/cached/memory"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/restmapper"
	"k8s.io/client-go/tools/clientcmd"
)

var (
	_                  genericclioptions.RESTClientGetter = &restConfigGetter{}
	settings                                              = cli.New()
	statusCacheTimeout                                    = 20 * time.Minute
)

type Handler struct {
	*cli.EnvSettings
	Cache cache.Cache[interface{}]
}

// NewActionConfig builds the Configuration an install/upgrade/uninstall/rollback/list/get
// action runs against. impersonationExpiry, when non-zero, bounds every Kubernetes API call the
// action's clients make to that absolute deadline (see restConfigGetter.ToRESTConfig): without
// it, a single impersonationExpired() check made once before Run() only catches an identity
// already expired at that instant, not one that expires while Run() -- a single call for
// install/upgrade/uninstall/rollback, which can run long enough for a verified token's lifetime
// to pass during it -- is still in flight, letting it keep mutating the cluster under
// Headlamp's own ServiceAccount past the point the user's session authorized it for. Pass the
// zero Time for read-only actions (list/get/history), which need no such bound.
func NewActionConfig(
	clientConfig clientcmd.ClientConfig, namespace string, impersonationExpiry time.Time,
) (*action.Configuration, error) {
	actionConfig := new(action.Configuration)
	restConfGetter := &restConfigGetter{
		clientConfig:        clientConfig,
		namespace:           namespace,
		impersonationExpiry: impersonationExpiry,
	}
	logger := func(format string, a ...interface{}) {
		logger.Log(logger.LevelInfo, map[string]string{"namespace": namespace},
			nil, fmt.Sprintf(format, a...))
	}

	err := actionConfig.Init(restConfGetter, namespace, "secret", logger)
	if err != nil {
		return nil, err
	}

	return actionConfig, nil
}

func NewHandler(cache cache.Cache[interface{}],
) (*Handler, error) {
	return NewHandlerWithSettings(cache, settings)
}

func NewHandlerWithSettings(cache cache.Cache[interface{}], settings *cli.EnvSettings) (*Handler, error) {
	return &Handler{
		EnvSettings: settings,
		Cache:       cache,
	}, nil
}

// https://github.com/helm/helm/issues/6910#issuecomment-601277026
type restConfigGetter struct {
	clientConfig clientcmd.ClientConfig
	namespace    string
	// impersonationExpiry, when non-zero, is enforced on every REST call made through the
	// config this returns (see deadlineEnforcingRoundTripper).
	impersonationExpiry time.Time
}

func (r *restConfigGetter) ToRESTConfig() (*rest.Config, error) {
	config, err := r.clientConfig.ClientConfig()
	if err != nil {
		return nil, err
	}

	if !r.impersonationExpiry.IsZero() {
		deadline := r.impersonationExpiry

		config.WrapTransport = func(base http.RoundTripper) http.RoundTripper {
			return &deadlineEnforcingRoundTripper{base: base, deadline: deadline}
		}
	}

	return config, nil
}

// deadlineEnforcingRoundTripper bounds every request through it to an absolute wall-clock
// deadline. rest.Config's own Timeout field cannot do this: it is a fixed per-request duration
// set once when the config is built, so a call that happens to start late (for example after a
// slow chart download earlier in the same action) would still run for that config's full
// original duration from whenever it starts, potentially well past deadline. Recomputing
// time.Until(deadline) for each request instead enforces what a deadline actually is: an
// absolute cutoff, independent of how many calls an action makes or when any one of them begins.
type deadlineEnforcingRoundTripper struct {
	base     http.RoundTripper
	deadline time.Time
}

func (rt *deadlineEnforcingRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	ctx, cancel := context.WithDeadline(req.Context(), rt.deadline)

	resp, err := rt.base.RoundTrip(req.WithContext(ctx))
	if err != nil {
		cancel()
		return nil, err
	}

	// cancel is tied to the response body's own Close, not called here: the caller (client-go)
	// reads resp.Body after RoundTrip returns, and cancelling ctx immediately would fail that
	// read even on a fully successful response. The deadline's own timer still fires and aborts
	// an in-flight read if it is reached first.
	resp.Body = &cancelOnCloseBody{ReadCloser: resp.Body, cancel: cancel}

	return resp, nil
}

type cancelOnCloseBody struct {
	io.ReadCloser
	cancel context.CancelFunc
}

func (b *cancelOnCloseBody) Close() error {
	defer b.cancel()
	return b.ReadCloser.Close()
}

func (r *restConfigGetter) ToRawKubeConfigLoader() clientcmd.ClientConfig {
	return r.clientConfig
}

func (r *restConfigGetter) ToDiscoveryClient() (discovery.CachedDiscoveryInterface, error) {
	config, err := r.ToRESTConfig()
	if err != nil {
		return nil, err
	}

	// The more groups you have, the more discovery requests you need to make.
	// given 25 groups (our groups + a few custom conf) with one-ish version each, discovery needs to make 50 requests
	// double it just so we don't end up here again for a while.  This config is only used for discovery.
	config.Burst = 100

	discoveryClient, _ := discovery.NewDiscoveryClientForConfig(config)

	return memory.NewMemCacheClient(discoveryClient), nil
}

func (r *restConfigGetter) ToRESTMapper() (meta.RESTMapper, error) {
	discoveryClient, err := r.ToDiscoveryClient()
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "unable to create discovery client")

		return nil, err
	}

	mapper := restmapper.NewDeferredDiscoveryRESTMapper(discoveryClient)
	expander := restmapper.NewShortcutExpander(mapper, discoveryClient, nil)

	return expander, nil
}

type stat struct {
	Status string
	Err    *string
}

// getReleaseStatus returns the status of the release.
func (h *Handler) getReleaseStatus(actionName, releaseName string) (*stat, error) {
	key := "helm_" + actionName + "_" + releaseName

	value, err := h.Cache.Get(context.Background(), key)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"key": key},
			err, "unable to get cache value")

		return nil, err
	}

	valueBytes, err := json.Marshal(value)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"key": key},
			err, "unable to marshal cache value")

		return nil, err
	}

	var stat stat

	err = json.Unmarshal(valueBytes, &stat)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"key": key},
			err, "unable to unmarshal cache value")

		return nil, err
	}

	return &stat, nil
}

// setReleaseStatus sets the status of the release
// Key of the object is action_name + "_" + release_name
// action_name is the name of the action, e.g. install, upgrade, delete
// status is one of the following: processing, success, failed.
func (h *Handler) setReleaseStatus(actionName, releaseName, status string, err error) error {
	key := "helm_" + actionName + "_" + releaseName

	stat := stat{
		Status: status,
	}

	if err != nil {
		errString := err.Error()
		stat.Err = &errString
	}

	cacheErr := h.Cache.SetWithTTL(context.Background(), key, stat, statusCacheTimeout)
	if cacheErr != nil {
		logger.Log(logger.LevelError, map[string]string{"key": key, "status": status},
			cacheErr, "unable to set cache value")

		return cacheErr
	}

	return nil
}

func (h *Handler) setReleaseStatusSilent(actionName, releaseName, status string, err error) {
	cacheErr := h.setReleaseStatus(actionName, releaseName, status, err)
	if cacheErr != nil {
		logger.Log(logger.LevelError, map[string]string{logFieldReleaseName: releaseName, "status": status},
			cacheErr, "unable to set status")
	}
}
