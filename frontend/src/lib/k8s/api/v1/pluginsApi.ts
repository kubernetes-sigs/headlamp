import { getHeadlampAPIHeaders } from '../../../../helpers/getHeadlampAPIHeaders';
import { request } from './clusterRequests';

//@todo: what is DELETE /plugins/name response type? It's not used by headlamp in PLuginSettingsDetail.
/**
 * Deletes the plugin with the specified name from the system.
 *
 * This function sends a DELETE request to the server's plugin management
 * endpoint, targeting the plugin identified by its name.
 * The function handles the request asynchronously and returns a promise that
 * resolves with the server's response to the DELETE operation.
 *
 * @param {string} name - The unique name of the plugin to delete.
 *  This identifier is used to construct the URL for the DELETE request.
 *
 * @returns — A Promise that resolves to the JSON response from the API server.
 * @throws — An ApiError if the response status is not ok.
 *
 * @example
 * // Call to delete a plugin named 'examplePlugin'
 * deletePlugin('examplePlugin')
 *   .then(response => console.log('Plugin deleted successfully', response))
 *   .catch(error => console.error('Failed to delete plugin', error));
 */
export async function deletePlugin(name: string) {
  return request(
    `/plugins/${name}`,
    { method: 'DELETE', headers: { ...getHeadlampAPIHeaders() } },
    false,
    false
  );
}
