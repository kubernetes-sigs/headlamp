# Environment Variables in Plugins

Headlamp plugins can access environment variables through the `Headlamp.getEnv()` method. This provides a safe way for plugins to access environment variables without requiring direct access to the `process` object.

## Available Environment Variables

For security reasons, only environment variables with the `REACT_APP_` prefix are exposed to plugins. This follows the standard React convention for environment variables.

## Usage

### Accessing Environment Variables

```tsx
import { Headlamp } from '@kinvolk/headlamp-plugin/lib';

function MyComponent() {
  // Get all available environment variables
  const env = Headlamp.getEnv();
  
  // Access specific environment variables
  const version = env.REACT_APP_HEADLAMP_VERSION || 'unknown';
  const productName = env.REACT_APP_HEADLAMP_PRODUCT_NAME || 'Headlamp';
  
  return (
    <div>
      <p>Product: {productName}</p>
      <p>Version: {version}</p>
    </div>
  );
}
```

### Available Default Variables

Headlamp provides several built-in environment variables that can be accessed by plugins:

| Variable | Description |
|----------|-------------|
| `REACT_APP_HEADLAMP_VERSION` | The version of Headlamp |
| `REACT_APP_HEADLAMP_GIT_VERSION` | The Git commit hash of the Headlamp build |
| `REACT_APP_HEADLAMP_PRODUCT_NAME` | The name of the product (usually "Headlamp") |

## Custom Environment Variables

You can define your own environment variables for plugins to use. Make sure they have the `REACT_APP_` prefix to be accessible to plugins.

### In Development

Create a `.env` file in the frontend directory:

```
REACT_APP_MY_CUSTOM_VARIABLE=my-value
```

### In Production

Set the environment variables when running Headlamp:

```bash
REACT_APP_MY_CUSTOM_VARIABLE=my-value headlamp
```

## Security Considerations

- Only environment variables with the `REACT_APP_` prefix are exposed to plugins
- Sensitive information should not be stored in environment variables accessible to plugins
- Environment variables are exposed to all plugins, so they should not contain plugin-specific secrets