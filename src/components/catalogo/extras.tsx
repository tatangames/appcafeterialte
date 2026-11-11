// Extras (modificadores) de cada producto, en bloques como en las apps de delivery: Tipo de leche,
// Azúcar, Extras; cada bloque requerido u opcional con mínimo y máximo, y sus opciones con precio e
// insumo. Son solo de ese producto: cambiarlos no toca a ningún otro (se pueden copiar de otro).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Interruptor, Opciones, Seccion } from '@/components/formulario';
import { Boton, Campo, Etiqueta, Ventana } from '@/components/ui';
import { C, radio } from '@/constants/colores';
import { mensajeError } from '@/lib/api';
import { avisar, confirmar } from '@/lib/aviso';
import { dinero } from '@/lib/formato';
import * as op from '@/lib/operaciones';
import { minimoDe, reglaTexto } from '@/lib/modificadores';
import { sinTildes } from '@/lib/texto';

export type DatosExtras = Awaited<ReturnType<typeof op.getGruposExtras>>;

/** «Requerido · elige 1» u «Opcional · máximo 2». */
export function EtiquetaRegla({ grupo }: { grupo: { minimo?: number; maximo?: number | null; obligatorio?: boolean } }) {
  const requerido = minimoDe(grupo) > 0;
  const regla = reglaTexto(grupo);
  return <Etiqueta texto={`${requerido ? 'Requerido' : 'Opcional'}${regla ? ` · ${regla}` : ''}`}
    fondo={requerido ? '#FEE2E2' : '#F3F4F6'} color={requerido ? '#991B1B' : '#374151'} />;
}

