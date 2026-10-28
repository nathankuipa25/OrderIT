const path = require("path");
const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config");

const mobileRoot = __dirname;
const repositoryRoot = path.resolve(mobileRoot, "..");
const defaultConfig = getDefaultConfig(mobileRoot);

module.exports = mergeConfig(defaultConfig, {
  watchFolders: [repositoryRoot],
  resolver: {
    nodeModulesPaths: [path.join(repositoryRoot, "node_modules")],
  },
});
