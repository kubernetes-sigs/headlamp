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

package terminal

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sync"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/remotecommand"
)

const (
	defaultTerminalContainerName = "terminal"
	podStartTimeout              = 60 * time.Second
	podPollInterval              = 500 * time.Millisecond
)

// PodSessionConfig configures an in-cluster per-session terminal pod.
type PodSessionConfig struct {
	Client         kubernetes.Interface
	RestConfig     *rest.Config
	Namespace      string
	Image          string
	ClusterName    string
	Username       string
	ProxyServerURL string
	SessionToken   string
	OnClose        func()
	IdleTimeout    time.Duration
	MaxDuration    time.Duration
}

type sizeQueue struct {
	ch chan remotecommand.TerminalSize
}

func (q *sizeQueue) Next() *remotecommand.TerminalSize {
	size, ok := <-q.ch
	if !ok {
		return nil
	}

	return &size
}

type podSession struct {
	client      kubernetes.Interface
	namespace   string
	podName     string
	stdinWriter *io.PipeWriter
	stdoutRead  *io.PipeReader
	sizeQueue   *sizeQueue
	done        chan struct{}
	closeOnce   sync.Once
	onClose     func()
	idleResetCh chan struct{}
}

// BuildProxyKubeconfig builds a minimal kubeconfig pointing at Headlamp's cluster proxy
// authenticated with a revocable Headlamp session token.
func BuildProxyKubeconfig(proxyServerURL, clusterName, sessionToken string) []byte {
	server := fmt.Sprintf("%s/clusters/%s", proxyServerURL, url.PathEscape(clusterName))

	return []byte(fmt.Sprintf(`apiVersion: v1
kind: Config
clusters:
- name: %s
  cluster:
    server: %s
    insecure-skip-tls-verify: true
contexts:
- name: %s
  context:
    cluster: %s
    user: headlamp-session
current-context: %s
users:
- name: headlamp-session
  user:
    token: %s
`, clusterName, server, clusterName, clusterName, clusterName, sessionToken))
}

func buildTerminalPodSpec(namespace, image string, maxDuration time.Duration) *corev1.Pod {
	runAsNonRoot := true
	allowPrivEsc := false

	activeDeadline := int64(maxDuration.Seconds())
	if activeDeadline <= 0 {
		activeDeadline = int64(DefaultMaxDuration.Seconds())
	}

	return &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			GenerateName: "headlamp-term-",
			Namespace:    namespace,
			Labels: map[string]string{
				"app.kubernetes.io/managed-by": "headlamp",
				"headlamp.dev/terminal":        "true",
			},
		},
		Spec: corev1.PodSpec{
			RestartPolicy:         corev1.RestartPolicyNever,
			ActiveDeadlineSeconds: &activeDeadline,
			AutomountServiceAccountToken: func() *bool {
				b := false
				return &b
			}(),
			SecurityContext: &corev1.PodSecurityContext{
				RunAsNonRoot: &runAsNonRoot,
				SeccompProfile: &corev1.SeccompProfile{
					Type: corev1.SeccompProfileTypeRuntimeDefault,
				},
			},
			Containers: []corev1.Container{
				{
					Name:    defaultTerminalContainerName,
					Image:   image,
					Command: []string{"/bin/sh", "-c", "sleep infinity"},
					SecurityContext: &corev1.SecurityContext{
						AllowPrivilegeEscalation: &allowPrivEsc,
						Capabilities: &corev1.Capabilities{
							Drop: []corev1.Capability{"ALL"},
						},
					},
				},
			},
		},
	}
}

func waitForPodRunning(ctx context.Context, client kubernetes.Interface, namespace, name string) error {
	deadlineCtx, cancel := context.WithTimeout(ctx, podStartTimeout)
	defer cancel()

	ticker := time.NewTicker(podPollInterval)
	defer ticker.Stop()

	for {
		pod, err := client.CoreV1().Pods(namespace).Get(deadlineCtx, name, metav1.GetOptions{})
		if err != nil {
			return err
		}

		if pod.Status.Phase == corev1.PodRunning {
			return nil
		}

		if pod.Status.Phase == corev1.PodFailed || pod.Status.Phase == corev1.PodSucceeded {
			return fmt.Errorf("terminal pod exited prematurely with phase %s", pod.Status.Phase)
		}

		select {
		case <-deadlineCtx.Done():
			return deadlineCtx.Err()
		case <-ticker.C:
		}
	}
}

