# Lint Config

This is a shareable ESLint/Prettier/TS config we use inside Headlamp for
our Javascript/Typescript projects.

## Installation

Install the config from NPM by using the following command:

`npm install --save-dev @headlamp-k8s/eslint-config`

Install also the peer dependencies NPM suggested (if they're not installed
automatically).

You can include it in your `package.json` file like the following:

```js
  "eslintConfig": {
    "extends": ["@headlamp-k8s", "prettier", "prettier/react"]
  },
  "prettier": "@headlamp-k8s/eslint-config/prettier-config",
```

## Development

Eslint rules should be modified in the `.eslintrc.yml` file in this repo.

### Generate index.js

The `index.js` file is generated from `.eslintrc.yml`, and can be generated using:

`make`

## License

lint-config is licensed under Apache 2.0.
