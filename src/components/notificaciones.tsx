// Pinta los avisos de notificar() arriba al centro. Está en la raíz y dentro de cada Ventana
// (un Modal tapa lo de abajo), así se ven aunque haya una ventana abierta.
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { C, radio } from '@/constants/colores';
import { escucharNotificaciones } from '@/lib/notificacion';

export function Notificaciones() {
  const [avisos, setAvisos] = useState<{ id: number; texto: string }[]>([]);
  useEffect(() => escucharNotificaciones(setAvisos), []);
  if (!avisos.length) return null;
  return (
    <View style={[e.pila, { pointerEvents: 'none' }]}>
      {avisos.map((a) => (
        <View key={a.id} style={e.aviso}>
          <Text style={e.texto}>✓ {a.texto}</Text>
        </View>
      ))}
    </View>
  );
}

const e = StyleSheet.create({
  pila: { position: 'absolute', top: 24, left: 16, right: 16, alignItems: 'center', gap: 8, zIndex: 1000 },
  aviso: { maxWidth: 520, paddingHorizontal: 18, paddingVertical: 12, borderRadius: radio, backgroundColor: C.exito,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, elevation: 8 },
  texto: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
