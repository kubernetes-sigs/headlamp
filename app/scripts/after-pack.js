'use strict';

const fs = require('node:fs');
const path = require('node:path');

exports.default = async context => {
  if (fs.existsSync('.env')) {
    console.info('Copying .env file to app resources directory!');
    try {
      fs.copyFileSync('.env', path.join(context.appOutDir, 'resources', '.env'));
    } catch (err) {
      console.error('Failed to copy .env after pack:', err);
    }
  }
};
