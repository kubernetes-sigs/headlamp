package plugin

import (
	"github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/plugins"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/utils"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

func NewPluginCmd() *cobra.Command {
	o := NewOptions(config.Config{})
	cmd := &cobra.Command{
		Use:   "plugins",
		Short: "list plugins",
		Long:  "list all available plugins",
		Run: func(cmd *cobra.Command, args []string) {
			if err := o.complete(); err != nil {
				logger.Log(logger.LevelError, nil, err, "Failed to complete options")
				return
			}
			if err := o.runListPlugins(); err != nil {
				logger.Log(logger.LevelError, nil, err, "Failed to list plugins")
				return
			}
		},
	}
	cmd.Flags().StringVar(&o.StaticDir, "html-static-dir", "", "Static HTML directory to serve")
	cmd.Flags().StringVar(&o.PluginsDir, "plugins-dir", "", "Specify the plugins directory to build the backend with")

	if err := utils.NewErrorAggerator().Append(
		viper.BindPFlag("html-static-dir", cmd.Flags().Lookup("html-static-dir")),
		viper.BindPFlag("plugins-dir", cmd.Flags().Lookup("plugins-dir")),

		viper.BindEnv("html-static-dir", "HEADLAMP_CONFIG_HTML_STATIC_DIR"),
		viper.BindEnv("plugins-dir", "HEADLAMP_CONFIG_PLUGINS_DIR"),
	).Aggregate(); err != nil {
		logger.Log(logger.LevelError, nil, err, "Failed to bind flags and environment variables")
		return nil
	}

	return cmd
}

type Options struct {
	config.Config
}

func NewOptions(conf config.Config) *Options {
	return &Options{
		Config: conf,
	}
}

func (o *Options) complete() error {
	// Use viper to get the final effective configuration
	o.StaticDir = viper.GetString("html-static-dir")
	o.PluginsDir = viper.GetString("plugins-dir")

	return nil
}

func (o *Options) runListPlugins() error {
	return plugins.ListPlugins(o.StaticDir, o.PluginsDir)
}
