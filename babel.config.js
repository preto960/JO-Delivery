module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        root: ['./src'],
        extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json'],
        alias: {
          '@': './src',
          '@components': './src/components',
          '@config': './src/config',
          '@screens': './src/screens',
          '@navigation': './src/navigation',
          '@context': './src/context',
          '@services': './src/services',
          '@theme': './src/theme',
          '@utils': './src/utils',
          '@hooks': './src/hooks',
        },
      },
    ],
    // Seguridad: en builds release se eliminan los console.* — se llegaban a
    // logcar tokens, códigos OTP y respuestas del API en logcat. Se conservan
    // console.error y console.warn para diagnóstico.
    ...(process.env.NODE_ENV === 'production'
      ? [['transform-remove-console', {exclude: ['error', 'warn']}]]
      : []),
  ],
};
