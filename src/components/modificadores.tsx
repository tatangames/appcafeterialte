// Extras de un producto (leche, saborizantes...) con su precio, cantidad y nota para cocina
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Boton, Campo, Ventana } from '@/components/ui';
import { C, radio } from '@/constants/colores';
import { dinero } from '@/lib/formato';
import { maximoDe, minimoDe, reglaTexto } from '@/lib/modificadores';
import { GrupoModificador, ItemNuevo, ProductoMesa } from '@/lib/tipos';

type Opcion = GrupoModificador['opciones'][number];

// Elegir una opción en su grupo: «una sola» quita las demás del grupo; cualquier otra quita las «una sola»
const conOpcion = (g: GrupoModificador, actual: number[], o: Opcion, veces: number): number[] => {
  const delGrupo = (id: number) => g.opciones.find((x) => x.id === id);
  const resto = actual.filter((id) => id !== o.id && !(delGrupo(id) && (o.exclusiva || delGrupo(id)?.exclusiva)));
  return [...resto, ...Array<number>(veces).fill(o.id)];
};

// inicial: al editar una línea ya agregada, abre con lo que tenía elegido
type Inicial = { modificadores: number[]; cantidad: number; notas?: string };
type Props = { grupos: GrupoModificador[]; onCerrar: () => void; onAgregar: (item: ItemNuevo) => void; inicial?: Inicial | null };

// Se monta de cero por producto: cada vez empieza sin extras, cantidad 1 y sin nota
// Sirve para la mesa y la venta rápida: solo usa id, nombre, precio y grupos
type ProductoConExtras = Pick<ProductoMesa, 'id' | 'nombre' | 'precio' | 'grupos'>;

export function ModificadoresModal({ producto, ...props }: Props & { producto: ProductoConExtras | null }) {
  return producto ? <Contenido key={producto.id} producto={producto} {...props} /> : null;
}

