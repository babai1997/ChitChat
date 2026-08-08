const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// packages/e2ee and packages/types live OUTSIDE this project root (sibling
// folders under the monorepo root), consumed via a bare "@chitchat/e2ee" /
// "@chitchat/types" import and a matching alias in tsconfig.json's "paths".
// That tsconfig alias only affects TypeScript's type-checker — it does
// nothing for Metro's actual runtime bundler, which is why `tsc` has always
// passed clean here while the app crashed at runtime with "Unable to
// resolve module @chitchat/e2ee." Metro needs two separate things to make
// this work: watchFolders (permission to see files outside its own project
// root at all) and extraNodeModules (to know what "@chitchat/e2ee" / bare
// "@chitchat/types" actually point to, the same role Vite's resolve.alias
// plays for the web app in frontend/vite.config.ts).
config.watchFolders = [workspaceRoot];
config.resolver.extraNodeModules = {
  '@chitchat/e2ee': path.resolve(workspaceRoot, 'packages/e2ee'),
  '@chitchat/types': path.resolve(workspaceRoot, 'packages/types'),
};

// packages/e2ee has its own package.json/node_modules (@noble/curves etc.,
// installed via its own `npm install` — see mobile/package.json's
// postinstall script). Metro's default upward node_modules search from a
// file inside packages/e2ee/src/ would already find packages/e2ee/
// node_modules on its own, but only once watchFolders (above) lets Metro
// see that directory exists in the first place.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'packages/e2ee/node_modules'),
];

module.exports = config;
