package kubeconfig

import (
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"runtime"
	"strings"

	"gopkg.in/yaml.v2"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	k8sruntime "k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/exec"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/pkg/apis/clientauthentication"
	rest "k8s.io/client-go/rest"
	"k8s.io/client-go/transport"
)

// TODO: Use a different way to avoid name clashes with other clusters.
const InClusterContextName = "main"

const (
	KubeConfig = 1 << iota
	DynamicCluster
	InCluster
)

// Context contains all information related to a kubernetes context.
type Context struct {
	Name        string                 `json:"name"`
	KubeContext *api.Context           `json:"kubeContext"`
	Cluster     *api.Cluster           `json:"cluster"`
	AuthInfo    *api.AuthInfo          `json:"authInfo"`
	Source      int                    `json:"source"`
	OidcConf    *OidcConfig            `json:"oidcConfig"`
	proxy       *httputil.ReverseProxy `json:"-"`
	Internal    bool                   `json:"internal"`
	Error       string                 `json:"error"`
	// KubeConfigPath is the file path for the kubeconfig file.
	KubeConfigPath string `json:"kubeConfigPath"`
	// ClusterID is the unique identifier for the cluster, consisting of the filepath and context name.
	ClusterID string `json:"clusterID"`
}

type OidcConfig struct {
	ClientID     string
	ClientSecret string
	IdpIssuerURL string
	Scopes       []string
}

// CustomObject represents the custom object that holds the HeadlampInfo regarding custom name.
type CustomObject struct {
	metav1.TypeMeta
	metav1.ObjectMeta
	CustomName string `json:"customName"`
}

// DeepCopyObject returns a copy of the CustomObject.
func (o *CustomObject) DeepCopyObject() k8sruntime.Object {
	return o.DeepCopy()
}

// DeepCopy creates a deep copy of the CustomObject.
func (o *CustomObject) DeepCopy() *CustomObject {
	if o == nil {
		return nil
	}

	copied := &CustomObject{}
	o.ObjectMeta.DeepCopyInto(&copied.ObjectMeta)
	copied.TypeMeta = o.TypeMeta
	copied.CustomName = o.CustomName

	return copied
}

// ContextError is an error that occurs in a context.
type ContextError struct {
	ContextName string
	Reason      string
}

// Error returns a string representation of the error.
func (e ContextError) Error() string {
	return fmt.Sprintf("Error in context '%s': %s", e.ContextName, e.Reason)
}

// ClusterError is an error that occurs in a cluster.
type ClusterError struct {
	ClusterName string
	Reason      string
}

// Error returns a string representation of the error.
func (e ClusterError) Error() string {
	return fmt.Sprintf("Error in cluster '%s': %s", e.ClusterName, e.Reason)
}

// UserError is an error that occurs in a user.
type UserError struct {
	UserName string
	Reason   string
}

// Error returns a string representation of the error.
func (e UserError) Error() string {
	return fmt.Sprintf("Error in user '%s': %s", e.UserName, e.Reason)
}

// DataError is an error that occurs in data.
type DataError struct {
	Field  string
	Reason string
}

// Error returns a string representation of the error.
func (e DataError) Error() string {
	return fmt.Sprintf("Error in field '%s': %s", e.Field, e.Reason)
}

// Base64Error is an error that occurs when decoding base64 data.
type Base64Error struct {
	ContextName string
	ClusterName string
	UserName    string
	Errors      []error
}

// Error returns a string representation of the error.
func (e Base64Error) Error() string {
	var messages []string //nolint:prealloc

	for _, err := range e.Errors {
		messages = append(messages, err.Error())
	}

	return fmt.Sprintf("Base64 decoding errors in context '%s', cluster '%s', user '%s':\n%s",
		e.ContextName, e.ClusterName, e.UserName, strings.Join(messages, "\n"))
}