function Contenido({ producto, grupos, onCerrar, onAgregar, inicial }: Props & { producto: ProductoConExtras }) {
  // Las obligatorias empiezan marcadas (también al editar una línea que no las tenía)
  const [elegidos, setElegidos] = useState<number[]>(() => {
    const ids = inicial?.modificadores ?? [];
    const faltan = grupos.filter((g) => producto.grupos.includes(g.id)).flatMap((g) => g.opciones)
      .filter((o) => o.obligatorio && !ids.includes(o.id)).map((o) => o.id);
    return [...ids, ...faltan];
  });
  const [cantidad, setCantidad] = useState(inicial?.cantidad ?? 1);
  const [notas, setNotas] = useState(inicial?.notas ?? '');

  const suyos = useMemo(() => grupos.filter((g) => producto.grupos.includes(g.id)), [grupos, producto]);
  // Un id repetido es la opción pedida varias veces (Huevo extra ×2): cobra cada una
  const veces = (id: number) => elegidos.filter((x) => x === id).length;
  const extra = suyos.flatMap((g) => g.opciones).reduce((t, o) => t + o.precio * veces(o.id), 0);
  // Mínimo y máximo del grupo: unidades en total, contando repeticiones («Tipo de leche: de 1 a 2»)
  const deGrupo = (g: GrupoModificador, lista: number[]) => lista.filter((id) => g.opciones.some((o) => o.id === id)).length;
  const total = (g: GrupoModificador) => deGrupo(g, elegidos);
  const lleno = (g: GrupoModificador) => maximoDe(g) !== null && total(g) >= (maximoDe(g) ?? 0);
  const cabe = (g: GrupoModificador, lista: number[]) => maximoDe(g) === null || deGrupo(g, lista) <= (maximoDe(g) ?? 0);
  const falta = suyos.find((g) => g.opciones.length > 0 && total(g) < minimoDe(g));

  // Tocar marca o quita; una obligatoria no se quita. Con el grupo lleno y máximo 1, cambia por la nueva
  const tocar = (g: GrupoModificador, o: Opcion) =>
    setElegidos((actual) => {
      if (actual.includes(o.id)) return o.obligatorio ? actual : actual.filter((x) => x !== o.id);
      const nueva = conOpcion(g, actual, o, 1);
      if (cabe(g, nueva)) return nueva;
      if (maximoDe(g) === 1 && !g.opciones.some((x) => x.obligatorio)) {
        return [...actual.filter((id) => !g.opciones.some((x) => x.id === id)), o.id];
      }
      return actual;
    });

  // Opción con máximo (Huevo extra hasta 3): + y − cambian cuántas van
  // Una obligatoria no baja de 1
  const cambiarVeces = (g: GrupoModificador, o: Opcion, delta: number, maximo: number) =>
    setElegidos((actual) => {
      const nuevo = Math.min(maximo, Math.max(o.obligatorio ? 1 : 0, actual.filter((x) => x === o.id).length + delta));
      if (nuevo === 0) return actual.filter((x) => x !== o.id);
      const lista = conOpcion(g, actual, o, nuevo);
      return delta > 0 && !cabe(g, lista) ? actual : lista;
    });

  return (
    <Ventana visible titulo={producto.nombre} subtitulo={dinero(producto.precio + extra)} onCerrar={onCerrar} ancho={620}
      pie={
        <Boton estilo={{ flex: 1 }} titulo={falta ? (minimoDe(falta) > 1 ? `«${falta.nombre}»: ${reglaTexto(falta)}` : `Elige «${falta.nombre}»`) : `${inicial ? 'Guardar' : 'Agregar'} ${cantidad} · ${dinero((producto.precio + extra) * cantidad)}`}
          deshabilitado={!!falta} variante="exito"
          onPress={() => onAgregar({ producto_id: producto.id, cantidad, modificadores: elegidos, notas: notas.trim() || undefined })} />
      }>
      {suyos.map((g) => (
        <View key={g.id} style={{ gap: 8 }}>
          <Text style={e.grupo}>{g.nombre}{reglaTexto(g)
            ? <Text style={[e.suave, total(g) < minimoDe(g) && { color: C.peligro }]}>  {reglaTexto(g)}{maximoDe(g) !== null ? ` · llevas ${total(g)}` : ''}</Text>
            : null}</Text>
          <View style={e.opciones}>
            {g.opciones.map((o) => {
              const activo = elegidos.includes(o.id);
              // Sin existencia de su insumo no se elige (si ya venía elegida, se puede quitar)
              const agotada = !!o.agotado && !activo;
              const maximo = Math.max(1, o.maximo ?? 1);
              if (maximo > 1 && !agotada) {
                const n = veces(o.id);
                return (
                  <View key={o.id} style={[e.opcion, e.conCantidad, n > 0 && e.opcionActiva]}>
                    <Pressable onPress={() => n === 0 && cambiarVeces(g, o, 1, maximo)} style={{ flexShrink: 1 }}
                      disabled={n === 0 && lleno(g) && !o.exclusiva}>
                      <Text style={[e.opcionTexto, n > 0 && { color: '#fff' }]}>{o.nombre}</Text>
                      <Text style={[e.suave, n > 0 && { color: '#E0F2FE' }]}>{o.precio > 0 ? `+${dinero(o.precio)} c/u · ` : ''}hasta {maximo}{o.obligatorio ? ' · siempre va' : ''}</Text>
                    </Pressable>
                    <Pressable style={[e.pasoChico, n <= (o.obligatorio ? 1 : 0) && { opacity: 0.35 }]} disabled={n <= (o.obligatorio ? 1 : 0)} onPress={() => cambiarVeces(g, o, -1, maximo)}
                      accessibilityLabel={`Quitar ${o.nombre}`}><Text style={e.pasoTexto}>−</Text></Pressable>
                    <Text style={[e.numeroChico, n > 0 && { color: '#fff' }]}>{n}</Text>
                    <Pressable style={[e.pasoChico, (n >= maximo || (lleno(g) && !o.exclusiva)) && { opacity: 0.35 }]} disabled={n >= maximo || (lleno(g) && !o.exclusiva)} onPress={() => cambiarVeces(g, o, 1, maximo)}
                      accessibilityLabel={`Agregar ${o.nombre}`}><Text style={e.pasoTexto}>+</Text></Pressable>
                  </View>
                );
              }
              // Grupo lleno (máximo 2 ya elegidos): hay que quitar otra antes; con máximo 1 se cambia sola
              const bloqueada = !activo && lleno(g) && maximoDe(g) !== 1 && !o.exclusiva;
              return (
                <Pressable key={o.id} onPress={() => !agotada && tocar(g, o)} disabled={agotada || bloqueada}
                  style={[e.opcion, activo && e.opcionActiva, agotada && e.opcionAgotada, bloqueada && { opacity: 0.45 }]}>
                  <Text style={[e.opcionTexto, activo && { color: '#fff' }, agotada && { color: C.suave, textDecorationLine: 'line-through' }]}>{o.nombre}</Text>
                  {agotada ? <Text style={e.agotado}>Agotado</Text>
                    : (o.precio > 0 || o.obligatorio) && <Text style={[e.suave, activo && { color: '#E0F2FE' }]}>
                      {[o.precio > 0 ? `+${dinero(o.precio)}` : '', o.obligatorio ? 'siempre va' : ''].filter(Boolean).join(' · ')}</Text>}
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}

      <View style={e.cantidad}>
        <Text style={e.grupo}>Cantidad</Text>
        <Pressable style={e.paso} onPress={() => setCantidad((c) => Math.max(1, c - 1))}><Text style={e.pasoTexto}>−</Text></Pressable>
        <Text style={e.numero}>{cantidad}</Text>
        <Pressable style={e.paso} onPress={() => setCantidad((c) => c + 1)}><Text style={e.pasoTexto}>+</Text></Pressable>
      </View>

      <Campo etiqueta="Nota para cocina" value={notas} onChangeText={setNotas} placeholder="Sin cebolla, bien tostado..." maxLength={200} />
    </Ventana>
  );
}

const e = StyleSheet.create({
  grupo: { fontSize: 15, fontWeight: '700', color: C.texto },
  suave: { fontSize: 12, color: C.suave, fontWeight: '400' },
  opciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opcion: { minHeight: 48, paddingHorizontal: 14, justifyContent: 'center', borderRadius: radio, borderWidth: 1, borderColor: '#D1D5DB', backgroundColor: '#fff' },
  opcionActiva: { backgroundColor: C.libre, borderColor: C.libre },
  opcionTexto: { fontSize: 15, fontWeight: '600', color: C.texto },
  opcionAgotada: { backgroundColor: '#F3F4F6', borderStyle: 'dashed' },
  agotado: { fontSize: 12, fontWeight: '700', color: C.peligro },
  cantidad: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  paso: { width: 52, height: 52, borderRadius: radio, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  pasoTexto: { fontSize: 26, fontWeight: '600', color: C.texto },
  numero: { fontSize: 22, fontWeight: '700', minWidth: 36, textAlign: 'center', color: C.texto },
  conCantidad: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  pasoChico: { width: 40, height: 40, borderRadius: radio, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  numeroChico: { fontSize: 18, fontWeight: '700', minWidth: 22, textAlign: 'center', color: C.texto },
});
