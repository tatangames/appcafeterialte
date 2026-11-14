// Android 12+ recorta el logo del splash en un círculo y algunas tablets le dibujan el borde
// (se ve como un aro oscuro). Con el fondo de ese círculo del mismo color que el splash, no se nota.
const { withAndroidStyles, withAndroidColors, AndroidConfig } = require('expo/config-plugins');

const COLOR = 'splashscreen_icon_background';

module.exports = function withSplashIconFondo(config, { color }) {
  config = withAndroidColors(config, (c) => {
    c.modResults = AndroidConfig.Colors.assignColorValue(c.modResults, { name: COLOR, value: color });
    return c;
  });

  return withAndroidStyles(config, (c) => {
    const estilo = c.modResults.resources.style?.find((s) => s.$.name === 'Theme.App.SplashScreen');
    if (estilo) {
      estilo.item = (estilo.item ?? []).filter((i) => i.$.name !== 'windowSplashScreenIconBackgroundColor');
      estilo.item.push({ $: { name: 'windowSplashScreenIconBackgroundColor' }, _: `@color/${COLOR}` });
    }
    return c;
  });
};
