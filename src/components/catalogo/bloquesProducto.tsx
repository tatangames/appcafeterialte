// La tarjeta de extras de un producto (una sola), como en las apps de delivery: elegir una que ya
// existe, crear una nueva, editarla o quitarla. Cada cambio se guarda al momento, aparte del
// botón «Guardar producto».
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { DatosExtras, FormConjunto, VistaTarjeta } from '@/components/catalogo/extras';
import { Boton } from '@/components/ui';
import { C, radio } from '@/constants/colores';
import { mensajeError } from '@/lib/api';
import { avisar } from '@/lib/aviso';
import * as op from '@/lib/operaciones';
import { sinTildes } from '@/lib/texto';

export function BloquesProducto({ productoId }: { productoId: number }) {
  const [datos, setDatos] = useState<DatosExtras | null>(null);
  const [suya, setSuya] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [buscar, setBuscar] = useState('');
  const [eligiendo, setEligiendo] = useState(false);
  // undefined: cerrado; null: tarjeta nueva
  const [editando, setEditando] = useState<op.ConjuntoExtra | null | undefined>(undefined);

  const cargar = useCallback(() => {
    Promise.all([op.getGruposExtras(), op.getConjuntoProducto(productoId)])
      .then(([d, p]) => { setDatos(d); setSuya(p.conjunto_id); })
      .catch((err) => avisar('No se pudieron cargar los extras', mensajeError(err)));
  }, [productoId]);
  useEffect(cargar, [cargar]);

  const asignar = async (conjuntoId: number | null) => {
    setGuardando(true);
    try {
      avisar((await op.asignarConjuntoProducto(productoId, conjuntoId)).message);
      setEligiendo(false);
      setBuscar('');
      cargar();
    } catch (err) {
      avisar('No se pudo guardar', mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };

  const disponibles = useMemo(() => {
    const t = sinTildes(buscar.trim());
    return (datos?.conjuntos ?? []).filter((c) => c.id !== suya && (!t || sinTildes(c.nombre).includes(t))).slice(0, 8);
  }, [datos, suya, buscar]);

  if (!datos) return <Text style={e.suave}>Cargando extras...</Text>;
  const tarjeta = datos.conjuntos.find((c) => c.id === suya) ?? null;
  const otros = tarjeta?.productos.filter((p) => p.id !== productoId) ?? [];

  return (
    <View style={{ gap: 10 }}>
      <Text style={e.suave}>Lo que se elige al vender este producto. Lleva una sola tarjeta; se guarda al momento.</Text>
      {tarjeta ? (
        <View style={e.tarjeta}>
          <Text style={e.titulo}>{tarjeta.nombre}</Text>
          <VistaTarjeta conjunto={tarjeta} />
          {otros.length > 0 && <Text style={e.suave}>También la llevan: {otros.map((p) => p.nombre).join(', ')}. Si la editas, cambia en todos.</Text>}
        </View>
      ) : <Text style={e.vacio}>No lleva extras.</Text>}

      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {tarjeta && <Boton titulo="Editar tarjeta" variante="contorno" chico onPress={() => setEditando(tarjeta)} />}
        {datos.conjuntos.some((c) => c.id !== suya) && (
          <Boton titulo={tarjeta ? 'Cambiar por otra' : 'Elegir una tarjeta'} variante="contorno" chico onPress={() => setEligiendo((v) => !v)} />
        )}
        <Boton titulo="+ Tarjeta nueva" variante="contorno" chico onPress={() => setEditando(null)} />
        {tarjeta && <Boton titulo="Quitar extras" variante="contorno" chico deshabilitado={guardando} onPress={() => asignar(null)} />}
      </View>

      {eligiendo && (
        <View style={{ gap: 6 }}>
          <TextInput style={e.buscar} value={buscar} onChangeText={setBuscar} placeholder="Buscar tarjeta (bebidas, desayunos...)" placeholderTextColor={C.tenue} autoCorrect={false} />
          {disponibles.map((c) => (
            <Pressable key={c.id} disabled={guardando} onPress={() => asignar(c.id)} style={({ pressed }) => [e.resultado, pressed && { opacity: 0.7 }]}>
              <Text style={e.texto}>{c.nombre}</Text>
              <Text style={e.suave}>{c.bloques.map((b) => b.nombre).join(' · ')}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {editando !== undefined && (
        <FormConjunto conjunto={editando} datos={datos} productosIniciales={suya ? [] : [productoId]}
          onCerrar={() => setEditando(undefined)}
          onListo={async (id) => {
            const nueva = editando === null;
            setEditando(undefined);
            // Si ya llevaba otra, se pasa a la nueva
            if (nueva && suya && id) await asignar(id);
            else cargar();
          }} />
      )}
    </View>
  );
}

const e = StyleSheet.create({
  suave: { fontSize: 13, color: C.suave },
  vacio: { fontSize: 14, color: C.suave, padding: 14, textAlign: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: '#D1D5DB', borderRadius: radio },
  tarjeta: { borderWidth: 1, borderColor: C.borde, borderRadius: radio, padding: 12, gap: 10, backgroundColor: '#fff' },
  titulo: { fontSize: 16, fontWeight: '800', color: C.texto },
  texto: { fontSize: 15, color: C.texto },
  buscar: { height: 46, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: radio, paddingHorizontal: 14, fontSize: 15, backgroundColor: '#fff', color: C.texto },
  resultado: { gap: 2, padding: 12, borderRadius: radio, borderWidth: 1, borderColor: C.borde, backgroundColor: '#fff' },
});
