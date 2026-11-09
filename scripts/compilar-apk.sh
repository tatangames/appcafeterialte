#!/usr/bin/env bash
# Compila el APK de la tablet en esta PC (sin EAS). Uso, desde Git Bash:
#   bash scripts/compilar-apk.sh
#
# Antes de una versión nueva, sube "versionCode" en app.json (3 → 4…) para que la tablet
# la acepte encima de la anterior. El servidor fijo sale de .env.production.
#
# Por qué compila en C:\pa: Windows limita las rutas a 260 caracteres y las librerías nativas
# (reanimated, gesture-handler) generan rutas más largas dentro de C:\laragon\www\appcafeteria.
# El proyecto se copia a C:\pa (solo lo que cambió) y el resultado se deja en apk/.
set -euo pipefail

ORIGEN="C:\\laragon\\www\\appcafeteria"
COPIA="/c/pa"
COPIA_WIN="C:\\pa"
JDK17="C:/Users/$USERNAME/.gradle/jdks/zulu17.70.113-ca-fx-jdk17.0.21.0.3-win_x64"
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"
export PATH="$JAVA_HOME/bin:$PATH"

cd "$(dirname "$0")/.."
VERSION=$(grep -oE '"versionCode": *[0-9]+' app.json | grep -oE '[0-9]+$')
echo "== Compilando versionCode $VERSION"

[ -d "$JDK17" ] || { echo "Falta el JDK 17 en $JDK17"; exit 1; }

echo "== 1/4 Copiando cambios a $COPIA_WIN"
# /MIR deja la copia igual al proyecto; android/ (lo genera prebuild ahí) y apk/ no se tocan
cmd //c "robocopy $ORIGEN $COPIA_WIN /MIR /NFL /NDL /NJH /NJS /NP /R:1 /W:1 /XD $ORIGEN\\.git $ORIGEN\\android $ORIGEN\\apk .cxx" || true

echo "== 2/4 Generando proyecto Android (prebuild)"
(cd "$COPIA" && CI=1 npx expo prebuild -p android --no-install >/dev/null)

# Ajustes de la copia que prebuild no conoce
cd "$COPIA/android"
echo 'sdk.dir=C:/Users/'"$USERNAME"'/AppData/Local/Android/Sdk' > local.properties
sed -i "s/^rootProject.name = .*/rootProject.name = 'PanaderiaEduardoMeseros'/" settings.gradle
if ! grep -q 'buildStagingDirectory' app/build.gradle; then
  sed -i '/^android {/a\    externalNativeBuild {\n        cmake {\n            buildStagingDirectory = file("C:/c")\n        }\n    }' app/build.gradle
fi

echo "== 3/4 Compilando (Gradle)"
./gradlew assembleRelease -PreactNativeArchitectures=armeabi-v7a,arm64-v8a \
  "-Porg.gradle.java.installations.paths=$JDK17" -Porg.gradle.java.installations.auto-download=false \
  --no-daemon --console=plain -q

echo "== 4/4 Copiando el APK"
DESTINO="/c/laragon/www/appcafeteria/apk/PanaderiaEduardo-Meseros-v$VERSION.apk"
mkdir -p "$(dirname "$DESTINO")"
cp app/build/outputs/apk/release/app-release.apk "$DESTINO"
echo "Listo: $DESTINO ($(du -h "$DESTINO" | cut -f1))"
