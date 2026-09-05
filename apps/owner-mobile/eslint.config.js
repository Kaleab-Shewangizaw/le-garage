const expoConfig = require("eslint-config-expo/flat");

module.exports = [
  ...expoConfig,
  { ignores: ["dist-web/**", "dist/**", "node_modules/**"] },
];
