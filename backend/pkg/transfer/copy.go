// Copyright 2025 The Kubernetes Authors.
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//	http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package transfer

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"path"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/scheme"
	restclient "k8s.io/client-go/rest"
	"k8s.io/client-go/tools/remotecommand"
)

func getClientSet(
	kubeConfigStore kubeconfig.ContextStore,
	clusterName, token string,
) (*kubernetes.Clientset, *restclient.Config, error) {
	clusterContext, err := kubeConfigStore.GetContext(clusterName)
	if err != nil {
		return nil, nil, err
	}

	config, err := clusterContext.RESTConfig()
	if err != nil {
		return nil, nil, err
	}

	if token != "" {
		config.BearerToken = token
	}

	cs, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, nil, err
	}

	return cs, config, nil
}

// Builds and executes a remote command inside a container.
func execInPod(
	ctx context.Context,
	cs *kubernetes.Clientset,
	config *restclient.Config,
	namespace, podName, containerName string,
	cmd []string,
	opts remotecommand.StreamOptions,
) error {
	req := cs.CoreV1().RESTClient().Post().
		Resource("pods").
		Name(podName).
		Namespace(namespace).
		SubResource("exec").
		VersionedParams(&corev1.PodExecOptions{
			Container: containerName,
			Command:   cmd,
			Stdin:     opts.Stdin != nil,
			Stdout:    opts.Stdout != nil,
			Stderr:    opts.Stderr != nil,
			TTY:       false,
		}, scheme.ParameterCodec)

	exec, err := remotecommand.NewSPDYExecutor(config, http.MethodPost, req.URL())
	if err != nil {
		return err
	}

	return exec.StreamWithContext(ctx, opts)
}

// Verify if tar and file path is present.
func VerifyDownloadTarget(
	ctx context.Context,
	kubeConfigStore kubeconfig.ContextStore,
	clusterName, namespace, podName, containerName, filePath string,
	token string,
) error {
	cs, config, err := getClientSet(kubeConfigStore, clusterName, token)
	if err != nil {
		return err
	}

	var stderr bytes.Buffer

	cmd := []string{"sh", "-c", "which tar && [ -e \"$1\" ] && [ -r \"$1\" ]", "sh", filePath}

	err = execInPod(ctx, cs, config, namespace, podName, containerName,
		cmd,
		remotecommand.StreamOptions{Stderr: &stderr},
	)
	if err != nil {
		if stderr.Len() > 0 {
			return fmt.Errorf("pre-check failed: %s", stderr.String())
		}

		return fmt.Errorf("download pre-check failed: ensure 'tar' is installed and path '%s' is valid", filePath)
	}

	return nil
}

// DownloadFromPod streams a tar archive of the specified file or directory
// from a pod to the provided writer.
func DownloadFromPod(
	ctx context.Context,
	kubeConfigStore kubeconfig.ContextStore,
	clusterName, namespace, podName, containerName, filePath string,
	token string,
	stdout io.Writer,
) error {
	cs, config, err := getClientSet(kubeConfigStore, clusterName, token)
	if err != nil {
		return err
	}

	var stderr bytes.Buffer

	cmd := []string{"tar", "-cf", "-", filePath}

	err = execInPod(ctx, cs, config, namespace, podName, containerName,
		cmd,
		remotecommand.StreamOptions{Stdout: stdout, Stderr: &stderr},
	)
	if err != nil {
		if stderr.Len() > 0 {
			return fmt.Errorf("container error: %s", stderr.String())
		}

		return err
	}

	return nil
}

// Verify for write permissions and if file path is present.
func VerifyUploadTarget(
	ctx context.Context,
	kubeConfigStore kubeconfig.ContextStore,
	clusterName, namespace, podName, containerName, fullPath string,
	token string,
) error {
	cs, config, err := getClientSet(kubeConfigStore, clusterName, token)
	if err != nil {
		return err
	}

	var stderr bytes.Buffer

	dirPath := path.Dir(fullPath)
	cmd := []string{"sh", "-c", "which tee && [ -d \"$1\" ] && [ -w \"$1\" ]", "sh", dirPath}

	err = execInPod(ctx, cs, config, namespace, podName, containerName,
		cmd,
		remotecommand.StreamOptions{Stderr: &stderr},
	)
	if err != nil {
		return fmt.Errorf("upload pre-check failed: ensure directory '%s' exists and is writable", dirPath)
	}

	return nil
}

// UploadToPod streams the content from stdin into the specified path
// inside the container using tee.
func UploadToPod(
	ctx context.Context,
	kubeConfigStore kubeconfig.ContextStore,
	clusterName, namespace, podName, containerName, fullPath string,
	token string,
	stdin io.Reader,
) error {
	cs, config, err := getClientSet(kubeConfigStore, clusterName, token)
	if err != nil {
		return err
	}

	var stderr bytes.Buffer

	// parameterizing path handles problematic characters
	cmd := []string{"sh", "-c", "tee \"$1\" > /dev/null", "sh", fullPath}

	err = execInPod(ctx, cs, config, namespace, podName, containerName,
		cmd,
		remotecommand.StreamOptions{Stdin: stdin, Stderr: &stderr},
	)
	if err != nil {
		if stderr.Len() > 0 {
			return fmt.Errorf("container error: %s", stderr.String())
		}

		return err
	}

	return nil
}
