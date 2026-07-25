package k8cache

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

// Details provides information about a specific resource kind.
type Details struct {
	Kind string `json:"kind"` // The resource Kind ie, Pods, Nodes etc.
}

// Metadata holds core data about a resource, such as its version.
type Metadata struct {
	ResourceVersion string `json:"resourceVersion"`
}

// AuthErrResponse is the Unauthorized Error message that can be used
// for sending 403 or Unauthorized error when the user is not allowed
// to access resources.
type AuthErrResponse struct {
	Kind       string   `json:"kind"`       // The Kubernetes resource kind.
	APIVersion string   `json:"apiVersion"` // APIVersion is version for the resource.
	MetaData   Metadata `json:"metadata"`   // Metadata for the resource.
	Message    string   `json:"message"`    // A human-readable error message.
	Reason     string   `json:"reason"`     // Reason for the error.
	Details    Details  `json:"details"`    // Details about the resource kind.
	Code       int      `json:"code"`       // The HTTP status code, typically 403.
}

// IsAuthBypassURL returns true if the given URL path should be checked for authorization errors,
// excluding known public, health-check, or self-subject review endpoints.
func IsAuthBypassURL(urlPath string) bool {
	urlPath = strings.TrimRight(urlPath, "/")

	if isDirectOrProxiedEndpoint(urlPath, "version") ||
		isDirectOrProxiedEndpoint(urlPath, "healthz") ||
		IsSelfSubjectReviewAPIPath(urlPath) {
		return false
	}

	return true
}

// IsSelfSubjectReviewAPIPath returns true when path targets a self-subject review API endpoint
// under /apis/authorization.k8s.io/{version} (either directly, or proxied via
// /clusters/{name}/...). The version segment is intentionally not enumerated so
// future authorization API versions keep the same cache-bypass behavior.
func IsSelfSubjectReviewAPIPath(urlPath string) bool {
	urlPath = strings.TrimRight(urlPath, "/")

	return isDirectOrProxiedAPIResourceEndpoint(urlPath, "authorization.k8s.io", "selfsubjectaccessreviews") ||
		isDirectOrProxiedAPIResourceEndpoint(urlPath, "authorization.k8s.io", "selfsubjectrulesreviews")
}

func isDirectOrProxiedEndpoint(urlPath, endpoint string) bool {
	parts := strings.Split(urlPath, "/")

	return len(parts) == 2 && parts[1] == endpoint ||
		len(parts) == 4 && parts[1] == "clusters" && parts[3] == endpoint
}

func isDirectOrProxiedAPIResourceEndpoint(urlPath, group, resource string) bool {
	parts := strings.Split(urlPath, "/")

	return len(parts) == 5 && parts[1] == "apis" && parts[2] == group && parts[3] != "" && parts[4] == resource ||
		len(parts) == 7 && parts[1] == "clusters" && parts[3] == "apis" && parts[4] == group &&
			parts[5] != "" && parts[6] == resource
}

// ReturnAuthErrorResponse return the AuthErrorResponse if the user is not Authorized
// this will returns directly without asking to K8's Server.
func ReturnAuthErrorResponse(w http.ResponseWriter, r *http.Request, contextKey string) error {
	last, kubeVerb := GetKindAndVerb(r)

	// AuthErrorResponse will be the actual message which will be
	// further transformed into JSON body for sending to the client.
	authErrorResponse := AuthErrResponse{
		Kind:       "Status",
		APIVersion: "v1",
		MetaData:   Metadata{}, // In this case the Metadata will always be empty.
		Message: fmt.Sprintf("%s is forbidden: User \"system:serviceaccount:default:%s\" cannot ", last, contextKey) +
			fmt.Sprintf("%s resource \"%s\" in API group \"\" at the cluster scope", kubeVerb, last),
		Reason: "Forbidden", // For this scenerio the reason should be forbidden.
		Details: Details{
			Kind: last,
		},
		Code: 403, // 403 is StatusCode for Forbidden user.
	}

	response, err := json.Marshal(authErrorResponse)
	if err != nil {
		return err
	}

	err = WriteResponseToClient(response, w) // returning the error message to client.
	if err != nil {
		return err
	}

	return nil
}

// WriteResponseToClient returns UnAuthorized error response when the user Unauthorized
// This helps to prevent requests to make actual call to clusterAPI.
func WriteResponseToClient(response []byte, w http.ResponseWriter) error {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-HEADLAMP-CACHE", "true") // For debugging and testing purpose.
	w.WriteHeader(http.StatusForbidden)

	_, err := w.Write(response)

	return err
}
