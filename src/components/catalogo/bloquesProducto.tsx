// Bloques de extras de un producto, uno debajo de otro como en las apps de delivery
// (Tipo de leche, Leche extra...): agregar uno existente o nuevo, ordenarlos, editarlos y quitarlos.
// Cada cambio de la lista se guarda al momento, aparte del botón «Guardar producto».
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { FormGrupo } from '@/components/catalogo/extras';
import { Boton, Etiqueta } from '@/components/ui';
import { C, radio } from '@/constants/colores';
import { mensajeError } from '@/lib/api';
import { avisar } from '@/lib/aviso';
import { dinero } from '@/lib/formato';
import { minimoDe, reglaTexto } from '@/lib/modificadores';
import * as op from '@/lib/operaciones';
import { sinTildes } from '@/lib/texto';

type Datos = Awaited<ReturnType<typeof op.getGruposExtras>>;

export function BloquesProducto({ productoId }: { productoId: number }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [suyos, setSuyos] = useState<number[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [buscar, setBuscar] = useState('');
  // undefined: cerrado; null: bloque nuevo
  const [editando, setEditando] = useState<op.GrupoExtra | null | undefined>(undefined);

  const cargar = useCallback(() => {
    Promise.all([op.getGruposExtras(), op.getBloquesProducto(productoId)])
      .then(([d, b]) => { setDatos(d); setSuyos(b.grupos); })
      .catch((err) => avisar('No se pudieron cargar los extras', mensajeError(err)));
  }, [productoId]);
  useEffect(cargar, [cargar]);

  const guardarLista = async (lista: number[]) => {
    const antes = suyos;
    setSuyos(lista);
    setGuardando(true);
    try {
      await op.guardarBloquesProducto(productoId, lista);
    } catch (err) {
      setSuyos(antes);
      avisar('No se pudo guardar', mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };

  const mover = (n: number, d: -1 | 1) => {
    const lista = [...suyos];
    [lista[n], lista[n + d]] = [lista[n + d], lista[n]];
    guardarLista(lista);
  };

  const bloques = suyos.map((id) => datos?.grupos.find((g) => g.id === id)).filter((g): g is op.GrupoExtra => !!g);
  // Para agregar uno que ya existe: se escribe «leche» y aparecen los que no lleva
  const disponibles = useMemo(() => {
    const t = sinTildes(buscar.trim());
    return (datos?.grupos ?? []).filter((g) => !suyos.includes(g.id) && (!t || sinTildes(g.nombre).includes(t))).slice(0, 8);
  }, [datos, suyos, buscar]);

  if (!datos) return <Text style={e.suave}>Cargando extras...</Text>;

  return (
    <View style={{ gap: 10 }}>
      <Text style={e.suave}>Lo que se elige al vender este producto, en este orden. Se guarda al momento.</Text>
      {bloques.length === 0 && <Text style={e.vacio}>No lleva extras. Agrega un bloque como «Tipo de leche» o «Salsa».</Text>}

      {bloques.map((g, n) => {
        const requerido = minimoDe(g) > 0;
        const otros = g.productos.filter((p) => p.id !== productoId);
        return (
          <View key={g.id} style={e.bloque}>
            <View style={e.cabecera}>
              <Text style={e.numero}>{n + 1}</Text>
              <Text style={e.titulo}>{g.nombre}</Text>
              <Etiqueta texto={`${requerido ? 'Requerido' : 'Opcional'}${reglaTexto(g) ? ` · ${reglaTexto(g)}` : ''}`}
                fondo={requerido ? '#FEF3C7' : '#F3F4F6'} color={requerido ? '#92400E' : '#374151'} />
            </View>
            {g.opciones.filter((o) => o.activo !== false).map((o) => (
              <View key={o.id} style={e.opcion}>
                <Text style={[e.texto, { flex: 1 }]}>
                  {o.nombre}{(o.maximo ?? 1) > 1 ? ` · hasta ${o.maximo}` : ''}{o.insumo ? `  (descuenta ${o.cantidad} ${o.unidad ?? ''} de ${o.insumo})` : ''}
                </Text>
                <Text style={e.suave}>{o.precio > 0 ? `+${dinero(o.precio)}` : 'Gratis'}</Text>
              </View>
            ))}
            {otros.length > 0 && <Text style={e.suave}>También en: {otros.map((p) => p.nombre).join(', ')}</Text>}
            <View style={e.acciones}>
              <Pressable style={[e.flecha, (n === 0 || guardando) && { opacity: 0.3 }]} disabled={n === 0 || guardando} onPress={() => mover(n, -1)}
                accessibilityLabel={`Subir ${g.nombre}`}><Text style={e.flechaTexto}>↑</Text></Pressable>
              <Pressable style={[e.flecha, (n === bloques.length - 1 || guardando) && { opacity: 0.3 }]} disabled={n === bloques.length - 1 || guardando}
                onPress={() => mover(n, 1)} accessibilityLabel={`Bajar ${g.nombre}`}><Text style={e.flechaTexto}>↓</Text></Pressable>
              <View style={{ flex: 1 }} />
              <Boton titulo="Editar" variante="contorno" chico onPress={() => setEditando(g)} />
              <Boton titulo="Quitar" variante="contorno" chico deshabilitado={guardando} onPress={() => guardarLista(suyos.filter((x) => x !== g.id))} />
            </View>
          </View>
        );
      })}

      {datos.grupos.some((g) => !suyos.includes(g.id)) && (
        <View style={{ gap: 6 }}>
          <TextInput style={e.buscar} value={buscar} onChangeText={setBuscar} placeholder="Agregar un bloque que ya existe (leche, salsa...)"
            placeholderTextColor={C.tenue} autoCorrect={false} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {disponibles.map((g) => (
              <Pressable key={g.id} disabled={guardando} onPress={() => { setBuscar(''); guardarLista([...suyos, g.id]); }}
                style={({ pressed }) => [e.chip, pressed && { opacity: 0.7 }]}>
                <Text style={e.texto}>+ {g.nombre}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
      <Boton titulo="+ Crear bloque nuevo" variante="contorno" onPress={() => setEditando(null)} />

      {editando !== undefined && (
        <FormGrupo grupo={editando} datos={datos} productosIniciales={[productoId]}
          onCerrar={() => setEditando(undefined)}
          onListo={async (id) => {
            const nuevo = editando === null;
            setEditando(undefined);
            // Uno nuevo queda al final de la lista del producto
            if (nuevo && id && !suyos.includes(id)) await op.guardarBloquesProducto(productoId, [...suyos, id]).catch(() => null);
            cargar();
          }} />
      )}
    </View>
  );
}

const e = StyleSheet.create({
  suave: { fontSize: 13, color: C.suave },
  vacio: { fontSize: 14, color: C.suave, padding: 14, textAlign: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: '#D1D5DB', borderRadius: radio },
  bloque: { borderWidth: 1, borderColor: C.borde, borderRadius: radio, padding: 12, gap: 6, backgroundColor: '#fff' },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  numero: { fontSize: 14, fontWeight: '700', color: C.tenue },
  titulo: { fontSize: 16, fontWeight: '700', color: C.texto },
  opcion: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  texto: { fontSize: 14, color: C.texto },
  acciones: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 4 },
  flecha: { width: 40, height: 40, borderRadius: radio, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  flechaTexto: { fontSize: 18, fontWeight: '700', color: C.texto },
  buscar: { height: 46, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: radio, paddingHorizontal: 14, fontSize: 15, backgroundColor: '#fff', color: C.texto },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: '#D1D5DB', backgroundColor: '#F9FAFB' },
});
