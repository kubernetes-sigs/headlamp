const webpack = require('webpack');
const path = require('path');

module.exports = {
  stories: [
    '../../../../../src/**/*.stories.mdx',
    '../../../../../src/**/*.stories.@(js|jsx|ts|tsx)',
  ],
  addons: [
    '@storybook/addon-links',
    '@storybook/addon-webpack5-compiler-swc',
    '@storybook/addon-docs',
  ],
  core: {
    disableTelemetry: true,
  },
  framework: {
    name: '@storybook/react-webpack5',
    options: {},
  },

  webpackFinal: async config => {
    // Support vite style environment variables in components
    config.plugins?.push(
      new webpack.DefinePlugin({
        'import.meta.env': JSON.stringify({
          NODE_ENV: process.env.NODE_ENV,
          UNDER_TEST: process.env.UNDER_TEST,
          DEV: process.env.DEV,
          STORYBOOK: process.env.STORYBOOK,
          FLATPAK_ID: process.env.FLATPAK_ID,
          REACT_APP_HEADLAMP_ENABLE_ROW_SELECTION:
            process.env.REACT_APP_HEADLAMP_ENABLE_ROW_SELECTION,
          REACT_APP_MULTI_HOME_ENABLED: process.env.REACT_APP_MULTI_HOME_ENABLED,
          REACT_APP_ENABLE_RECENT_CLUSTERS: process.env.REACT_APP_ENABLE_RECENT_CLUSTERS,
          REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER:
            process.env.REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER,
          REACT_APP_ENABLE_REACT_QUERY_DEVTOOLS: process.env.REACT_APP_ENABLE_REACT_QUERY_DEVTOOLS,
          REACT_APP_DEBUG_VERBOSE: process.env.REACT_APP_DEBUG_VERBOSE,
          REACT_APP_HEADLAMP_BACKEND_TOKEN: process.env.REACT_APP_HEADLAMP_BACKEND_TOKEN,
          PUBLIC_URL: process.env.PUBLIC_URL,
          REACT_APP_HEADLAMP_VERSION: process.env.REACT_APP_HEADLAMP_VERSION,
          REACT_APP_HEADLAMP_GIT_VERSION: process.env.REACT_APP_HEADLAMP_GIT_VERSION,
          REACT_APP_HEADLAMP_PRODUCT_NAME: process.env.REACT_APP_HEADLAMP_PRODUCT_NAME,
        }),
      })
    );

    // Add a fallback loader for external .tsx files, so preview.tsx can import
    config.module.rules.push({
      test: /\.tsx?$/,
      include: path.resolve(
        __dirname,
        '../../../../../node_modules/@kinvolk/headlamp-plugin/config'
      ),
      use: {
        loader: require.resolve('ts-loader'),
        options: {
          transpileOnly: true,
        },
      },
    });

    // Polyfill for apidevtools feature used in docs
    config.resolve.fallback = {
      ...config.resolve.fallback,
      path: require.resolve('path-browserify'),
      process: require.resolve('process/browser'),
    };

    config.plugins.push(
      new webpack.ProvidePlugin({
        process: 'process/browser',
      })
    );

    return config;
  },
};
