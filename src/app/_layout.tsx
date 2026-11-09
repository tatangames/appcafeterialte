import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { AutorizacionGlobal } from '@/components/autorizacion';
import { PantallaBloqueo } from '@/components/bloqueo';
import { C } from '@/constants/colores';
import { alEscribir } from '@/lib/api';
import { ConexionProvider } from '@/lib/conexion';
import { cargarImpresionLocal, procesarCola } from '@/lib/impresionLocal';
import { SesionProvider, useSesion } from '@/lib/sesion';

SplashScreen.preventAutoHideAsync();

function Navegacion() {
  const { listo } = useSesion();

  // La pantalla de inicio se quita cuando ya se leyó la sesión guardada
  useEffect(() => {
    if (listo) SplashScreen.hideAsync();
  }, [listo]);

  if (!listo) return null;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.fondo } }} />
  );
}

// La tablet que imprime revisa la cola cada 3 s y justo después de cada acción
function ImpresionLocal() {
  const { usuario } = useSesion();
  const conSesion = !!usuario;

  useEffect(() => {
    if (!conSesion) return;
    let vivo = true;
    cargarImpresionLocal().then(() => { if (vivo) procesarCola(); });
    alEscribir(() => setTimeout(procesarCola, 300));
    const ciclo = setInterval(() => {
      if (AppState.currentState === 'active') procesarCola();
    }, 3000);
    return () => {
      vivo = false;
      clearInterval(ciclo);
      alEscribir(null);
    };
  }, [conSesion]);

  return null;
}

export default function RootLayout() {
  return (
    <SesionProvider>
      <ConexionProvider>
        <StatusBar style="dark" />
        <Navegacion />
        <ImpresionLocal />
        <AutorizacionGlobal />
        <PantallaBloqueo />
      </ConexionProvider>
    </SesionProvider>
  );
}
