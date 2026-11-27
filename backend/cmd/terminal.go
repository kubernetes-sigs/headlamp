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

package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"runtime"
	"strings"

	"github.com/gorilla/websocket"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/terminal"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

const (
	termChannelData   byte = 0
	termChannelResize byte = 4
	termReadBufSize        = 4096
)

type terminalResizeMsg struct {
	Width  uint16 `json:"Width"`
	Height uint16 `json:"Height"`
}

func (c *HeadlampConfig) isClusterTerminalEnabled() bool {
	if c == nil || !c.EnableClusterTerminal || c.shouldUseUnsafeServiceAccountToken() {
		return false
	}

	if !c.UseInCluster && runtime.GOOS == "windows" {
		return false
	}

	return true
}

// checkTerminalWebSocketOrigin enforces a strict same-host Origin check for /wsTerminal.
func checkTerminalWebSocketOrigin(r *http.Request) bool {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		return false
	}

	u, err := url.Parse(origin)
	if err != nil || u.Host == "" {
		return false
	}

	if u.Scheme != "http" && u.Scheme != "https" {
		return false
	}

	return strings.EqualFold(u.Host, r.Host)
}

var terminalUpgrader = websocket.Upgrader{
	CheckOrigin: checkTerminalWebSocketOrigin,
}

func (c *HeadlampConfig) validateTerminalRequest(
	w http.ResponseWriter,
	r *http.Request,
) (string, *kubeconfig.Context, bool) {
	if !c.EnableClusterTerminal {
		http.Error(w, "cluster terminal is disabled", http.StatusNotFound)
		return "", nil, false
	}

	if c.shouldUseUnsafeServiceAccountToken() {
		http.Error(w, "cluster terminal is not supported with unsafe-use-service-account-token", http.StatusForbidden)
		return "", nil, false
	}

	if r.Header.Get("KUBECONFIG") != "" {
		http.Error(w, "cluster terminal is not supported for dynamic kubeconfig headers", http.StatusForbidden)
		return "", nil, false
	}

	if !c.checkLocalTerminalBackendToken(w, r) {
		return "", nil, false
	}

	clusterName := strings.TrimSpace(r.URL.Query().Get("cluster"))
	if clusterName == "" {
		http.Error(w, "cluster query parameter is required", http.StatusBadRequest)
		return "", nil, false
	}

	kContext, err := c.KubeConfigStore.GetContext(clusterName)
	if err != nil {
		http.Error(w, "cluster not found", http.StatusNotFound)
		return "", nil, false
	}

	if kContext.Source == kubeconfig.DynamicCluster {
		http.Error(w, "cluster terminal is not supported for dynamic clusters", http.StatusForbidden)
		return "", nil, false
	}

	return clusterName, kContext.Copy(), true
}

func (c *HeadlampConfig) checkLocalTerminalBackendToken(w http.ResponseWriter, r *http.Request) bool {
	if c.UseInCluster {
		return true
	}

	if os.Getenv("HEADLAMP_BACKEND_TOKEN") == "" {
		http.Error(w, "backend token must be configured for local cluster terminal", http.StatusForbidden)
		return false
	}

	authed := false

	auth.NewBackendTokenMiddleware(false)(http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {
		authed = true
	})).ServeHTTP(w, r)

	return authed
}

func (c *HeadlampConfig) handleClusterTerminalWS(w http.ResponseWriter, r *http.Request) {
	clusterName, kContext, ok := c.validateTerminalRequest(w, r)
	if !ok {
		return
	}

	username, userToken, ok := c.authenticateTerminalUser(w, r, clusterName, kContext)
	if !ok {
		return
	}

	conn, err := terminalUpgrader.Upgrade(w, r, nil)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{logFieldCluster: clusterName}, err, "upgrading terminal websocket")
		return
	}

	defer func() {
		_ = conn.Close()
	}()

	sess, err := c.openTerminalSession(r, clusterName, username, userToken, kContext)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{logFieldCluster: clusterName}, err, "opening terminal session")
		_ = conn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseInternalServerErr, err.Error()))

		return
	}

	defer func() {
		_ = sess.Close()
	}()

	pumpTerminalWebSocket(conn, sess)
}

func (c *HeadlampConfig) authenticateTerminalUser(
	w http.ResponseWriter,
	r *http.Request,
	clusterName string,
	kContext *kubeconfig.Context,
) (string, string, bool) {
	requiresUserAuth := kContext.RequiresUserAuthentication()
	c.normalizeClusterCredentials(r, clusterName, kContext)
	token := requestBearerToken(r)

	if !c.UseInCluster && !requiresUserAuth {
		return "", token, true
	}

	if token == "" {
		http.Error(w, "authentication token required", http.StatusUnauthorized)
		return "", "", false
	}

	cs, err := kContext.ClientSetWithToken(token)
	if err != nil {
		http.Error(w, "failed to create kubernetes client", http.StatusUnauthorized)
		return "", "", false
	}

	username, err := terminal.VerifyUserWithClient(r.Context(), cs)
	if err != nil {
		http.Error(w, "invalid or unauthorized authentication token", http.StatusUnauthorized)
		return "", "", false
	}

	return username, token, true
}

