import fs from 'fs';
import path from 'path';
import sharedConfig from './i18nextSharedConfig.mjs';

const directoryPath = path.join(import.meta.dirname, sharedConfig.localesPath);
const currentLocales = [];

fs.readdirSync(directoryPath).forEach(file => currentLocales.push(file));

export default {
  lexers: {
    default: ['JsxLexer'],
  },
  namespaceSeparator: '|',
  keySeparator: false,
  output: path.join(directoryPath, './$LOCALE/$NAMESPACE.json'),
  locales: currentLocales,
  contextSeparator: sharedConfig.contextSeparator,
  defaultValue: (locale, _namespace, key) => {
    // The English catalog has "SomeKey": "SomeKey" so we stop warnings about
    // missing values.
    if (locale === 'en') {
      const contextSepIdx = key.indexOf(sharedConfig.contextSeparator);
      if (contextSepIdx >= 0) {
        return key.substring(0, contextSepIdx);
      }
      return key;
    }
    return '';
  },
};
