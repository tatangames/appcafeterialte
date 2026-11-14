#!/usr/bin/env bash
# Compila el APK de la tablet en esta PC (sin EAS). Uso, desde Git Bash:
#   bash scripts/compilar-apk.sh                                → producción (servidor de .env.production)
#   bash scripts/compilar-apk.sh pruebas                        → pruebas: pregunta el servidor al iniciar sesión
#   bash scripts/compilar-apk.sh pruebas http://192.168.1.50    → pruebas con ese servidor fijo
#
# La de pruebas es otra app («… (Pruebas)», paquete .pruebas): se instala junto a la de producción
# sin reemplazarla, acepta http:// (Laragon en la red local) y no recibe actualizaciones OTA.
# Ver app.config.js.
#
# Antes de una versión nueva de producción, sube "versionCode" en app.json (3 → 4…) para que la
# tablet la acepte encima de la anterior.
#
# Por qué compila en C:\pa (pruebas en C:\pp): Windows limita las rutas a 260 caracteres y las
# librerías nativas (reanimated, gesture-handler) generan rutas más largas dentro de la carpeta del
# proyecto. El proyecto se copia ahí (solo lo que cambió) y el resultado se deja en apk/. Cada
# variante tiene su copia para que el cambio de paquete no mezcle compilaciones.
set -euo pipefail

VARIANTE="${1:-produccion}"
SERVIDOR_PRUEBAS="${2:-}"
case "$VARIANTE" in
  produccion)
    COPIA="/c/pa"; COPIA_WIN="C:\\pa"; STAGING="C:/c"; NOMBRE="Meseros" ;;
  pruebas)
    COPIA="/c/pp"; COPIA_WIN="C:\\pp"; STAGING="C:/cp"; NOMBRE="Pruebas"
    export APP_VARIANTE=pruebas ;;
  *)
    echo "Variante desconocida: $VARIANTE (usa: produccion | pruebas [servidor])"; exit 1 ;;
esac

cd "$(dirname "$0")/.."
# La carpeta del proyecto se toma de donde está el script (si se mueve, sigue funcionando)
PROYECTO="$(pwd)"
ORIGEN="$(cygpath -w "$PROYECTO")"
JDK17="C:/Users/$USERNAME/.gradle/jdks/zulu17.70.113-ca-fx-jdk17.0.21.0.3-win_x64"
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"
export PATH="$JAVA_HOME/bin:$PATH"

VERSION=$(grep -oE '"versionCode": *[0-9]+' app.json | grep -oE '[0-9]+$')
echo "== Compilando $VARIANTE, versionCode $VERSION"

[ -d "$JDK17" ] || { echo "Falta el JDK 17 en $JDK17"; exit 1; }

echo "== 1/4 Copiando cambios a $COPIA_WIN"
# /MIR deja la copia igual al proyecto; android/ (lo genera prebuild ahí) y apk/ no se tocan
# (la ruta del proyecto no debe tener espacios: cmd //c no maneja bien las comillas desde Git Bash)
cmd //c "robocopy $ORIGEN $COPIA_WIN /MIR /NFL /NDL /NJH /NJS /NP /R:1 /W:1 /XD $ORIGEN\\.git $ORIGEN\\android $ORIGEN\\apk .cxx" || true
# robocopy devuelve códigos raros aunque copie bien; lo que importa es que la copia quede completa
[ -f "$COPIA/package.json" ] || { echo "No se pudo copiar $ORIGEN a $COPIA_WIN"; exit 1; }

# Pruebas: el servidor de producción no se usa. Con servidor queda fijo; sin él, la app lo pregunta.
# (Solo se cambia en la copia; la próxima vez robocopy la vuelve a dejar igual al proyecto.)
if [ "$VARIANTE" = pruebas ]; then
  if [ -n "$SERVIDOR_PRUEBAS" ]; then
    echo "EXPO_PUBLIC_SERVIDOR=$SERVIDOR_PRUEBAS" > "$COPIA/.env.production"
    echo "   Servidor fijo: $SERVIDOR_PRUEBAS"
  else
    rm -f "$COPIA/.env.production"
    echo "   Sin servidor fijo: se pregunta al iniciar sesión"
  fi
fi

echo "== 2/4 Generando proyecto Android (prebuild)"
(cd "$COPIA" && CI=1 npx expo prebuild -p android --no-install >/dev/null)

# Ajustes de la copia que prebuild no conoce
cd "$COPIA/android"
echo 'sdk.dir=C:/Users/'"$USERNAME"'/AppData/Local/Android/Sdk' > local.properties
sed -i "s/^rootProject.name = .*/rootProject.name = 'PanaderiaEduardo$NOMBRE'/" settings.gradle
if ! grep -q 'buildStagingDirectory' app/build.gradle; then
  sed -i '/^android {/a\    externalNativeBuild {\n        cmake {\n            buildStagingDirectory = file("'"$STAGING"'")\n        }\n    }' app/build.gradle
fi

echo "== 3/4 Compilando (Gradle)"
./gradlew assembleRelease -PreactNativeArchitectures=armeabi-v7a,arm64-v8a \
  "-Porg.gradle.java.installations.paths=$JDK17" -Porg.gradle.java.installations.auto-download=false \
  --no-daemon --console=plain -q

echo "== 4/4 Copiando el APK"
DESTINO="$PROYECTO/apk/PanaderiaEduardo-$NOMBRE-v$VERSION.apk"
mkdir -p "$(dirname "$DESTINO")"
cp app/build/outputs/apk/release/app-release.apk "$DESTINO"
echo "Listo: $DESTINO ($(du -h "$DESTINO" | cut -f1))"