func (c *HeadlampConfig) openTerminalSession(
	r *http.Request,
	clusterName, username, userToken string,
	kContext *kubeconfig.Context,
) (terminal.Session, error) {
	if c.UseInCluster {
		return c.openPodTerminalSession(r, clusterName, username, userToken)
	}

	kubeconfigYAML, err := buildSingleContextKubeconfig(clusterName, kContext, userToken)
	if err != nil {
		return nil, err
	}

	return terminal.NewLocalPTYSession(terminal.LocalPTYConfig{
		KubeConfigYAML: kubeconfigYAML,
		ContextName:    clusterName,
	})
}

func (c *HeadlampConfig) openPodTerminalSession(
	r *http.Request,
	clusterName, username, userToken string,
) (terminal.Session, error) {
	if c.TerminalTokens == nil {
		c.TerminalTokens = terminal.NewSessionTokenStore()
	}

	sessionToken, err := c.TerminalTokens.Issue(userToken, clusterName, username, terminal.DefaultMaxDuration)
	if err != nil {
		return nil, fmt.Errorf("issuing terminal session token: %w", err)
	}

	inClusterName := c.InClusterContextName
	if inClusterName == "" {
		inClusterName = "main"
	}

	inClusterCtx, err := c.KubeConfigStore.GetContext(inClusterName)
	if err != nil {
		c.TerminalTokens.Revoke(sessionToken)
		return nil, fmt.Errorf("getting in-cluster context %q: %w", inClusterName, err)
	}

	restConf, err := inClusterCtx.RESTConfig()
	if err != nil {
		c.TerminalTokens.Revoke(sessionToken)
		return nil, fmt.Errorf("getting in-cluster rest config: %w", err)
	}

	cs, err := kubernetes.NewForConfig(restConf)
	if err != nil {
		c.TerminalTokens.Revoke(sessionToken)
		return nil, fmt.Errorf("creating in-cluster client: %w", err)
	}

	sess, err := terminal.NewPodSession(r.Context(), terminal.PodSessionConfig{
		Client:         cs,
		RestConfig:     restConf,
		Namespace:      defaultTerminalNamespace(c.ClusterTerminalNamespace),
		Image:          defaultTerminalImage(c.ClusterTerminalImage),
		ClusterName:    clusterName,
		Username:       username,
		ProxyServerURL: buildTerminalProxyURL(r, c.BaseURL),
		SessionToken:   sessionToken,
		OnClose:        func() { c.TerminalTokens.Revoke(sessionToken) },
	})
	if err != nil {
		c.TerminalTokens.Revoke(sessionToken)
		return nil, err
	}

	return sess, nil
}

func defaultTerminalNamespace(ns string) string {
	if ns != "" {
		return ns
	}

	return "headlamp-terminals"
}

func defaultTerminalImage(img string) string {
	if img != "" {
		return img
	}

	return "alpine:3.21"
}

func buildTerminalProxyURL(r *http.Request, baseURL string) string {
	scheme := "http"
	if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
		scheme = "https"
	}

	return fmt.Sprintf("%s://%s%s", scheme, r.Host, strings.TrimRight(baseURL, "/"))
}

func buildSingleContextKubeconfig(clusterName string, kContext *kubeconfig.Context, token string) ([]byte, error) {
	if kContext == nil || kContext.Cluster == nil {
		return nil, errors.New("cluster configuration is missing")
	}

	authInfo := &api.AuthInfo{}
	if kContext.AuthInfo != nil {
		authInfo = kContext.AuthInfo.DeepCopy()
	}

	if token != "" {
		authInfo.Token = token
		authInfo.TokenFile = ""
	}

	cfg := api.NewConfig()
	cfg.Clusters[clusterName] = kContext.Cluster.DeepCopy()
	cfg.AuthInfos[clusterName] = authInfo
	cfg.Contexts[clusterName] = &api.Context{
		Cluster:  clusterName,
		AuthInfo: clusterName,
	}
	cfg.CurrentContext = clusterName

	return clientcmd.Write(*cfg)
}

func pumpSessionToWS(conn *websocket.Conn, sess terminal.Session, errCh chan<- error) {
	buf := make([]byte, termReadBufSize)

	for {
		n, err := sess.Read(buf)
		if n > 0 {
			msg := make([]byte, n+1)
			msg[0] = termChannelData
			copy(msg[1:], buf[:n])

			if writeErr := conn.WriteMessage(websocket.BinaryMessage, msg); writeErr != nil {
				errCh <- writeErr
				return
			}
		}

		if err != nil {
			if errors.Is(err, io.EOF) {
				errCh <- nil
			} else {
				errCh <- err
			}

			return
		}
	}
}

func pumpWSToSession(conn *websocket.Conn, sess terminal.Session, errCh chan<- error) {
	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			errCh <- err
			return
		}

		if len(msg) == 0 {
			continue
		}

		switch msg[0] {
		case termChannelData:
			if len(msg) > 1 {
				if _, writeErr := sess.Write(msg[1:]); writeErr != nil {
					errCh <- writeErr
					return
				}
			}
		case termChannelResize:
			var resize terminalResizeMsg
			if jsonErr := json.Unmarshal(msg[1:], &resize); jsonErr == nil {
				_ = sess.Resize(resize.Width, resize.Height)
			}
		}
	}
}

func pumpTerminalWebSocket(conn *websocket.Conn, sess terminal.Session) {
	errCh := make(chan error, 2)

	go pumpSessionToWS(conn, sess, errCh)
	go pumpWSToSession(conn, sess, errCh)

	select {
	case <-sess.Done():
	case <-errCh:
	}
}
