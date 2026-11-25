# Backstage Integration Testing Guide

This guide provides a simplified way to test the core features of the Headlamp-Backstage integration without setting up a complete Backstage environment with OIDC authentication and managed Kubernetes from a cloud provider.

## Prerequisites

- Go development environment
- Python 3 or Node.js
- Valid Kubernetes configuration file (without OIDC/exec-based authentication)

## Testing Steps

### 1. Build the Headlamp Embedded Binary

From the project root directory, run:

```bash
make backend-embed
```

### 2. Run the Headlamp Server

Execute the binary with the required parameters, including the trusted origin of the Backstage host (`--backstage-origin` or `HEADLAMP_CONFIG_BACKSTAGE_ORIGIN`). By default no origin is trusted and `HEADLAMP_READY` / `postMessage` token and kubeconfig messages are rejected:

```bash
./backend/headlamp-server --base-url="/api/headlamp" --enable-dynamic-clusters --backstage-origin="http://localhost:8000"
```

You can also pass a comma-separated list of origins (for example `https://backstage.example.com,https://other-backstage.example.com`), or configure `REACT_APP_BACKSTAGE_ORIGIN` when building the frontend.

### 3. Serve the Frontend

Start a local web server to serve the `index.html` file. You can use either:

**Option A: Python HTTP Server**
```bash
python3 -m http.server -p 8000
```

**Option B: Node.js HTTP Server**
```bash
npx http-server -p 8000
```

### 4. Access the Application

Open your web browser and navigate to:
```
http://localhost:8000
```

## Testing the Integration

### Test 1: Backstage Token Authentication

1. Enter any random text in the Backstage authentication token field
2. Click "Share Backstage Token"
3. **Verification**: Check if the requests made include the `x-backstage-token` header

### Test 2: Kubernetes Configuration

1. Base64 encode a valid kubeconfig file (ensure it doesn't use OIDC/exec-based authentication)
2. Click "Share Kubeconfig"
3. **Verification**: A new cluster should appear in the interface

## Troubleshooting

- Ensure the Headlamp server is running before accessing the test frontend
- Check that your kubeconfig is valid and doesn't contain OIDC or exec-based authentication
- Verify that the `--enable-dynamic-clusters` flag is set when starting the server