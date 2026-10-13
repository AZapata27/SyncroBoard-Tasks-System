const { composePlugins, withNx } = require('@nx/webpack');

// Bundles the app with webpack so TS path aliases (@app/*, @<app>/*) are resolved
// and the workspace libs (libs/common, libs/contracts) end up inside dist/.
// node_modules stay external (externalDependencies: 'all' by default).
module.exports = composePlugins(withNx({ target: 'node' }), (config) => config);
