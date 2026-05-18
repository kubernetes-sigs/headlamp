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
// excluding known public or health-check endpoints.
func IsAuthBypassURL(urlPath string) bool {
	return !strings.Contains(urlPath, "/version") &&
		!strings.Contains(urlPath, "/healthz") &&
		!strings.Contains(urlPath, "/selfsubjectrulesreviews") &&
		!strings.Contains(urlPath, "/selfsubjectaccessreviews")
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
