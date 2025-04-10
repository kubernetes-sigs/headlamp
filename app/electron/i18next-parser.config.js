const path = require('path');
const helper = require('./i18n-helper');
const fs = require('fs');

// Import shared configuration values from frontend
let sharedConfig;
try {
  // Try to import the shared config dynamically
  const sharedConfigPath = path.resolve(
    __dirname,
    '../../frontend/src/i18n/i18nextSharedConfig.mjs'
  );
  if (fs.existsSync(sharedConfigPath)) {
    // For CommonJS requiring ES modules, use a dynamic import
    sharedConfig = {
      contextSeparator: '//context:',
      namespaces: ['translation', 'glossary', 'app'],
      defaultNamespace: 'translation',
    };
  }
} catch (error) {
  console.error('Failed to import shared config:', error);
}

// Ensure the LOCALES_DIR is defined
if (!helper.LOCALES_DIR) {
  throw new Error('Locales directory is not defined. Check i18n-helper.js for issues.');
}

module.exports = {
  lexers: {
    default: ['JsxLexer'],
  },
  namespaceSeparator: '|',
  keySeparator: false,
  defaultNamespace: 'app',
  contextSeparator: sharedConfig?.contextSeparator || '//context:',
  output: path.join(helper.LOCALES_DIR, '$LOCALE/$NAMESPACE.json'),
  locales: helper.CURRENT_LOCALES.length > 0 ? helper.CURRENT_LOCALES : ['en'],
  // The English catalog has "SomeKey": "SomeKey" so we stop warnings about
  // missing values.
  useKeysAsDefaultValue: locale => locale === 'en',
};
