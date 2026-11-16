package serviceproxy

import (
	"context"
	"errors"
	"fmt"
	"strconv"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

const (
	HTTPSchemeName  = "http"
	HTTPSSchemeName = "https"
)

// ErrPortNotFound indicates that the Service does not declare a port matching
// the requested selector or, without a selector, that it has no port named
// http or https.
var ErrPortNotFound = errors.New("service port not found")

type proxyService struct {
	IsExternal bool   `yaml:"is_external"`
	Port       int32  `yaml:"port"`
	Name       string `yaml:"name"`
	Namespace  string `yaml:"namespace"`
	Scheme     string `yaml:"scheme"`
	URIPrefix  string `yaml:"URIPrefix"`
}

// GetService returns the requested service, using the first port named "https"
// or, failing that, the first port named "http".
func GetService(ctx context.Context, cs kubernetes.Interface, namespace string, name string) (*proxyService, error) {
	return GetServiceWithPort(ctx, cs, namespace, name, "")
}

// GetServiceWithPort returns the requested service and resolves the port used
// to reach it. An empty portSelector keeps the historical behaviour of
// selecting a port named "https" or "http"; otherwise portSelector has to match
// a port name or a port number declared in the Service spec.
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

	port, err := resolvePort(service.Spec.Ports, portSelector)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "service port not found")

		return nil, err
	}

	ps.Port = port.Port
	ps.Scheme = portScheme(port)
	ps.URIPrefix = getServiceURLPrefix(ps, service)

	return ps, nil
}

// GetPort returns the first port named "https" or, failing that, the first port
// named "http".
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

	return nil, fmt.Errorf("%w: no port found with the name http or https", ErrPortNotFound)
}

// resolvePort selects the Service port identified by portSelector. An empty
// selector preserves the historical http/https behaviour. A numeric selector
// matches a Service port number - the port the Service exposes, not its
// targetPort - and any other value has to match a port name exactly.
func resolvePort(ports []corev1.ServicePort, portSelector string) (*corev1.ServicePort, error) {
	if portSelector == "" {
		return GetPort(ports)
	}

	// Try a port number first so a numeric selector never falls back to a name.
	if number, err := strconv.ParseInt(portSelector, 10, 32); err == nil {
		for i := range ports {
			if ports[i].Port == int32(number) {
				return &ports[i], nil
			}
		}

		return nil, fmt.Errorf("%w: no service port with number %s", ErrPortNotFound, portSelector)
	}

	for i := range ports {
		if ports[i].Name == portSelector {
			return &ports[i], nil
		}
	}

	return nil, fmt.Errorf("%w: no service port with name %q", ErrPortNotFound, portSelector)
}

// portScheme chooses the scheme used to reach the selected port. Ports named
// "https" use HTTPS and ports named "http" use HTTP; any other port uses HTTPS
// when numbered 443 and HTTP otherwise.
func portScheme(port *corev1.ServicePort) string {
	switch port.Name {
	case HTTPSSchemeName:
		return HTTPSSchemeName
	case HTTPSchemeName:
		return HTTPSchemeName
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
