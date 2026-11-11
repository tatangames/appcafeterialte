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

  // En el orden en que se acomodaron en el producto (Tipo de leche antes que Leche extra)
  const suyos = useMemo(() => grupos.filter((g) => producto.grupos.includes(g.id))
    .sort((a, b) => producto.grupos.indexOf(a.id) - producto.grupos.indexOf(b.id)), [grupos, producto]);
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
      {/* Cada bloque como lista, una opción por renglón (como en las apps de delivery) */}
      {suyos.map((g, nb) => {
        const requerido = minimoDe(g) > 0;
        const faltaAqui = total(g) < minimoDe(g);
        const unaNomas = maximoDe(g) === 1;
        return (
          <View key={g.id} style={[{ gap: 6 }, nb > 0 && e.separado]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text style={e.grupo}>{g.nombre}</Text>
              <Text style={[e.etiqueta, requerido ? (faltaAqui ? e.etiquetaFalta : e.etiquetaListo) : e.etiquetaOpcional]}>
                {requerido ? 'Requerido' : 'Opcional'}
              </Text>
            </View>
            {(!!reglaTexto(g) || maximoDe(g) !== null) && (
              <Text style={[e.suave, faltaAqui && { color: C.peligro }]}>
                {reglaTexto(g).replace(/^./, (c) => c.toUpperCase())}{maximoDe(g) !== null ? ` · llevas ${total(g)}` : ''}
              </Text>
            )}
            <View style={e.lista}>
              {g.opciones.map((o, k) => {
                const activo = elegidos.includes(o.id);
                // Sin existencia de su insumo no se elige (si ya venía elegida, se puede quitar)
                const agotada = !!o.agotado && !activo;
                const maximo = Math.max(1, o.maximo ?? 1);
                const n = veces(o.id);
                // Bloque lleno (máximo 2 ya elegidos): hay que quitar otra antes; con máximo 1 se cambia sola
                const bloqueada = !activo && lleno(g) && !unaNomas && !o.exclusiva;
                const detalle = agotada ? null
                  : [o.precio > 0 ? `+${dinero(o.precio)}${maximo > 1 ? ' c/u' : ''}` : '', o.obligatorio ? 'siempre va' : ''].filter(Boolean).join(' · ');
                const textos = (marcado: boolean) => (
                  <View style={{ flex: 1 }}>
                    <Text style={[e.opcionTexto, marcado && { color: C.primario }, agotada && { color: C.suave, textDecorationLine: 'line-through' }]}>{o.nombre}</Text>
                    {agotada ? <Text style={e.agotado}>Agotado</Text> : detalle ? <Text style={e.suave}>{detalle}</Text> : null}
                  </View>
                );
                if (maximo > 1 && !agotada) {
                  const menos = n <= (o.obligatorio ? 1 : 0);
                  const mas = n >= maximo || (lleno(g) && !o.exclusiva);
                  return (
                    <View key={o.id} style={[e.renglon, k > 0 && e.renglonLinea, n > 0 && e.renglonActivo]}>
                      {textos(n > 0)}
                      <Pressable style={[e.paso, menos && e.pasoApagado]} disabled={menos} onPress={() => cambiarVeces(g, o, -1, maximo)}
                        accessibilityLabel={`Quitar ${o.nombre}`}><Text style={e.pasoTexto}>−</Text></Pressable>
                      <Text style={e.numero}>{n}</Text>
                      <Pressable style={[e.paso, mas && e.pasoApagado]} disabled={mas} onPress={() => cambiarVeces(g, o, 1, maximo)}
                        accessibilityLabel={`Agregar ${o.nombre}`}><Text style={e.pasoTexto}>+</Text></Pressable>
                    </View>
                  );
                }
                return (
                  <Pressable key={o.id} onPress={() => !agotada && tocar(g, o)} disabled={agotada || bloqueada}
                    style={[e.renglon, k > 0 && e.renglonLinea, activo && e.renglonActivo, (agotada || bloqueada) && { opacity: 0.45 }]}>
                    {textos(activo)}
                    {/* Redondo si se elige una sola; cuadrado si se pueden varias */}
                    <View style={[e.marca, unaNomas && { borderRadius: 13 }, activo && e.marcaActiva]}>
                      {activo && (unaNomas ? <View style={e.punto} /> : <Text style={e.palomita}>✓</Text>)}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}

      <View style={e.cantidad}>
        <Text style={e.grupo}>Cantidad</Text>
        <Pressable style={e.pasoGrande} onPress={() => setCantidad((c) => Math.max(1, c - 1))}><Text style={e.pasoGrandeTexto}>−</Text></Pressable>
        <Text style={e.numeroGrande}>{cantidad}</Text>
        <Pressable style={e.pasoGrande} onPress={() => setCantidad((c) => c + 1)}><Text style={e.pasoGrandeTexto}>+</Text></Pressable>
      </View>

      <Campo etiqueta="Nota para cocina" value={notas} onChangeText={setNotas} placeholder="Sin cebolla, bien tostado..." maxLength={200} />
    </Ventana>
  );
}

const e = StyleSheet.create({
  grupo: { fontSize: 16, fontWeight: '700', color: C.texto },
  suave: { fontSize: 12, color: C.suave, fontWeight: '400' },
  separado: { borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 12 },
  etiqueta: { fontSize: 12, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  etiquetaFalta: { backgroundColor: '#FEE2E2', color: '#991B1B' },
  etiquetaListo: { backgroundColor: '#DCFCE7', color: '#166534' },
  etiquetaOpcional: { backgroundColor: '#F3F4F6', color: '#374151' },
  lista: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: radio, overflow: 'hidden', backgroundColor: '#fff' },
  renglon: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#fff' },
  renglonLinea: { borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  renglonActivo: { backgroundColor: '#EFF6FF' },
  opcionTexto: { fontSize: 15, fontWeight: '600', color: C.texto },
  agotado: { fontSize: 12, fontWeight: '700', color: C.peligro },
  marca: { width: 26, height: 26, borderRadius: 6, borderWidth: 2, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  marcaActiva: { borderColor: C.primario, backgroundColor: C.primario },
  punto: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff' },
  palomita: { color: '#fff', fontSize: 15, fontWeight: '800', lineHeight: 18 },
  paso: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.primario, alignItems: 'center', justifyContent: 'center' },
  pasoApagado: { backgroundColor: '#E5E7EB' },
  pasoTexto: { fontSize: 22, fontWeight: '700', color: '#fff', lineHeight: 26 },
  numero: { fontSize: 18, fontWeight: '700', minWidth: 26, textAlign: 'center', color: C.texto },
  cantidad: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pasoGrande: { width: 52, height: 52, borderRadius: radio, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  pasoGrandeTexto: { fontSize: 26, fontWeight: '600', color: C.texto },
  numeroGrande: { fontSize: 22, fontWeight: '700', minWidth: 36, textAlign: 'center', color: C.texto },
});
