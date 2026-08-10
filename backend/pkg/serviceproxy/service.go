package serviceproxy

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

const (
	HTTPSchemeName  = "http"
	HTTPSSchemeName = "https"
)

type proxyService struct {
	IsExternal bool   `yaml:"is_external"`
	Port       int32  `yaml:"port"`
	Name       string `yaml:"name"`
	Namespace  string `yaml:"namespace"`
	Scheme     string `yaml:"scheme"`
	URIPrefix  string `yaml:"URIPrefix"`
}

// GetService returns the requested service based on the provided name and namespace.
// It keeps the historical default of selecting a port named "http" or "https".
func GetService(ctx context.Context, cs kubernetes.Interface, namespace string, name string) (*proxyService, error) {
	return GetServiceWithPort(ctx, cs, namespace, name, "")
}

// GetServiceWithPort returns the requested service and resolves the Service port.
// When portSelector is empty, behavior matches GetService (http/https named ports).
// Otherwise portSelector may be a Service port name or port number that exists on the Service.
func GetServiceWithPort(
	ctx context.Context,
	cs kubernetes.Interface,
	namespace string,
	name string,
	portSelector string,
) (*proxyService, error) {
	service, err := cs.CoreV1().Services(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}

	ps := &proxyService{
		Name:       service.Name,
		Namespace:  service.Namespace,
		IsExternal: len(service.Spec.ExternalName) > 0,
	}

	port, err := ResolvePort(service.Spec.Ports, portSelector)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "service port not found")

		return nil, err
	}

	ps.Port = port.Port
	ps.Scheme = schemeForPort(port)
	ps.URIPrefix = getServiceURLPrefix(ps, service)

	return ps, nil
}

// GetPort - return the first port named "http" or "https".
// Prefer "https" over "http" if both exist.
func GetPort(ports []corev1.ServicePort) (*corev1.ServicePort, error) {
	for i, port := range ports {
		if port.Name == HTTPSSchemeName {
			return &ports[i], nil
		}
	}

	for i, port := range ports {
		if port.Name == HTTPSchemeName {
			return &ports[i], nil
		}
	}

	return nil, fmt.Errorf("no port found with the name http or https")
}

// ResolvePort selects a Service port.
// An empty portSelector preserves GetPort behavior.
// A non-empty selector matches a port by name, or by port number when the selector is numeric.
// Only ports declared on the Service are accepted.
func ResolvePort(ports []corev1.ServicePort, portSelector string) (*corev1.ServicePort, error) {
	selector := strings.TrimSpace(portSelector)
	if selector == "" {
		return GetPort(ports)
	}

	if portNum, err := strconv.ParseInt(selector, 10, 32); err == nil {
		for i, port := range ports {
			if port.Port == int32(portNum) {
				return &ports[i], nil
			}
		}

		return nil, fmt.Errorf("no service port with number %s", selector)
	}

	for i, port := range ports {
		if port.Name == selector {
			return &ports[i], nil
		}
	}

	return nil, fmt.Errorf("no service port with name %q", selector)
}

// schemeForPort keeps existing scheme choice for ports named http/https.
// Explicitly selected other ports default to http, except port 443 which uses https.
func schemeForPort(port *corev1.ServicePort) string {
	switch port.Name {
	case HTTPSchemeName:
		return HTTPSchemeName
	case HTTPSSchemeName:
		return HTTPSSchemeName
	default:
		if port.Port == 443 {
			return HTTPSSchemeName
		}

		return HTTPSchemeName
	}
}

// getServiceURLPrefix generates a URL prefix for a Kubernetes service based on the provided proxyService and service
// If the service is external, the function generates a URL prefix in the format <scheme>://<external-name>:<port>
// Otherwise, the function generates a URL prefix in the format <scheme>://<service-name>.<namespace>:<port>.
func getServiceURLPrefix(ps *proxyService, service *corev1.Service) string {
	if ps.IsExternal {
		return fmt.Sprintf("%s://%s:%d", ps.Scheme, service.Spec.ExternalName, ps.Port)
	}

	return fmt.Sprintf("%s://%s.%s:%d", ps.Scheme, ps.Name, ps.Namespace, ps.Port)
}
