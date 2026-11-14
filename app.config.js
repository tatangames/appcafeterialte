// La configuración vive en app.json. Este archivo solo arma la variante de pruebas:
//   APP_VARIANTE=pruebas → app aparte («(Pruebas)», otro paquete) que se instala junto a la de
//   producción, acepta servidores http:// (Laragon en la red local) y no recibe actualizaciones OTA
//   (una OTA del canal preview le metería el código de producción y apuntaría al servidor real).
// Sin APP_VARIANTE la configuración queda exactamente como en app.json (producción y EAS).
module.exports = ({ config }) => {
  if (process.env.APP_VARIANTE !== 'pruebas') {
    return config;
  }

  return {
    ...config,
    name: `${config.name} (Pruebas)`,
    android: { ...config.android, package: `${config.android.package}.pruebas` },
    updates: { ...config.updates, enabled: false },
    plugins: [...(config.plugins ?? []), './plugins/withHttpLocal'],
  };
};
