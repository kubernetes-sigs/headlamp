# Testing Guide: Exec Authentication Improvements

This guide provides comprehensive testing steps for the exec authentication improvements that address the "bad gateway while accessing AKS cluster" issue.

## Overview

The improvements include:
1. **Structured error handling** with detailed error messages
2. **Retry logic** for recoverable authentication failures  
3. **Platform-specific guidance** for common authentication tools
4. **Fallback behavior** when authentication setup fails
5. **Better HTTP status codes** and error propagation

## Prerequisites

- Go 1.19+ installed
- Access to a Kubernetes cluster with exec-based authentication
- One of the following authentication tools configured:
  - `kubelogin` (Azure AKS)
  - `oci` (Oracle Cloud Infrastructure)
  - `gke-gcloud-auth-plugin` (Google GKE)
  - `aws-iam-authenticator` (Amazon EKS)

## Local Testing

### 1. Lint Checks

```bash
# Run golangci-lint to verify code quality
cd backend
golangci-lint run --timeout 3m

# Or use make if available
make backend-lint
```

### 2. Unit Tests

```bash
# Run backend tests
cd backend
go test ./pkg/exec/... -v
go test ./pkg/kubeconfig/... -v

# Run all backend tests
go test ./... -v
```

### 3. Build and Run

```bash
# Build the backend
cd backend
go build -o headlamp ./cmd/headlamp.go

# Run with your kubeconfig
./headlamp -kubeconfig=/path/to/your/kubeconfig
```

## Integration Testing Scenarios

### Scenario 1: Missing Authentication Tool

**Setup:**
1. Configure a kubeconfig with exec authentication pointing to a non-existent command
2. Try to access the cluster through Headlamp

**Expected Behavior:**
- ✅ Detailed error message with installation guidance
- ✅ HTTP 502 Bad Gateway status (not generic 500)
- ✅ Specific instructions for the missing tool
- ✅ Fallback to basic proxy (no complete failure)

**Test Commands:**
```bash
# Create test kubeconfig with invalid exec command
kubectl config set-credentials test-user \
  --exec-command=nonexistent-tool \
  --exec-api-version=client.authentication.k8s.io/v1beta1

# Access Headlamp and observe error messages in browser dev tools
```

### Scenario 2: Azure AKS with kubelogin

**Setup:**
1. Configure AKS cluster with kubelogin authentication
2. Ensure kubelogin is NOT in PATH initially

**Expected Behavior:**
- ✅ Clear error message about missing kubelogin
- ✅ Installation instructions for Azure CLI and kubelogin
- ✅ Guidance on using `az login` and `kubelogin convert-kubeconfig`

**Test Commands:**
```bash
# Remove kubelogin from PATH temporarily
export PATH=$(echo $PATH | sed 's|:/path/to/kubelogin||g')

# Try to access AKS cluster
# Install kubelogin and verify retry works
```

### Scenario 3: Intermittent Network Issues

**Setup:**
1. Configure exec authentication with a working tool
2. Simulate network issues during authentication

**Expected Behavior:**
- ✅ Retry logic activates (up to 3 attempts)
- ✅ Exponential backoff between retries (1s, 2s, 4s)
- ✅ Debug logging shows retry attempts
- ✅ Success after network recovers

**Test Commands:**
```bash
# Monitor logs for retry behavior
tail -f /var/log/headlamp.log | grep -i retry

# Simulate network issues using iptables or similar
```

### Scenario 4: Authentication Tool Exit Codes

**Setup:**
1. Configure exec authentication
2. Test different exit codes from the authentication tool

**Expected Behavior:**
- ✅ Exit code 1: No retry (permanent failure)
- ✅ Exit code 2+: Retry attempts
- ✅ Stderr output included in error messages
- ✅ Appropriate recoverability flags set

### Scenario 5: Successful Authentication

**Setup:**
1. Configure working exec authentication
2. Access cluster resources through Headlamp

**Expected Behavior:**
- ✅ Successful proxy setup
- ✅ No error messages in logs
- ✅ Cluster resources load correctly
- ✅ Authentication tokens cached appropriately

## Error Message Validation

### Expected Error Format

For missing authentication tools:
```
Authentication failed: exec: executable kubelogin not found

For Azure AKS clusters:
  - Install kubelogin: https://azure.github.io/kubelogin/install.html
  - Alternative: kubelogin convert-kubeconfig -l azurecli
  - Ensure you're logged in: az login
```

For exit code failures:
```
Authentication failed: exec: executable kubelogin failed with exit code 1
Stderr: [actual error output from tool]
```

### HTTP Status Codes

- ✅ **502 Bad Gateway**: Authentication failures
- ✅ **500 Internal Server Error**: Other server errors
- ✅ **200 OK**: Successful requests

## Performance Testing

### Metrics to Monitor

1. **Proxy Setup Time**: Should complete within 5 seconds
2. **Retry Delays**: Should follow exponential backoff (1s, 2s, 4s)
3. **Memory Usage**: No memory leaks from failed authentications
4. **Log Volume**: Reasonable logging without spam

### Load Testing

```bash
# Test multiple concurrent authentication attempts
for i in {1..10}; do
  curl -H "Authorization: Bearer test" \
    http://localhost:4466/api/v1/namespaces &
done
wait
```

## Debugging Tips

### Enable Debug Logging

```bash
# Run with verbose logging
./headlamp -kubeconfig=/path/to/kubeconfig -log-level=debug

# Or set environment variable
export HEADLAMP_LOG_LEVEL=debug
```

### Check Authentication Tool Directly

```bash
# Test authentication tool manually
kubelogin get-token --login azurecli --server-id <server-id>

# Verify kubeconfig exec section
kubectl config view --raw | grep -A 10 exec
```

### Monitor Network Traffic

```bash
# Monitor HTTP requests to cluster
tcpdump -i any -A 'port 443 and host your-cluster.com'

# Check proxy behavior
curl -v -H "Authorization: Bearer test" \
  http://localhost:4466/api/v1/namespaces
```

## Regression Testing

Ensure these scenarios still work after changes:

1. ✅ **Standard kubeconfig**: Token-based authentication
2. ✅ **Certificate authentication**: Client cert/key pairs  
3. ✅ **OIDC authentication**: OpenID Connect flows
4. ✅ **In-cluster authentication**: Service account tokens
5. ✅ **Multiple contexts**: Switching between different clusters

## Success Criteria

- [ ] All lint checks pass
- [ ] Unit tests pass with >90% coverage
- [ ] Integration tests pass for all cloud providers
- [ ] Error messages are helpful and actionable
- [ ] Retry logic works for recoverable errors
- [ ] Fallback behavior prevents complete failures
- [ ] Performance meets baseline requirements
- [ ] No regressions in existing functionality

## Reporting Issues

When reporting issues, please include:

1. **Headlamp version** and commit hash
2. **Authentication tool** and version
3. **Kubeconfig** (sanitized, no secrets)
4. **Error messages** from browser dev tools
5. **Server logs** with debug level enabled
6. **Steps to reproduce** the issue

This comprehensive testing ensures the exec authentication improvements work reliably across different environments and edge cases.