// ClientConfig returns a clientcmd.ClientConfig for the context.
func (c *Context) ClientConfig() clientcmd.ClientConfig {
	// If the context is empty, return nil.
	if c.Name == "" && c.KubeContext == nil && c.Cluster == nil && c.AuthInfo == nil {
		return nil
	}

	if c.KubeContext == nil {
		c.KubeContext = &api.Context{}
	}

	if c.Cluster == nil {
		c.Cluster = &api.Cluster{}
	}

	if c.AuthInfo == nil {
		c.AuthInfo = &api.AuthInfo{}
	}

	conf := api.Config{
		Clusters: map[string]*api.Cluster{
			c.KubeContext.Cluster: c.Cluster,
		},
		AuthInfos: map[string]*api.AuthInfo{
			c.KubeContext.AuthInfo: c.AuthInfo,
		},
		Contexts: map[string]*api.Context{
			c.Name: c.KubeContext,
		},
	}

	return clientcmd.NewNonInteractiveClientConfig(conf, c.Name, nil, nil)
}

// RESTConfig returns a rest.Config for the context.
func (c *Context) RESTConfig() (*rest.Config, error) {
	clientConfig := c.ClientConfig()
	if clientConfig == nil {
		return nil, errors.New("clientConfig is nil")
	}

	return clientConfig.ClientConfig()
}

// makeTransportFor creates an HTTP transport configuration with special handling for
// Windows systems to prevent terminal window flashing during exec-based authentication.
func makeTransportFor(conf *rest.Config) (http.RoundTripper, error) {
	if conf == nil {
		return nil, fmt.Errorf("configuration cannot be nil")
	}

	// Use standard transport for non-Windows systems or when ExecProvider is not configured
	if conf.ExecProvider == nil || runtime.GOOS != "windows" {
		return rest.TransportFor(conf)
	}

	confNoExec := *conf
	confNoExec.ExecProvider = nil
	// Get the Transport Config but without the ExecProvider because we will set
	// it up with our version.
	cfg, err := confNoExec.TransportConfig()
	if err != nil {
		return nil, fmt.Errorf("failed to get transport config: %w", err)
	}

	var cluster *clientauthentication.Cluster

	if conf.ExecProvider.ProvideClusterInfo {
		var err error

		cluster, err = rest.ConfigToExecCluster(conf)
		if err != nil {
			return nil, fmt.Errorf("failed to get cluster info: %w", err)
		}
	}

	// Configure authentication provider using custom authenticator
	provider, err := exec.GetAuthenticator(conf.ExecProvider, cluster)
	if err != nil {
		return nil, fmt.Errorf("failed to get authenticator: %w", err)
	}

	if err := provider.UpdateTransportConfig(cfg); err != nil {
		return nil, fmt.Errorf("failed to update transport config: %w", err)
	}

	return transport.New(cfg)
}

// OidcConfig returns the oidc config for the context.
func (c *Context) OidcConfig() (*OidcConfig, error) {
	if c.OidcConf != nil {
		return c.OidcConf, nil
	}

	if c.AuthInfo.AuthProvider == nil {
		return nil, errors.New("authProvider is nil")
	}

	return &OidcConfig{
		ClientID:     c.AuthInfo.AuthProvider.Config["client-id"],
		ClientSecret: c.AuthInfo.AuthProvider.Config["client-secret"],
		Scopes:       strings.Split(c.AuthInfo.AuthProvider.Config["scope"], ","),
		IdpIssuerURL: c.AuthInfo.AuthProvider.Config["idp-issuer-url"],
	}, nil
}

// ProxyRequest proxies the given request to the cluster.
func (c *Context) ProxyRequest(writer http.ResponseWriter, request *http.Request) error {
	if c.proxy == nil {
		err := c.SetupProxy()
		if err != nil {
			return err
		}
	}

	c.proxy.ServeHTTP(writer, request)

	return nil
}

