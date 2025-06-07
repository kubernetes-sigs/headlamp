const { PluginManager, validateArchiveURL } = require('./src/plugin-management');
const MultiPluginManager = require('./src/multi-plugin-management');

module.exports = {
  PluginManager,
  MultiPluginManager,
  validateArchiveURL,
}; 