// Expo SDK 54 getDefaultConfig auto-detects the pnpm workspace root.
const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);
module.exports = config;