// ClientSetWithToken returns a kubernetes clientset for the context.
func (c *Context) ClientSetWithToken(token string) (*kubernetes.Clientset, error) {
	restConf, err := c.RESTConfig()
	if err != nil {
		return nil, err
	}

	if token != "" {
		restConf.BearerToken = token
	}

	return kubernetes.NewForConfig(restConf)
}

// SourceStr returns the source from which the context was loaded.
func (c *Context) SourceStr() string {
	switch c.Source {
	case KubeConfig:
		return "kubeconfig"
	case DynamicCluster:
		return "dynamic_cluster"
	case InCluster:
		return "incluster"
	default:
		return "unknown"
	}
}

// SetupProxy sets up a reverse proxy for the context.
func (c *Context) SetupProxy() error {
	URL, err := url.Parse(c.Cluster.Server)
	if err != nil {
		return err
	}

	proxy := httputil.NewSingleHostReverseProxy(URL)

	restConf, err := c.RESTConfig()
	if err == nil {
		roundTripper, err := makeTransportFor(restConf)
		if err == nil {
			proxy.Transport = roundTripper
		}
	}

	c.proxy = proxy

	logger.Log(logger.LevelInfo, map[string]string{"context": c.Name, "clusterURL": c.Cluster.Server},
		nil, "Proxy setup")

	return nil
}

// AuthType returns the authentication type for the context.
func (c *Context) AuthType() string {
	if (c.OidcConf != nil) || (c.AuthInfo != nil && c.AuthInfo.AuthProvider != nil) {
		return "oidc"
	}

	return ""
}

// ContextLoadError represents an error associated with a specific context.
type ContextLoadError struct {
	ContextName string
	Error       error
}

// LoadContextsFromFile loads contexts from a kubeconfig file.
// It reads the kubeconfig file from the given path and loads the contexts from the file.
// It returns an error if the file cannot be read.
// It will return valid (contexts, ContextLoadErrors,nil) and errors if there are any errors in the file.
func LoadContextsFromFile(kubeConfigPath string, source int) ([]Context, []ContextLoadError, error) {
	data, err := os.ReadFile(kubeConfigPath)
	if err != nil {
		return nil, nil, fmt.Errorf("error reading kubeconfig file: %v", err)
	}

	skipProxySetup := source != KubeConfig

	contexts, contextErrors, err := loadContextsFromData(data, source, skipProxySetup)
	if err != nil {
		return nil, nil, fmt.Errorf("error loading contexts from file: %v", err)
	}

	// add the KubeConfigPath to each context
	for i := range contexts {
		contexts[i].KubeConfigPath = kubeConfigPath
		// create the clusterID from the path and context name
		contexts[i].ClusterID = fmt.Sprintf("%s+%s", kubeConfigPath, contexts[i].Name)
	}

	return contexts, contextErrors, nil
}

// LoadContextsFromBase64String loads contexts from a base64 encoded kubeconfig string.
// It decodes the base64 encoded kubeconfig string and loads the contexts from the decoded string.
// It returns an error if the base64 decoding fails.
// It will return valid contexts, ContextLoadError and errors if there are any errors in the file.
func LoadContextsFromBase64String(kubeConfig string, source int) ([]Context, []ContextLoadError, error) {
	kubeConfigByte, err := base64.StdEncoding.DecodeString(kubeConfig)
	if err != nil {
		return nil, nil, fmt.Errorf("error decoding base64 kubeconfig: %v", err)
	}

	skipProxySetup := source != KubeConfig

	return loadContextsFromData(kubeConfigByte, source, skipProxySetup)
}

// LoadContextsFromMultipleFiles loads contexts from the given kubeconfig files.
func LoadContextsFromMultipleFiles(kubeConfigs string, source int) ([]Context, []ContextLoadError, error) {
	var contexts []Context

	var contextErrors []ContextLoadError

	kubeConfigPaths := splitKubeConfigPath(kubeConfigs)
	for _, kubeConfigPath := range kubeConfigPaths {
		kubeConfigContexts, errs, err := LoadContextsFromFile(kubeConfigPath, source)
		if err != nil {
			return nil, nil, err
		}

		contexts = append(contexts, kubeConfigContexts...)
		contextErrors = append(contextErrors, errs...)
	}

	return contexts, contextErrors, nil
}

