import ServiceMeshView from './ServiceMeshView';
import { registerGatewayNodeRenderers } from './GatewayNodeRenderers';
import { Plugin } from '../../plugin';

// Register Gateway API node renderers with the Map component
const nodeRenderers = registerGatewayNodeRenderers();
Object.entries(nodeRenderers).forEach(([kind, renderer]) => {
  Plugin.registerPluginExtension('map.nodeRenderer', kind, renderer);
});

export { ServiceMeshView };