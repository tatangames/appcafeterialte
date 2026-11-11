// Avisos breves al agregar («✓ 1 × Americano agregado»): uno encima de otro, cada uno con su tiempo,
// para poder tocar varios productos seguidos sin esperar a que se quite el anterior
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { C, radio } from '@/constants/colores';

const DURACION = 2200;
const MAXIMO = 4; // si tocan muchos seguidos, solo se ven los últimos

type Aviso = { id: number; texto: string };

export function useAvisosAgregado() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const siguiente = useRef(0);
  const tiempos = useRef<ReturnType<typeof setTimeout>[]>([]);

  const mostrar = useCallback((texto: string) => {
    const id = ++siguiente.current;
    setAvisos((a) => [...a, { id, texto }].slice(-MAXIMO));
    tiempos.current.push(setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), DURACION));
  }, []);

  const limpiar = useCallback(() => setAvisos([]), []);

  useEffect(() => () => tiempos.current.forEach(clearTimeout), []);

  return { avisos, mostrar, limpiar };
}

/**
 * En tablet (ancho) los avisos no reciben toques: los productos de abajo se siguen pudiendo tocar.
 * En teléfono, tocar uno lleva a la cuenta.
 */
export function AvisosAgregado({ avisos, ancho, verTexto, onVer }: {
  avisos: Aviso[]; ancho: boolean; verTexto: string; onVer: () => void;
}) {
  if (!avisos.length) return null;
  return (
    <View style={[e.pila, { pointerEvents: ancho ? 'none' : 'box-none' }]}>
      {avisos.map((a) => (
        <Pressable key={a.id} onPress={onVer} style={e.aviso}>
          <Text style={e.texto} numberOfLines={2}>{a.texto}</Text>
          {!ancho && <Text style={e.ver}>{verTexto}</Text>}
        </Pressable>
      ))}
    </View>
  );
}

const e = StyleSheet.create({
  pila: { position: 'absolute', left: 16, right: 16, bottom: 16, gap: 8 },
  aviso: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12,
    borderRadius: radio, backgroundColor: C.exito, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
  texto: { flex: 1, color: '#fff', fontSize: 16, fontWeight: '700' },
  ver: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