// loadContextsFromData loads contexts from a kubeconfig data.
// It unmarshals the kubeconfig data, extracts the contexts, and processes each context.
// It returns valid contexts, contextLoadErrors and any errors that occurred during the process.
func loadContextsFromData(data []byte, source int, skipProxySetup bool) ([]Context, []ContextLoadError, error) {
	var contexts []Context //nolint:prealloc

	var contextErrors []ContextLoadError

	// Unmarshal the kubeconfig data
	kubeconfig, err := UnmarshalKubeconfig(data)
	if err != nil {
		return nil, nil, err
	}

	// Get the contexts from the kubeconfig
	rawContexts, err := GetContextsFromKubeconfig(kubeconfig)
	if err != nil {
		return nil, nil, err
	}

	// Process each context
	for _, rawContext := range rawContexts {
		context, err := ProcessContext(rawContext, kubeconfig, source, skipProxySetup)
		if err != nil {
			contextErrors = append(contextErrors, ContextLoadError{
				ContextName: context.Name,
				Error:       err,
			})

			// Do not include any contexts with errors, else they may be
			// processed as valid and make things fail.
			continue
		}

		contexts = append(contexts, context)
	}

	return contexts, contextErrors, nil
}

// UnmarshalKubeconfig unmarshals the kubeconfig data.
func UnmarshalKubeconfig(data []byte) (map[string]interface{}, error) {
	var kubeconfig map[string]interface{}

	err := yaml.Unmarshal(data, &kubeconfig)
	if err != nil {
		return nil, DataError{Field: "kubeconfig", Reason: fmt.Sprintf("error unmarshaling YAML: %v", err)}
	}

	return kubeconfig, nil
}

// GetContextsFromKubeconfig gets the contexts from the kubeconfig.
func GetContextsFromKubeconfig(kubeconfig map[string]interface{}) ([]interface{}, error) {
	rawContexts, ok := kubeconfig["contexts"].([]interface{})
	if !ok {
		return nil, DataError{Field: "contexts", Reason: "invalid or missing contexts in kubeconfig"}
	}

	return rawContexts, nil
}

// ProcessContext processes a context from the kubeconfig.
// It returns errors for invalid contexts, but will return all contexts.
// rawContext can be a single context or a list of contexts.
// kubeconfig is the kubeconfig data.
// source is the source of the kubeconfig, i.e where the kubeconfig came from.
// It can be KubeConfig, DynamicCluster, or InCluster.
// skipProxySetup is a flag to skip proxy setup.
func ProcessContext(
	rawContext interface{},
	kubeconfig map[string]interface{},
	source int,
	skipProxySetup bool,
) (Context, error) {
	var errs []error

	var context Context
	// Extract context information
	contextMap, contextName, err := extractContextInfo(rawContext)
	if err != nil {
		errs = append(errs, err)
	}

	// Extract cluster and user names
	clusterName, userName, err := extractClusterAndUserNames(contextMap, contextName)
	if err != nil {
		errs = append(errs, err)
	}

	// Get the cluster and user details
	cluster, user, err := getClusterAndUser(kubeconfig, clusterName, userName)
	if err != nil {
		errs = append(errs, err)
	}

	// Create and validate the config
	singleConfig, err := createAndValidateConfig(contextName, contextMap, cluster, user, kubeconfig)
	if err != nil {
		errs = append(errs, err)
		context = Context{
			Name:  contextName,
			Error: err.Error(),
		}

		return context, errors.Join(errs...)
	}

	// Convert the config to a context
	context, err = convertToContext(contextName, singleConfig, source, skipProxySetup)
	if err != nil {
		errs = append(errs, err)
	}

	return context, errors.Join(errs...)
}

