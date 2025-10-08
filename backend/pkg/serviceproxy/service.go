package serviceproxy

import (
	"context"
	"fmt"

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
func GetService(cs kubernetes.Interface, namespace string, name string) (*proxyService, error) {
	service, err := cs.CoreV1().Services(namespace).Get(context.TODO(), name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}

	ps := &proxyService{
		Name:       service.Name,
		Namespace:  service.Namespace,
		IsExternal: len(service.Spec.ExternalName) > 0,
	}

	port, err := GetPort(service.Spec.Ports)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "service port not found")

		return nil, err
	}

	ps.Port = port.Port

	// Determine scheme - always use https for external
	if port.Name == HTTPSchemeName {
		ps.Scheme = HTTPSchemeName
	} else {
		ps.Scheme = HTTPSSchemeName
	}

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

// getServiceURLPrefix generates a URL prefix for a Kubernetes service based on the provided proxyService and service
// If the service is external, the function generates a URL prefix in the format <scheme>://<external-name>:<port>
// Otherwise, the function generates a URL prefix in the format <scheme>://<service-name>.<namespace>:<port>.
func getServiceURLPrefix(ps *proxyService, service *corev1.Service) string {
	if ps.IsExternal {
		return fmt.Sprintf("%s://%s:%d", ps.Scheme, service.Spec.ExternalName, ps.Port)
	}

	return fmt.Sprintf("%s://%s.%s:%d", ps.Scheme, ps.Name, ps.Namespace, ps.Port)
}
