const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const path = require('path');

const defaultConfig = getDefaultConfig(__dirname);

// Path aliases resolution for Metro (same as babel-plugin-module-resolver)
const srcPath = path.resolve(__dirname, 'src');

const config = {
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
  resolver: {
    extraNodeModules: {
      '@': srcPath,
      '@components': path.resolve(srcPath, 'components'),
      '@config': path.resolve(srcPath, 'config'),
      '@screens': path.resolve(srcPath, 'screens'),
      '@navigation': path.resolve(srcPath, 'navigation'),
      '@context': path.resolve(srcPath, 'context'),
      '@services': path.resolve(srcPath, 'services'),
      '@theme': path.resolve(srcPath, 'theme'),
      '@utils': path.resolve(srcPath, 'utils'),
      '@hooks': path.resolve(srcPath, 'hooks'),
    },
  },
};

module.exports = mergeConfig(defaultConfig, config);
