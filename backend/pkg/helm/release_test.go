package helm_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/user"
	"path/filepath"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/helm"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"helm.sh/helm/v3/pkg/action"
	"k8s.io/client-go/tools/clientcmd"
)

func GetDefaultKubeConfigPath(t *testing.T) string {
	t.Helper()

	user, err := user.Current()
	require.NoError(t, err)

	homeDirectory := user.HomeDir

	return filepath.Join(homeDirectory, ".kube", "config")
}

func GetClient(t *testing.T, clusterName string) clientcmd.ClientConfig {
	t.Helper()

	if os.Getenv("HEADLAMP_RUN_INTEGRATION_TESTS") != "true" {
		t.Skip("skipping integration test")
	}

	kubeConfigPath := GetDefaultKubeConfigPath(t)

	config, err := clientcmd.LoadFromFile(kubeConfigPath)
	require.NoError(t, err)

	return clientcmd.NewInteractiveClientConfig(*config, clusterName, nil, nil, nil)
}

func getStatus(t *testing.T, ch cache.Cache[interface{}], action string, releaseName string) (string, error) {
	t.Helper()

	statusVal, err := ch.Get(context.Background(), "helm_"+action+"_"+releaseName)
	require.NoError(t, err)

	valueBytes, err := json.Marshal(statusVal)
	require.NoError(t, err)

	var status struct {
		Status string
		Err    error
	}

	err = json.Unmarshal(valueBytes, &status)
	require.NoError(t, err)

	return status.Status, status.Err
}

//nolint:unparam
func pingStatusTillSuccess(t *testing.T, action, releaseName string, cache cache.Cache[interface{}]) {
	t.Helper()

	now := time.Now()

	for {
		if time.Since(now) > time.Minute {
			t.Fatal("timed out waiting for status to be success")
		}

		time.Sleep(5 * time.Second)

		status, err := getStatus(t, cache, action, releaseName)
		require.NoError(t, err)

		if status == "success" {
			break
		}

		if status == "failed" {
			t.Fatal("status failed")
		}
	}
}

func TestInstallRelease(t *testing.T) {
	helmHandler := newHelmHandler(t)

	// add headlmap repo
	testAddRepo(t, helmHandler, "headlamp_test_repo", "https://kubernetes-sigs.github.io/headlamp/")

	// uninstall release if it already exists
	listClient := action.NewList(helmHandler.Configuration)
	listClient.AllNamespaces = true
	listClient.Filter = "helm-test-asdf"
	releases, err := listClient.Run()
	require.NoError(t, err)

	if len(releases) > 0 {
		t.Log("release helm-test-asdf already exists so cleaning up")

		_, err = action.NewUninstall(helmHandler.Configuration).Run("helm-test-asdf")
		require.NoError(t, err)
	}

	installReq := helm.InstallRequest{
		CommonInstallUpdateRequest: helm.CommonInstallUpdateRequest{
			Name:        "helm-test-asdf",
			Namespace:   "default",
			Description: "install headlamp",
			Chart:       "headlamp_test_repo/headlamp",
			Values:      "",
			Version:     "0.9.0",
		},
	}

	installReqBytes, err := json.Marshal(installReq)
	require.NoError(t, err)

	installReleaseRequest, err := http.NewRequestWithContext(context.Background(),
		"POST", "/clusters/minikube/helm/releases",
		bytes.NewBuffer(installReqBytes))
	require.NoError(t, err)

	// response recorder
	rr := httptest.NewRecorder()

	helmHandler.InstallRelease(rr, installReleaseRequest)

	require.Equal(t, http.StatusAccepted, rr.Code)

	pingStatusTillSuccess(t, "install", "helm-test-asdf", helmHandler.Cache)
}

func TestListRelease(t *testing.T) {
	helmHandler := newHelmHandler(t)

	// list release request
	listReleaseReq, err := http.NewRequestWithContext(context.Background(),
		"GET", "/clusters/minikube/helm/releases", nil)
	require.NoError(t, err)

	// response recorder
	rr := httptest.NewRecorder()

	helmHandler.ListRelease(rr, listReleaseReq)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Contains(t, rr.Body.String(), "helm-test-asdf")
	assert.NotContains(t, rr.Body.String(), "non-existing-release")
}

func TestUpgradeRelease(t *testing.T) {
	helmHandler := newHelmHandler(t)

	upgradeReq := helm.UpgradeReleaseRequest{
		CommonInstallUpdateRequest: helm.CommonInstallUpdateRequest{
			Name:        "helm-test-asdf",
			Namespace:   "default",
			Description: "upgrade headlamp",
			Chart:       "headlamp_test_repo/headlamp",
			Values:      "",
			Version:     "0.11.0",
		},
	}

	upgradeReqBytes, err := json.Marshal(upgradeReq)
	require.NoError(t, err)

	upgradeReleaseRequest, err := http.NewRequestWithContext(context.Background(),
		"PUT", "/clusters/minikube/helm/releases",
		bytes.NewBuffer(upgradeReqBytes))
	require.NoError(t, err)

	// response recorder
	rr := httptest.NewRecorder()

	helmHandler.UpgradeRelease(rr, upgradeReleaseRequest)

	require.Equal(t, http.StatusAccepted, rr.Code)

	pingStatusTillSuccess(t, "upgrade", "helm-test-asdf", helmHandler.Cache)
}

func TestRollbackRelease(t *testing.T) {
	helmHandler := newHelmHandler(t)

	rollbackReq := helm.RollbackReleaseRequest{
		Name:      "helm-test-asdf",
		Namespace: "default",
		Revision:  1,
	}

	rollbackReqBytes, err := json.Marshal(rollbackReq)
	require.NoError(t, err)

	rollbackReleaseRequest, err := http.NewRequestWithContext(context.Background(),
		"PUT", "/clusters/minikube/helm/releases/rollback",
		bytes.NewBuffer(rollbackReqBytes))
	require.NoError(t, err)

	// response recorder
	rr := httptest.NewRecorder()

	helmHandler.RollbackRelease(rr, rollbackReleaseRequest)

	require.Equal(t, http.StatusAccepted, rr.Code)

	pingStatusTillSuccess(t, "rollback", "helm-test-asdf", helmHandler.Cache)
}

func TestUninstallRelease(t *testing.T) {
	helmHandler := newHelmHandler(t)

	uninstallReleaseRequest, err := http.NewRequestWithContext(context.Background(), "DELETE",
		`/clusters/minikube/helm/releases/uninstall?name=helm-test-asdf&namespace=default`,
		nil)
	require.NoError(t, err)

	// response recorder
	rr := httptest.NewRecorder()

	helmHandler.UninstallRelease(rr, uninstallReleaseRequest)

	require.Equal(t, http.StatusAccepted, rr.Code)

	pingStatusTillSuccess(t, "uninstall", "helm-test-asdf", helmHandler.Cache)
}