// extractContextInfo extracts the context information from the raw context.
func extractContextInfo(rawContext interface{}) (map[interface{}]interface{}, string, error) {
	contextMap, ok := rawContext.(map[interface{}]interface{})
	if !ok {
		return nil, "", DataError{Field: "context", Reason: fmt.Sprintf("invalid context format: %v", rawContext)}
	}

	contextName, ok := contextMap["name"].(string)
	if !ok {
		return nil, "", DataError{
			Field:  "context.name",
			Reason: fmt.Sprintf("missing or invalid context name: %v", contextMap["name"]),
		}
	}

	return contextMap, contextName, nil
}

// extractClusterAndUserNames extracts the cluster and user names from the context.
func extractClusterAndUserNames(contextMap map[interface{}]interface{}, contextName string) (string, string, error) {
	contextData, ok := contextMap["context"].(map[interface{}]interface{})
	if !ok {
		return "", "", ContextError{
			ContextName: contextName,
			Reason:      fmt.Sprintf("invalid context data: %v", contextMap["context"]),
		}
	}

	clusterName := contextData["cluster"].(string)

	userName := contextData["user"].(string)

	return clusterName, userName, nil
}

// getClusterAndUser gets the cluster and user details from the kubeconfig.
func getClusterAndUser(
	kubeconfig map[string]interface{},
	clusterName,
	userName string,
) (map[interface{}]interface{}, map[interface{}]interface{}, error) {
	var errs []error

	cluster, err := getCluster(kubeconfig, clusterName)
	if err != nil {
		errs = append(errs, err)
	}

	user, err := getUser(kubeconfig, userName)
	if err != nil {
		errs = append(errs, err)
	}

	return cluster, user, errors.Join(errs...)
}

// createAndValidateConfig creates and validates the config.
func createAndValidateConfig(
	contextName string,
	contextMap,
	cluster,
	user map[interface{}]interface{},
	kubeconfig map[string]interface{},
) (*api.Config, error) {
	singleConfig := createKubeConfig(contextName,
		toStringKeyMap(contextMap),
		toStringKeyMap(cluster),
		toStringKeyMap(user))

	yamlData, err := yaml.Marshal(singleConfig)
	if err != nil {
		return nil, ContextError{
			ContextName: contextName,
			Reason:      fmt.Sprintf("error marshaling to YAML: %v", err),
		}
	}

	clientConfig, err := clientcmd.Load(yamlData)
	if err != nil {
		clusterName := getNameOrUnknown(cluster, "name")
		userName := getNameOrUnknown(user, "name")

		return nil, HandleConfigLoadError(err, contextName, clusterName, userName, kubeconfig)
	}

	return clientConfig, nil
}

// getNameOrUnknown returns the name of the cluster or user if it exists, otherwise it returns "unknown".
func getNameOrUnknown(data map[interface{}]interface{}, key string) string {
	if nameInterface, ok := data[key]; ok {
		if nameString, ok := nameInterface.(string); ok {
			return nameString
		}
	}

	return "unknown"
}

