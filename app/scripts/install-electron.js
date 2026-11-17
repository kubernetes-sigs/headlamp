'use strict';

if (process.env.ELECTRON_GET_USE_PROXY) {
  const hasStandardHttpProxy =
    process.env.HTTP_PROXY !== undefined || process.env.http_proxy !== undefined;
  const legacyProxy = {
    HTTP_PROXY: process.env.GLOBAL_AGENT_HTTP_PROXY,
    HTTPS_PROXY: hasStandardHttpProxy
      ? undefined
      : process.env.GLOBAL_AGENT_HTTPS_PROXY ?? process.env.GLOBAL_AGENT_HTTP_PROXY,
    NO_PROXY: process.env.GLOBAL_AGENT_NO_PROXY,
  };

  for (const [name, value] of Object.entries(legacyProxy)) {
    if (
      value !== undefined &&
      process.env[name] === undefined &&
      process.env[name.toLowerCase()] === undefined
    ) {
      process.env[name] = value;
    }
  }
}

require('electron/install.js');
