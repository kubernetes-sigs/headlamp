package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"

	"github.com/kubernetes-sigs/headlamp/backend/cmd/plugin"
	"github.com/kubernetes-sigs/headlamp/backend/cmd/server"
)

var ConfigFile string

type Options struct {
	// global option
	Kubeconfig string `json:"kubeconfig" yaml:"kubeconfig"`
}

// NewRootCmd represents the base command when called without any subcommands
func NewRootCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "headlamp",
		Short: "headlamp command line",
		Long:  `Headlamp is a web-based Kubernetes dashboard.`,

		Run: func(cmd *cobra.Command, args []string) {
			if err := cmd.Help(); err != nil {
				fmt.Fprintf(os.Stderr, "Failed to display help: %s\n", err)
			}
		},
	}

	registerSubCommands(cmd)
	return cmd
}

// Execute adds all child commands to the root command and sets flags appropriately.
// This is called by main.main(). It only needs to happen once to the RootCmd.
func Execute() {
	cobra.OnInitialize(
		func() { initConfig(ConfigFile) },
	)

	rootCmd := NewRootCmd()

	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}

// initConfig reads in config file and ENV variables if set.
func initConfig(configFile string) {
	if configFile != "" {
		// Use config file from the flag.
		viper.SetConfigFile(configFile)
	} else {
		// Find home directory.
		home, err := os.UserHomeDir()
		cobra.CheckErr(err)

		// Search config in home directory with name ".fxops-cmd" (without extension).
		viper.AddConfigPath(home)
		viper.SetConfigType("yaml")
		viper.SetConfigName(".headlamp")

		// read in environment variables that match
		// viper.SetEnvPrefix("HEADLAMP_CONFIG")
		viper.AutomaticEnv()
	}

	// read in environment variables that match
	viper.AutomaticEnv()

	// If a config file is found, read it in.
	if err := viper.ReadInConfig(); err != nil {
		fmt.Fprintf(os.Stderr, "No config file used: %s \n", err)
		return
	}

	fmt.Fprintln(os.Stderr, "Using config file:", viper.ConfigFileUsed())
}

func registerSubCommands(cmd *cobra.Command) {
	cmd.AddCommand(
		server.NewServerCmd(),
		plugin.NewPluginCmd(),
	)
}