// HandleConfigLoadError handles the error when loading the config.
func HandleConfigLoadError(
	err error,
	contextName,
	clusterName,
	userName string,
	kubeconfig map[string]interface{},
) error {
	switch {
	case strings.Contains(err.Error(), "illegal base64"):
		return checkBase64Errors(kubeconfig, contextName, clusterName, userName)
	case strings.Contains(err.Error(), "no server found"):
		return ClusterError{
			ClusterName: clusterName,
			Reason:      "No server URL specified. Please check the cluster configuration.",
		}
	case strings.Contains(err.Error(), "unable to read client-cert"):
		return UserError{
			UserName: userName,
			Reason:   "Unable to read client certificate. Please ensure the certificate file exists and is readable.",
		}
	case strings.Contains(err.Error(), "unable to read client-key"):
		return UserError{
			UserName: userName,
			Reason:   "Unable to read client key. Please ensure the key file exists and is readable.",
		}
	case strings.Contains(err.Error(), "unable to read certificate-authority"):
		return ClusterError{
			ClusterName: clusterName,
			Reason:      "Unable to read certificate authority. Please ensure the CA file exists and is readable.",
		}
	case strings.Contains(err.Error(), "unable to read token"):
		return UserError{
			UserName: userName,
			Reason:   "Unable to read token. Please ensure the token file exists and is readable.",
		}
	default:
		return ContextError{ContextName: contextName, Reason: fmt.Sprintf("Error loading config: %v", err)}
	}
}

// checkBase64Errors checks the base64 errors in the kubeconfig.
func checkBase64Errors(kubeconfig map[string]interface{}, contextName, clusterName, userName string) error {
	var errs []error

	// Check user data
	userDetails, _ := getUser(kubeconfig, userName)
	if userMap, ok := userDetails["user"].(map[interface{}]interface{}); ok {
		errs = append(errs, checkUserBase64Fields(userMap, userName)...)
	}

	// Check cluster data
	clusterDetails, _ := getCluster(kubeconfig, clusterName)
	if clusterMap, ok := clusterDetails["cluster"].(map[interface{}]interface{}); ok {
		errs = append(errs, checkClusterBase64Fields(clusterMap, clusterName)...)
	}

	if len(errs) > 0 {
		return Base64Error{ContextName: contextName, ClusterName: clusterName, UserName: userName, Errors: errs}
	}

	return nil
}

// checkUserBase64Fields checks the base64 errors in the user data.
func checkUserBase64Fields(userMap map[interface{}]interface{}, userName string) []error {
	var errs []error

	base64Fields := []string{"client-certificate-data", "client-key-data"}

	for _, field := range base64Fields {
		if value, ok := userMap[field].(string); ok {
			if _, err := base64.StdEncoding.DecodeString(value); err != nil {
				errs = append(errs, UserError{
					UserName: userName,
					Reason:   fmt.Sprintf("Invalid base64 encoding in %s. Please ensure it's correctly encoded.", field),
				})
			}
		}
	}

	return errs
}

// checkClusterBase64Fields checks the base64 errors in the cluster data.
func checkClusterBase64Fields(clusterMap map[interface{}]interface{}, clusterName string) []error {
	var errs []error

	if value, ok := clusterMap["certificate-authority-data"].(string); ok {
		if _, err := base64.StdEncoding.DecodeString(value); err != nil {
			errs = append(errs, ClusterError{
				ClusterName: clusterName,
				Reason:      "Invalid base64 encoding in certificate-authority-data. Please ensure it's correctly encoded.",
			})
		}
	}

	return errs
}

// toStringKeyMap converts the map with interface keys to a map with string keys.
func toStringKeyMap(m map[interface{}]interface{}) map[interface{}]interface{} {
	result := make(map[interface{}]interface{})

	for k, v := range m {
		switch key := k.(type) {
		case string:
			result[key] = v
		default:
			result[fmt.Sprintf("%v", k)] = v
		}
	}

	return result
}

// getCluster gets the cluster details from the kubeconfig.
func getCluster(kubeconfig map[string]interface{}, clusterName string) (map[interface{}]interface{}, error) {
	clusters := kubeconfig["clusters"].([]interface{})

	for _, cluster := range clusters {
		clusterMap, ok := cluster.(map[interface{}]interface{})
		if !ok {
			continue
		}

		if clusterMap["name"] == clusterName {
			return clusterMap, nil
		}
	}

	return nil, fmt.Errorf("cluster %s not found", clusterName)
}