func startPodExecStream(
	cfg PodSessionConfig,
	podName string,
	cleanupPod func(),
) (Session, error) {
	kubeconfigYAML := BuildProxyKubeconfig(cfg.ProxyServerURL, cfg.ClusterName, cfg.SessionToken)
	bootstrapCmd := fmt.Sprintf(
		"printf %%s %q | base64 -d > /tmp/kubeconfig && chmod 600 /tmp/kubeconfig && "+
			"export KUBECONFIG=/tmp/kubeconfig TERM=xterm-256color && exec /bin/sh",
		base64.StdEncoding.EncodeToString(kubeconfigYAML),
	)

	req := cfg.Client.CoreV1().RESTClient().Post().
		Resource("pods").
		Name(podName).
		Namespace(cfg.Namespace).
		SubResource("exec").
		VersionedParams(&corev1.PodExecOptions{
			Container: defaultTerminalContainerName,
			Command:   []string{"/bin/sh", "-c", bootstrapCmd},
			Stdin:     true,
			Stdout:    true,
			Stderr:    true,
			TTY:       true,
		}, scheme.ParameterCodec)

	exec, err := remotecommand.NewSPDYExecutor(cfg.RestConfig, http.MethodPost, req.URL())
	if err != nil {
		cleanupPod()
		return nil, fmt.Errorf("creating pod exec executor: %w", err)
	}

	stdinR, stdinW := io.Pipe()
	stdoutR, stdoutW := io.Pipe()
	sq := &sizeQueue{ch: make(chan remotecommand.TerminalSize, 8)}

	s := &podSession{
		client:      cfg.Client,
		namespace:   cfg.Namespace,
		podName:     podName,
		stdinWriter: stdinW,
		stdoutRead:  stdoutR,
		sizeQueue:   sq,
		done:        make(chan struct{}),
		onClose:     cfg.OnClose,
		idleResetCh: make(chan struct{}, 1),
	}

	go func() {
		_ = exec.StreamWithContext(context.Background(), remotecommand.StreamOptions{
			Stdin:             stdinR,
			Stdout:            stdoutW,
			Stderr:            stdoutW,
			Tty:               true,
			TerminalSizeQueue: sq,
		})
		_ = stdoutW.Close()
		_ = s.Close()
	}()

	return s, nil
}

// NewPodSession creates a short-lived terminal pod in cfg.Namespace, attaches an
// interactive shell via SPDY exec, and injects a proxy kubeconfig with cfg.SessionToken.
func NewPodSession(ctx context.Context, cfg PodSessionConfig) (Session, error) {
	if cfg.Client == nil || cfg.RestConfig == nil {
		return nil, errors.New("kubernetes client and rest config are required")
	}

	idleTimeout := cfg.IdleTimeout
	if idleTimeout <= 0 {
		idleTimeout = DefaultIdleTimeout
	}

	maxDuration := cfg.MaxDuration
	if maxDuration <= 0 {
		maxDuration = DefaultMaxDuration
	}

	podSpec := buildTerminalPodSpec(cfg.Namespace, cfg.Image, maxDuration)

	created, err := cfg.Client.CoreV1().Pods(cfg.Namespace).Create(ctx, podSpec, metav1.CreateOptions{})
	if err != nil {
		return nil, fmt.Errorf("creating terminal pod: %w", err)
	}

	cleanupPod := func() {
		delCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		zero := int64(0)
		_ = cfg.Client.CoreV1().Pods(cfg.Namespace).Delete(delCtx, created.Name, metav1.DeleteOptions{
			GracePeriodSeconds: &zero,
		})
	}

	if err := waitForPodRunning(ctx, cfg.Client, cfg.Namespace, created.Name); err != nil {
		cleanupPod()
		return nil, fmt.Errorf("waiting for terminal pod: %w", err)
	}

	s, err := startPodExecStream(cfg, created.Name, cleanupPod)
	if err != nil {
		return nil, err
	}

	go s.(*podSession).watchTimers(idleTimeout, maxDuration)

	return s, nil
}

func (s *podSession) watchTimers(idleTimeout, maxDuration time.Duration) {
	idleTimer := time.NewTimer(idleTimeout)
	defer idleTimer.Stop()

	maxTimer := time.NewTimer(maxDuration)
	defer maxTimer.Stop()

	for {
		select {
		case <-s.idleResetCh:
			if !idleTimer.Stop() {
				select {
				case <-idleTimer.C:
				default:
				}
			}

			idleTimer.Reset(idleTimeout)
		case <-idleTimer.C:
			_ = s.Close()
			return
		case <-maxTimer.C:
			_ = s.Close()
			return
		case <-s.done:
			return
		}
	}
}

func (s *podSession) touchActivity() {
	select {
	case s.idleResetCh <- struct{}{}:
	default:
	}
}

func (s *podSession) Read(p []byte) (int, error) {
	n, err := s.stdoutRead.Read(p)
	if n > 0 {
		s.touchActivity()
	}

	return n, err
}

func (s *podSession) Write(p []byte) (int, error) {
	s.touchActivity()
	return s.stdinWriter.Write(p)
}

func (s *podSession) Resize(cols, rows uint16) error {
	if cols == 0 || rows == 0 {
		return errors.New("invalid terminal dimensions")
	}

	select {
	case s.sizeQueue.ch <- remotecommand.TerminalSize{Width: cols, Height: rows}:
		return nil
	case <-s.done:
		return errors.New("session closed")
	default:
		return nil
	}
}

func (s *podSession) Done() <-chan struct{} {
	return s.done
}

func (s *podSession) Close() error {
	s.closeOnce.Do(func() {
		close(s.done)
		close(s.sizeQueue.ch)
		_ = s.stdinWriter.Close()
		_ = s.stdoutRead.Close()

		if s.onClose != nil {
			s.onClose()
		}

		delCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		zero := int64(0)
		_ = s.client.CoreV1().Pods(s.namespace).Delete(delCtx, s.podName, metav1.DeleteOptions{
			GracePeriodSeconds: &zero,
		})
	})

	return nil
}
