import { router } from 'expo-router';
import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BotonBloquear } from '@/components/bloqueo';
import { EstadoConexion } from '@/components/estadoConexion';
import { Boton } from '@/components/ui';
import { C } from '@/constants/colores';

/** Barra superior de cada módulo: volver, título y acciones a la derecha. */
export function Encabezado({ titulo, subtitulo, derecha, volverA = '/inicio' }: {
  titulo: string; subtitulo?: string; derecha?: ReactNode; volverA?: '/inicio' | '/mesas' | null;
}) {
  const volver = () => (router.canGoBack() ? router.back() : volverA && router.replace(volverA));
  return (
    <View style={e.barra}>
      {volverA !== null && <Boton titulo="‹" variante="contorno" chico onPress={volver} estilo={{ minWidth: 48 }} />}
      <View style={{ flex: 1 }}>
        <Text style={e.titulo} numberOfLines={1}>{titulo}</Text>
        {subtitulo ? <Text style={e.subtitulo} numberOfLines={1}>{subtitulo}</Text> : null}
      </View>
      <EstadoConexion />
      {derecha}
      <BotonBloquear />
    </View>
  );
}

const e = StyleSheet.create({
  barra: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: C.borde },
  titulo: { fontSize: 20, fontWeight: '800', color: C.texto },
  subtitulo: { fontSize: 13, color: C.suave },
});