// getUser gets the user details from the kubeconfig.
func getUser(kubeconfig map[string]interface{}, userName string) (map[interface{}]interface{}, error) {
	users, ok := kubeconfig["users"].([]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid or missing users in kubeconfig")
	}

	for _, user := range users {
		userMap, ok := user.(map[interface{}]interface{})
		if !ok {
			continue
		}

		if userMap["name"] == userName {
			return userMap, nil
		}
	}

	return nil, fmt.Errorf("user %s not found", userName)
}

// createKubeConfig creates a kubeconfig from the given context, cluster, and user.
func createKubeConfig(
	contextName string,
	context,
	cluster,
	user map[interface{}]interface{},
) map[string]interface{} {
	kubeconfig := make(map[string]interface{})
	kubeconfig["contexts"] = []interface{}{context}
	kubeconfig["clusters"] = []interface{}{cluster}
	kubeconfig["users"] = []interface{}{user}
	kubeconfig["apiVersion"] = "v1"
	kubeconfig["kind"] = "Config"
	kubeconfig["current-context"] = contextName

	return kubeconfig
}

// convertToContext converts the config to a context.
// contextName is the name of the context.
// clientConfig is the client config.
// source is the source of the kubeconfig, i.e where the kubeconfig came from.
// It can be KubeConfig, DynamicCluster, or InCluster.
// skipProxySetup is a flag to skip proxy setup.
func convertToContext(contextName string, clientConfig *api.Config, source int, skipProxySetup bool) (Context, error) {
	context, exists := clientConfig.Contexts[contextName]
	if !exists {
		return Context{}, ContextError{
			ContextName: contextName,
			Reason:      "context not found in loaded config",
		}
	}

	cluster, exists := clientConfig.Clusters[context.Cluster]
	if !exists {
		return Context{}, ClusterError{
			ClusterName: context.Cluster,
			Reason:      "cluster not found in loaded config",
		}
	}

	authInfo := clientConfig.AuthInfos[context.AuthInfo]

	// Make contextName DNS friendly.
	contextName = makeDNSFriendly(contextName)

	newContext := Context{
		Name:        contextName,
		KubeContext: context,
		Cluster:     cluster,
		AuthInfo:    authInfo,
		Source:      source,
	}

	if !skipProxySetup {
		err := newContext.SetupProxy()
		if err != nil {
			return Context{}, ContextError{ContextName: contextName, Reason: fmt.Sprintf("couldn't setup proxy: %v", err)}
		}
	}

	return newContext, nil
}

// LoadContextsFromAPIConfig loads contexts from the given api.Config.
func LoadContextsFromAPIConfig(config *api.Config, skipProxySetup bool) ([]Context, []error) {
	contexts := []Context{}
	errors := []error{}

	for contextName, context := range config.Contexts {
		cluster := config.Clusters[context.Cluster]
		if cluster == nil {
			errors = append(errors, fmt.Errorf("cluster not found for context: %q", contextName))
			continue
		}

		// Note: nil authInfo is valid as authInfo can be provided by token.
		authInfo := config.AuthInfos[context.AuthInfo]

		// Make contextName DNS friendly.
		contextName = makeDNSFriendly(contextName)

		context := Context{
			Name:        contextName,
			KubeContext: context,
			Cluster:     cluster,
			AuthInfo:    authInfo,
		}

		if !skipProxySetup {
			err := context.SetupProxy()
			if err != nil {
				errors = append(errors, fmt.Errorf("couldnt setup proxy for context: %q, err:%q", contextName, err))
				continue
			}
		}

		contexts = append(contexts, context)
	}

	return contexts, errors
}

// splitKubeConfigPath splits the kubeconfig path by the delimiter.
func splitKubeConfigPath(path string) []string {
	delimiter := ":"
	if runtime.GOOS == "windows" {
		delimiter = ";"
	}

	return strings.Split(path, delimiter)
}

