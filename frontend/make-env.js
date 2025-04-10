'use strict';
// Creates the .env file
import { execSync } from 'child_process';
import fs from 'fs';
const appInfo = JSON.parse(fs.readFileSync('../app/package.json', 'utf8'));

const gitVersion = execSync('git rev-parse HEAD').toString().trim();

const envContents = {
  REACT_APP_HEADLAMP_VERSION: appInfo.version,
  REACT_APP_HEADLAMP_GIT_VERSION: gitVersion,
  REACT_APP_HEADLAMP_PRODUCT_NAME: appInfo.productName,
  REACT_APP_ENABLE_REACT_QUERY_DEVTOOLS: 'false'
};

function createEnvText() {
  let text = '';
  Object.entries(envContents).forEach(([key, value]) => {
    text += `${key}=${value}\n`;
  });

  return text;
}

const fileName = process.argv[2] || '.env';

fs.writeFileSync(fileName, createEnvText());
