#! /usr/bin/env node

const fs = require('fs');
const YAML = require('yaml');

const file = fs.readFileSync('.eslintrc.yml', 'utf8');
const rules = YAML.parse(file);

console.log('module.exports = %s;', JSON.stringify(rules, null, '  '));