// GetInClusterContext returns the in-cluster context.
func GetInClusterContext(oidcIssuerURL string,
	oidcClientID string, oidcClientSecret string,
	oidcScopes string,
) (*Context, error) {
	clusterConfig, err := rest.InClusterConfig()
	if err != nil {
		return nil, err
	}

	cluster := &api.Cluster{
		Server:                   clusterConfig.Host,
		CertificateAuthority:     clusterConfig.CAFile,
		CertificateAuthorityData: clusterConfig.CAData,
	}

	inClusterContext := &api.Context{
		Cluster:  InClusterContextName,
		AuthInfo: InClusterContextName,
	}

	inClusterAuthInfo := &api.AuthInfo{}

	var oidcConf *OidcConfig

	if oidcClientID != "" && oidcClientSecret != "" && oidcIssuerURL != "" && oidcScopes != "" {
		oidcConf = &OidcConfig{
			ClientID:     oidcClientID,
			ClientSecret: oidcClientSecret,
			IdpIssuerURL: oidcIssuerURL,
			Scopes:       strings.Split(oidcScopes, ","),
		}
	}

	return &Context{
		Name:        InClusterContextName,
		KubeContext: inClusterContext,
		Cluster:     cluster,
		AuthInfo:    inClusterAuthInfo,
		OidcConf:    oidcConf,
	}, nil
}

// Func type for context filter, if the func return true,
// the context will be skipped otherwise the context will be used.
type shouldBeSkippedFunc = func(kubeContext Context) bool

// AllowAllKubeContext will keep all contexts.
func AllowAllKubeContext(_ Context) bool {
	return false
}

// SkipKubeContextInCommaSeparatedString will skip the contexts
// whose names are in the given comma-separated string.
// For example, if pass the "a,b" for blackKubeContextNameStr,
// the contexts named "a" and "b" will be skipped.
func SkipKubeContextInCommaSeparatedString(blackKubeContextNameStr string) shouldBeSkippedFunc {
	blackKubeContextNameList := strings.Split(blackKubeContextNameStr, ",")
	blackKubeContextNameMap := map[string]bool{}

	for _, blackKubeContextName := range blackKubeContextNameList {
		blackKubeContextNameMap[blackKubeContextName] = true
	}

	return func(kubeContext Context) bool {
		return blackKubeContextNameMap[kubeContext.Name]
	}
}

// LoadAndStoreKubeConfigs loads contexts from the given kubeconfig files and
// stores them in the given context store.
// It stores the valid contexts and returns the errors if any.
// Note: No need to remove contexts from the store, since
// adding a context with the same name will overwrite the old one.
func LoadAndStoreKubeConfigs(kubeConfigStore ContextStore, kubeConfigs string, source int,
	ignoreFunc shouldBeSkippedFunc,
) error {
	var errs []error //nolint:prealloc

	kubeConfigContexts, contextErrors, err := LoadContextsFromMultipleFiles(kubeConfigs, source)
	if err != nil {
		return fmt.Errorf("error loading kubeconfig files: %v", err)
	}

	// if pass the shouldBeSkippedFunc=nil, it works like before
	_ignoreFunc := ignoreFunc
	if _ignoreFunc == nil {
		_ignoreFunc = AllowAllKubeContext
	}

	for _, kubeConfigContext := range kubeConfigContexts {
		if _ignoreFunc(kubeConfigContext) {
			continue
		}

		kubeConfigContext := kubeConfigContext

		err := kubeConfigStore.AddContext(&kubeConfigContext)
		if err != nil {
			errs = append(errs, err)
		}
	}

	for _, contextError := range contextErrors {
		errs = append(errs, fmt.Errorf("error in context %s: %v", contextError.ContextName, contextError.Error))
	}

	return errors.Join(errs...)
}

// makeDNSFriendly converts a string to a DNS-friendly format.
func makeDNSFriendly(name string) string {
	name = strings.ReplaceAll(name, "/", "--")
	name = strings.ReplaceAll(name, " ", "__")

	return name
}
