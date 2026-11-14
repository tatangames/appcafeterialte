// Solo para la variante de pruebas (ver app.config.js): un APK release bloquea http:// y el
// servidor local (Laragon en la red) no tiene https. Producción no usa este plugin.
const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

module.exports = function withHttpLocal(config) {
  return withAndroidManifest(config, (c) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(c.modResults);
    app.$['android:usesCleartextTraffic'] = 'true';
    return c;
  });
};
