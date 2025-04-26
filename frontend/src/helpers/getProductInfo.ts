/**
 * @returns the 'VERSION' of the app and the 'GIT_VERSION' of the app.
 */
export function getVersion() {
  return {
    VERSION: import.meta.env.REACT_APP_HEADLAMP_VERSION,
    GIT_VERSION: import.meta.env.REACT_APP_HEADLAMP_GIT_VERSION,
  };
}
/**
 * @returns the product name of the app, or undefined if it's not set.
 */
export function getProductName(): string | undefined {
  return import.meta.env.REACT_APP_HEADLAMP_PRODUCT_NAME;
}
