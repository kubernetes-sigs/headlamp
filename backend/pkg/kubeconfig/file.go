package kubeconfig

import (
	"os"
	"path/filepath"
	"time"

	"github.com/pkg/errors"
	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
)

// WriteToFile writes the given config to the kubeconfig file.
func WriteToFile(config clientcmdapi.Config, path string) error {
	configFile := filepath.Join(path, "config")
	now := time.Now().Format("20060102150405")
	// check if config file exists
	if _, err := os.Stat(configFile); err == nil {
		// if it exists, write a new config file with a timestamp
		fileName := "config_" + now + ".yaml"
		newKubeConfigFile := filepath.Join(path, fileName)

		err = clientcmd.WriteToFile(config, newKubeConfigFile)
		if err != nil {
			return errors.Wrap(err, "failed to write new kubeconfig file")
		}

		defer os.Remove(newKubeConfigFile)

		load := clientcmd.ClientConfigLoadingRules{
			Precedence: []string{configFile, newKubeConfigFile},
		}

		mergedConfig, err := load.Load()
		if err != nil {
			return errors.Wrap(err, "failed to load merged kubeconfig")
		}

		config = *mergedConfig
	}

	return clientcmd.WriteToFile(config, configFile)
}

// RemoveContextFromFile removes the given context and its related
// cluster and user from the kubeconfig file.
func RemoveContextFromFile(context string, path string) error {
	config, err := clientcmd.LoadFromFile(path)
	if err != nil {
		return errors.Wrap(err, "failed to load kubeconfig file")
	}

	// remove the context from the config
	contextConfig, ok := config.Contexts[context]
	if !ok {
		return errors.New("context not found in kubeconfig")
	}

	clusterToRemove := contextConfig.Cluster

	userToRemove := contextConfig.AuthInfo

	delete(config.Contexts, context)

	// check if cluster is used in other contexts
	clusterUsed := false

	for _, contextConfig := range config.Contexts {
		if contextConfig.Cluster == clusterToRemove {
			clusterUsed = true
			break
		}
	}

	// remove the cluster from the config
	if !clusterUsed {
		delete(config.Clusters, clusterToRemove)
	}

	// check if user is used in other contexts
	userUsed := false

	for _, contextConfig := range config.Contexts {
		if contextConfig.AuthInfo == userToRemove {
			userUsed = true
			break
		}
	}

	// remove the user from the config
	if !userUsed {
		delete(config.AuthInfos, userToRemove)
	}

	return clientcmd.WriteToFile(*config, path)
}