/** Los bloques de una tarjeta, numerados y con sus opciones, como los verá el mesero. */
export function VistaTarjeta({ conjunto }: { conjunto: op.ConjuntoExtra }) {
  return (
    <View style={{ gap: 10 }}>
      {conjunto.bloques.map((g, n) => (
        <View key={g.id} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={e.bloqueTitulo}>{n + 1}. {g.nombre}</Text>
            <EtiquetaRegla grupo={g} />
          </View>
          {g.opciones.filter((o) => o.activo !== false).map((o) => (
            <Text key={o.id} style={e.texto}>
              ○ {o.nombre}{o.precio > 0 ? ` (+${dinero(o.precio)})` : ''}{(o.maximo ?? 1) > 1 ? ` · hasta ${o.maximo}` : ''}
              {o.insumo ? <Text style={e.suave}>{`  descuenta ${o.cantidad} ${o.unidad ?? ''} de ${o.insumo}`}</Text> : null}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

export function ExtrasCatalogo() {
  const [datos, setDatos] = useState<DatosExtras | null>(null);
  // undefined: cerrado; null: agregar a un producto que aún no tiene
  const [editando, setEditando] = useState<op.ConjuntoExtra | null | undefined>(undefined);
  const [buscar, setBuscar] = useState('');

  const cargar = useCallback(() => {
    op.getGruposExtras().then(setDatos).catch((err) => avisar('No se pudieron cargar los extras', mensajeError(err)));
  }, []);
  useEffect(cargar, [cargar]);

  // Busca por tarjeta, bloque, opción o producto, sin importar tildes
  const visibles = useMemo(() => {
    const t = sinTildes(buscar.trim());
    const lista = datos?.conjuntos ?? [];
    if (!t) return lista;
    return lista.filter((c) => [c.producto, ...c.bloques.flatMap((b) => [b.nombre, ...b.opciones.map((o) => o.nombre)])]
      .some((texto) => sinTildes(texto).includes(t)));
  }, [datos, buscar]);

  const quitar = async (c: op.ConjuntoExtra) => {
    if (!(await confirmar(`¿Quitar los extras de «${c.producto}»?`, 'Se venderá sin elegir nada. Los demás productos no cambian.', 'Quitar'))) return;
    try {
      avisar((await op.quitarExtrasProducto(c.producto_id)).message);
      cargar();
    } catch (err) {
      avisar('No se pudo quitar', mensajeError(err));
    }
  };

  return (
    <ScrollView contentContainerStyle={e.contenido}>
      <View style={e.cabecera}>
        <Text style={[e.suave, { flex: 1 }]}>
          Productos con extras: lo que se elige al venderlos (tipo de leche, azúcar...), en bloques. Los de cada producto son solo suyos.
        </Text>
        <Boton titulo="+ Agregar a un producto" onPress={() => setEditando(null)} />
      </View>
      {(datos?.conjuntos.length ?? 0) > 0 && (
        <TextInput style={e.buscar} value={buscar} onChangeText={setBuscar} placeholder="Buscar producto, bloque u opción"
          placeholderTextColor={C.tenue} autoCorrect={false} />
      )}
      {!datos && <Text style={e.suave}>Cargando...</Text>}
      {datos?.conjuntos.length === 0 && <Text style={e.vacio}>Ningún producto tiene extras todavía. Agrégale al Chocolate sus bloques: Tipo de leche, Azúcar, Extras.</Text>}
      {datos && datos.conjuntos.length > 0 && visibles.length === 0 && <Text style={e.vacio}>Nada coincide con «{buscar.trim()}».</Text>}
      {visibles.map((c) => (
        <View key={c.id} style={e.tarjeta}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[e.titulo, { flex: 1 }]}>{c.producto}</Text>
            <Boton titulo="Editar" variante="contorno" chico onPress={() => setEditando(c)} />
            <Boton titulo="Quitar" variante="contorno" chico onPress={() => quitar(c)} />
          </View>
          <VistaTarjeta conjunto={c} />
        </View>
      ))}
      {editando !== undefined && datos && (
        <FormConjunto producto={editando ? { id: editando.producto_id, nombre: editando.producto } : null} conjunto={editando} datos={datos}
          onCerrar={() => setEditando(undefined)} onListo={() => { setEditando(undefined); cargar(); }} />
      )}
    </ScrollView>
  );
}

interface OpcionForm {
  id?: number; nombre: string; precio: string; maximo: string; obligatorio: boolean; exclusiva: boolean; activo: boolean;
  producto_id: number | null; cantidad: string; unidad_medida_id: number | null;
}
interface BloqueForm { clave: string; id?: number; nombre: string; minimo: string; maximo: string; opciones: OpcionForm[] }

const opcionVacia = (): OpcionForm => ({ nombre: '', precio: '', maximo: '1', obligatorio: false, exclusiva: false, activo: true, producto_id: null, cantidad: '', unidad_medida_id: null });
let siguiente = 0;
const bloqueVacio = (): BloqueForm => ({ clave: `n${++siguiente}`, nombre: '', minimo: '', maximo: '', opciones: [opcionVacia()] });

// copia: los bloques de otro producto sin sus ids, así se guardan como propios
const aBloques = (c: op.ConjuntoExtra | null, copia = false): BloqueForm[] => c ? c.bloques.map((g) => ({
  clave: `n${++siguiente}`, id: copia ? undefined : g.id, nombre: g.nombre,
  minimo: minimoDe(g) ? String(minimoDe(g)) : '', maximo: g.maximo ? String(g.maximo) : '',
  opciones: g.opciones.filter((o) => !copia || o.activo !== false).map((o) => ({
    id: copia ? undefined : o.id, nombre: o.nombre, precio: o.precio ? String(o.precio) : '', maximo: String(o.maximo ?? 1), producto_id: o.producto_id,
    obligatorio: !!o.obligatorio, exclusiva: !!o.exclusiva, activo: o.activo !== false,
    cantidad: o.cantidad ? String(o.cantidad) : '', unidad_medida_id: o.unidad_medida_id,
  })),
})) : [bloqueVacio()];

// «¿Cómo funciona?» (la misma explicación que la web)
const AYUDA = [
  'Los extras de cada producto van en bloques, como en las apps de delivery. Ej.: el Chocolate con 1. Tipo de leche (requerido, elige 1), 2. Azúcar (opcional, máximo 1) y 3. Extras (opcional). Son solo de este producto: cambiarlos no toca a ningún otro. Para no escribirlos de nuevo, usa «Copiar de otro producto».',
  'Requerido: no deja agregar el producto hasta elegir el mínimo. Opcional: se puede dejar sin elegir. Mínimo y máximo cuentan las opciones del bloque en total, contando cada vez que se repite una. Con máximo 1, tocar otra opción la cambia.',
  'Precio extra: se suma al producto (Deslactosada +$0.25). En blanco: gratis. Insumo: lo que se descuenta del inventario al venderse con esa opción (Leche entera 250 ml).',
  'Casillas de cada opción: Obligatorio siempre va marcada; Una sola al elegirla quita todas las demás del bloque; Activa apagada no sale al vender.',
];

/** Crear o editar los extras de un producto. producto null: se elige aquí (uno que aún no tenga). */
export function FormConjunto({ producto, conjunto, datos, onCerrar, onListo }: {
  producto: { id: number; nombre: string } | null; conjunto: op.ConjuntoExtra | null; datos: DatosExtras; onCerrar: () => void; onListo: () => void;
}) {
  const [productoId, setProductoId] = useState<number | null>(producto?.id ?? null);
  const [bloques, setBloques] = useState<BloqueForm[]>(() => aBloques(conjunto));
  const [copiando, setCopiando] = useState(false);
  const nombreProducto = producto?.nombre ?? datos.productos.find((p) => p.id === productoId)?.nombre;
  const otros = datos.conjuntos.filter((c) => c.producto_id !== productoId);
  const copiarDe = async (c: op.ConjuntoExtra) => {
    const conAlgo = bloques.some((b) => b.nombre.trim() || b.opciones.some((o) => o.nombre.trim()));
    if (conAlgo && !(await confirmar(`¿Usar los extras de «${c.producto}»?`, 'Reemplaza los bloques de aquí. Después puedes cambiarlos: son solo de este producto.', 'Copiar'))) return;
    setBloques(aBloques(c, true));
    setCopiando(false);
  };
  const [eligiendoInsumo, setEligiendoInsumo] = useState<string | null>(null); // «bloque-opción»
  const [buscarInsumo, setBuscarInsumo] = useState('');
  const [buscarProducto, setBuscarProducto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [verAyuda, setVerAyuda] = useState(false);

  const cambiarBloque = (n: number, c: Partial<BloqueForm>) => setBloques((bs) => bs.map((b, i) => (i === n ? { ...b, ...c } : b)));
  const cambiarOpcion = (n: number, k: number, c: Partial<OpcionForm>) =>
    setBloques((bs) => bs.map((b, i) => (i === n ? { ...b, opciones: b.opciones.map((o, j) => (j === k ? { ...o, ...c } : o)) } : b)));
  const moverBloque = (n: number, d: -1 | 1) => setBloques((bs) => {
    const lista = [...bs];
    [lista[n], lista[n + d]] = [lista[n + d], lista[n]];
    return lista;
  });
  const insumo = (id: number | null) => datos.insumos.find((x) => x.id === id);
  const insumosVisibles = useMemo(() => {
    const t = sinTildes(buscarInsumo.trim());
    return datos.insumos.filter((x) => !t || sinTildes(x.nombre).includes(t)).slice(0, 8);
  }, [buscarInsumo, datos.insumos]);
  // Para elegir el producto: solo los que aún no tienen extras
  const productosVisibles = useMemo(() => {
    const t = sinTildes(buscarProducto.trim());
    return datos.productos.filter((p) => !p.conjunto_id && (!t || sinTildes(p.nombre).includes(t))).slice(0, 8);
  }, [buscarProducto, datos.productos]);

  const malo = bloques.find((b) => b.maximo !== '' && (Number(b.minimo) || 0) > Number(b.maximo));
  const error = !productoId ? 'Elige el producto'
    : !bloques.length ? 'Agrega al menos un bloque'
      : bloques.some((b) => !b.nombre.trim()) ? 'Cada bloque necesita un nombre'
        : bloques.some((b) => !b.opciones.length || b.opciones.some((o) => !o.nombre.trim())) ? 'Cada bloque necesita opciones con nombre'
          : malo ? `«${malo.nombre}»: el mínimo no puede ser mayor que el máximo`
            : bloques.some((b) => b.opciones.some((o) => o.producto_id && (!(Number(o.cantidad) > 0) || !o.unidad_medida_id))) ? 'Indica cuánto y en qué unidad gasta cada opción con insumo'
              : null;

  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await op.guardarExtrasProducto(productoId!, bloques.map((b) => ({
          id: b.id, nombre: b.nombre.trim(),
          minimo: Number(b.minimo) || 0, maximo: b.maximo ? Math.max(1, Number(b.maximo) || 1) : null,
          opciones: b.opciones.map((o) => ({
            id: o.id, nombre: o.nombre.trim(), precio: Number(o.precio || 0), producto_id: o.producto_id,
            obligatorio: o.obligatorio, exclusiva: o.exclusiva, activo: o.activo,
            maximo: Math.min(20, Math.max(1, Math.floor(Number(o.maximo) || 1))),
            cantidad: o.producto_id ? Number(o.cantidad) : null, unidad_medida_id: o.producto_id ? o.unidad_medida_id : null,
          })),
        })));
      avisar(r.message ?? 'Extras guardados');
      onListo();
    } catch (err) {
      avisar('No se pudo guardar', mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Ventana visible titulo={nombreProducto ? `Extras de ${nombreProducto}` : 'Agregar extras a un producto'} onCerrar={onCerrar} ancho={820}
      pie={
        <View style={{ flex: 1, gap: 6 }}>
          {error && <Text style={{ color: C.peligro }}>{error}</Text>}
          <Boton titulo="Guardar extras" cargando={guardando} deshabilitado={!!error} onPress={guardar} />
        </View>
      }>
      <Pressable onPress={() => setVerAyuda((v) => !v)} hitSlop={8} accessibilityLabel="¿Cómo funciona?"
        style={[e.ayudaBoton, verAyuda && e.ayudaBotonActivo]}>
        <Text style={[e.ayudaBotonTexto, verAyuda && { color: '#fff' }]}>? ¿Cómo funciona?</Text>
      </Pressable>
      {verAyuda && (
        <View style={e.ayudaCaja}>
          {AYUDA.map((l) => <Text key={l} style={e.ayudaTexto}>{l}</Text>)}
        </View>
      )}
      {!producto && (
        <View style={{ gap: 6 }}>
          <Seccion titulo="Producto" />
          {productoId ? (
            <View style={e.chips}>
              <Pressable onPress={() => setProductoId(null)} style={e.chipActivo}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>{nombreProducto} ✕</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <TextInput style={e.buscar} value={buscarProducto} onChangeText={setBuscarProducto} placeholder="Buscar producto (solo los que aún no tienen extras)" placeholderTextColor={C.tenue} />
              {productosVisibles.map((p) => (
                <Pressable key={p.id} style={e.resultado} onPress={() => { setProductoId(p.id); setBuscarProducto(''); }}>
                  <Text style={e.texto}>{p.nombre}</Text>
                </Pressable>
              ))}
            </>
          )}
        </View>
      )}
      {otros.length > 0 && (
        copiando ? (
          <View style={{ gap: 6 }}>
            <Text style={e.suave}>Copiar los bloques de (después se cambian sin tocar al otro producto):</Text>
            {otros.map((c) => (
              <Pressable key={c.id} style={e.resultado} onPress={() => copiarDe(c)}>
                <Text style={e.texto}>{c.producto}</Text>
                <Text style={e.suave}>{c.bloques.map((b) => b.nombre).join(' · ')}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setCopiando(false)}><Text style={e.suave}>Cancelar</Text></Pressable>
          </View>
        ) : <Boton titulo="Copiar de otro producto" variante="contorno" chico onPress={() => setCopiando(true)} />
      )}

      {bloques.map((b, n) => {
        const min = Number(b.minimo) || 0;
        const max = b.maximo ? Number(b.maximo) : null;
        return (
          <View key={b.clave} style={e.bloque}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
              <Text style={[e.bloqueTitulo, { paddingBottom: 14 }]}>{n + 1}.</Text>
              <View style={{ flex: 1 }}><Campo etiqueta="Bloque" value={b.nombre} onChangeText={(t) => cambiarBloque(n, { nombre: t })} placeholder="Elige tu tipo de leche" maxLength={80} /></View>
            </View>
            <Opciones opciones={[{ valor: 'opcional', texto: 'Opcional' }, { valor: 'requerido', texto: 'Requerido' }]} valor={min > 0 ? 'requerido' : 'opcional'}
              onCambiar={(v) => cambiarBloque(n, { minimo: v === 'requerido' ? String(Math.max(1, min)) : '' })} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><Campo etiqueta="Mínimo" value={b.minimo} onChangeText={(t) => cambiarBloque(n, { minimo: t.replace(/[^0-9]/g, '').slice(0, 2) })} keyboardType="number-pad" placeholder="0" /></View>
              <View style={{ flex: 1 }}><Campo etiqueta="Máximo" value={b.maximo} onChangeText={(t) => cambiarBloque(n, { maximo: t.replace(/[^0-9]/g, '').slice(0, 2) })} keyboardType="number-pad" placeholder="Sin tope" /></View>
            </View>
            <Text style={e.suave}>Al vender: «{b.nombre.trim() || 'Bloque'}» · {min > 0 ? 'Requerido' : 'Opcional'}{reglaTexto({ minimo: min, maximo: max }) ? ` · ${reglaTexto({ minimo: min, maximo: max })}` : ''}{max === 1 ? ' (tocar otra la cambia)' : ''}</Text>

            {b.opciones.map((o, k) => {
              const clave = `${n}-${k}`;
              const ins = insumo(o.producto_id);
              const unidadesInsumo = datos.unidades.filter((u) => !ins?.tipo || u.tipo === ins.tipo);
              return (
                <View key={k} style={[e.opcion, !o.activo && { opacity: 0.6 }]}>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
                    <View style={{ flex: 2 }}><Campo etiqueta="Opción" value={o.nombre} onChangeText={(t) => cambiarOpcion(n, k, { nombre: t })} placeholder="Leche entera" maxLength={80} /></View>
                    <View style={{ flex: 1 }}><Campo etiqueta="Precio extra ($)" value={o.precio} onChangeText={(t) => cambiarOpcion(n, k, { precio: t.replace(/[^0-9.]/g, '') })} keyboardType="decimal-pad" placeholder="0.00" /></View>
                    <View style={{ width: 76 }}><Campo etiqueta="Máx." value={o.maximo} onChangeText={(t) => cambiarOpcion(n, k, { maximo: t.replace(/[^0-9]/g, '').slice(0, 2) })} keyboardType="number-pad" placeholder="1" /></View>
                    <Pressable onPress={() => cambiarBloque(n, { opciones: b.opciones.filter((_, j) => j !== k) })} hitSlop={8} style={{ paddingBottom: 14 }}>
                      <Text style={{ color: C.peligro, fontWeight: '700' }}>Quitar</Text>
                    </Pressable>
                  </View>
                  {ins ? (
                    <>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={[e.texto, { flex: 1 }]}>Descuenta: <Text style={{ fontWeight: '700' }}>{ins.nombre}</Text></Text>
                        <Pressable onPress={() => cambiarOpcion(n, k, { producto_id: null, cantidad: '', unidad_medida_id: null })} hitSlop={8}><Text style={{ color: C.peligro, fontWeight: '600' }}>No descontar</Text></Pressable>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <View style={{ width: 120 }}><Campo value={o.cantidad} onChangeText={(t) => cambiarOpcion(n, k, { cantidad: t.replace(/[^0-9.]/g, '') })} keyboardType="decimal-pad" placeholder="Cantidad" /></View>
                        <Opciones opciones={unidadesInsumo.map((u) => ({ valor: u.id, texto: u.abreviatura ?? u.nombre }))} valor={o.unidad_medida_id} onCambiar={(id) => cambiarOpcion(n, k, { unidad_medida_id: id })} />
                      </View>
                    </>
                  ) : eligiendoInsumo === clave ? (
                    <View style={{ gap: 6 }}>
                      <TextInput style={e.buscar} value={buscarInsumo} onChangeText={setBuscarInsumo} placeholder="Buscar insumo (leche, jarabe...)" placeholderTextColor={C.tenue} autoFocus />
                      {insumosVisibles.map((x) => (
                        <Pressable key={x.id} style={e.resultado} onPress={() => { cambiarOpcion(n, k, { producto_id: x.id, unidad_medida_id: x.unidad_medida_id }); setEligiendoInsumo(null); setBuscarInsumo(''); }}>
                          <Text style={e.texto}>{x.nombre}</Text><Text style={e.suave}>{x.unidad ?? ''}</Text>
                        </Pressable>
                      ))}
                      <Pressable onPress={() => setEligiendoInsumo(null)}><Text style={e.suave}>Cancelar</Text></Pressable>
                    </View>
                  ) : (
                    <Pressable onPress={() => { setEligiendoInsumo(clave); setBuscarInsumo(''); }} hitSlop={6}>
                      <Text style={e.enlace}>+ Descontar un insumo al venderla (opcional)</Text>
                    </Pressable>
                  )}
                  <Interruptor titulo="Obligatorio" detalle="Siempre va marcada y no se puede quitar" valor={o.obligatorio} onCambiar={(v) => cambiarOpcion(n, k, { obligatorio: v })} />
                  <Interruptor titulo="Una sola" detalle="Al elegirla se quitan todas las demás del bloque" valor={o.exclusiva} onCambiar={(v) => cambiarOpcion(n, k, { exclusiva: v })} />
                  <Interruptor titulo="Activa" detalle={o.activo ? 'Sale al vender' : 'Apagada: no sale al vender'} valor={o.activo} onCambiar={(v) => cambiarOpcion(n, k, { activo: v })} />
                </View>
              );
            })}
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Boton titulo="+ Opción" variante="contorno" chico onPress={() => cambiarBloque(n, { opciones: [...b.opciones, opcionVacia()] })} />
              <View style={{ flex: 1 }} />
              <Boton titulo="↑" variante="contorno" chico deshabilitado={n === 0} onPress={() => moverBloque(n, -1)} />
              <Boton titulo="↓" variante="contorno" chico deshabilitado={n === bloques.length - 1} onPress={() => moverBloque(n, 1)} />
              <Boton titulo="Quitar bloque" variante="contorno" chico onPress={() => setBloques((bs) => bs.filter((_, i) => i !== n))} />
            </View>
          </View>
        );
      })}
      <Boton titulo="+ Agregar bloque" variante="contorno" onPress={() => setBloques((bs) => [...bs, bloqueVacio()])} />

    </Ventana>
  );
}

const e = StyleSheet.create({
  ayudaBoton: { alignSelf: 'flex-end', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  ayudaBotonActivo: { backgroundColor: C.primario, borderColor: C.primario },
  ayudaBotonTexto: { fontSize: 13, fontWeight: '600', color: C.suave },
  ayudaCaja: { gap: 8, backgroundColor: '#EFF6FF', borderRadius: 8, padding: 12 },
  ayudaTexto: { fontSize: 13, lineHeight: 19, color: '#1E3A8A' },
  contenido: { padding: 12, gap: 10, maxWidth: 1000, width: '100%', alignSelf: 'center' },
  cabecera: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  vacio: { textAlign: 'center', color: C.suave, padding: 24 },
  tarjeta: { backgroundColor: '#fff', borderRadius: radio, borderWidth: 1, borderColor: C.borde, padding: 14, gap: 10 },
  titulo: { fontSize: 17, fontWeight: '800', color: C.texto },
  bloque: { gap: 8, padding: 12, borderRadius: radio, borderWidth: 2, borderColor: '#E5E7EB', backgroundColor: '#fff' },
  bloqueTitulo: { fontSize: 16, fontWeight: '800', color: C.texto },
  texto: { fontSize: 15, color: C.texto },
  suave: { fontSize: 13, color: C.suave },
  enlace: { fontSize: 14, fontWeight: '700', color: C.primario },
  opcion: { gap: 8, padding: 12, borderRadius: radio, borderWidth: 1, borderColor: C.borde, backgroundColor: '#FAFAFA' },
  buscar: { height: 48, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: radio, paddingHorizontal: 14, fontSize: 16, backgroundColor: '#fff', color: C.texto },
  resultado: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, borderRadius: radio, borderWidth: 1, borderColor: C.borde, backgroundColor: '#fff' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  chipActivo: { paddingHorizontal: 14, minHeight: 40, justifyContent: 'center', borderRadius: 999, backgroundColor: C.texto },
});
