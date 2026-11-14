import { router, Stack, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { AutorizacionGlobal } from '@/components/autorizacion';
import { PantallaBloqueo } from '@/components/bloqueo';
import { Notificaciones } from '@/components/notificaciones';
import { C } from '@/constants/colores';
import { alEscribir } from '@/lib/api';
import { ConexionProvider } from '@/lib/conexion';
import { cargarImpresionLocal, procesarCola } from '@/lib/impresionLocal';
import { SesionProvider, useSesion } from '@/lib/sesion';

SplashScreen.preventAutoHideAsync();

// Pantallas que se pueden ver sin sesión
const SIN_SESION = ['login', 'servidor', 'index'];

function Navegacion() {
  const { listo, usuario } = useSesion();
  const segmentos = useSegments();
  const pantalla = segmentos[0] ?? 'index';

  // La pantalla de inicio se quita cuando ya se leyó la sesión guardada
  useEffect(() => {
    if (listo) SplashScreen.hideAsync();
  }, [listo]);

  // Sin sesión (salió desde el bloqueo, venció el token...) nunca se queda en una pantalla
  // interna vacía: se va al inicio de sesión
  useEffect(() => {
    if (listo && !usuario && !SIN_SESION.includes(pantalla)) router.replace('/login');
  }, [listo, usuario, pantalla]);

  if (!listo) return null;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.fondo } }} />
  );
}

// Toda tablet con sesión revisa la cola cada 3 s y justo después de cada acción
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
        <Notificaciones />
      </ConexionProvider>
    </SesionProvider>
  );
}
