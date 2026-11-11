// Recetas: de producción (pan) y las que se descuentan al vender (americano, desayuno), con su costo y margen
import { router, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Opciones, OpcionesBuscables, Seccion } from '@/components/formulario';
import { Boton, Campo, Etiqueta, Ventana } from '@/components/ui';
import { C, radio } from '@/constants/colores';
import { mensajeError } from '@/lib/api';
import { avisar } from '@/lib/aviso';
import { cantidad, dinero, fecha } from '@/lib/formato';
import * as op from '@/lib/operaciones';
import { useSesion } from '@/lib/sesion';
import { sinTildes } from '@/lib/texto';

type Uso = '' | 'venta' | 'produccion';

// Lo normal en una receta: materias primas y empaques (salen primero al buscar)
const esBasico = (clase: string) => clase === 'materia_prima' || clase === 'empaque';
type Catalogo = Awaited<ReturnType<typeof op.getCatalogoRecetas>>;

const USO: Record<string, { texto: string; fondo: string; color: string }> = {
  venta: { texto: 'Se descuenta al vender', fondo: '#DCFCE7', color: '#166534' },
  produccion: { texto: 'Producción', fondo: '#FEF3C7', color: '#92400E' },
};

export function RecetasCatalogo() {
  const { puede } = useSesion();
  const [lista, setLista] = useState<Awaited<ReturnType<typeof op.getRecetasTodas>> | null>(null);
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [uso, setUso] = useState<Uso>('');
  const [buscar, setBuscar] = useState('');
  const [detalle, setDetalle] = useState<op.RecetaDetalle | null>(null);
  const [verAyudaVersion, setVerAyudaVersion] = useState(false);
  const [editando, setEditando] = useState<{ receta: op.RecetaDetalle | null } | null>(null);

  const cargar = useCallback(() => {
    op.getRecetasTodas().then(setLista).catch((err) => avisar('No se pudieron cargar las recetas', mensajeError(err)));
    op.getCatalogoRecetas().then(setCatalogo).catch(() => null);
  }, []);
  useEffect(cargar, [cargar]);

  const visibles = useMemo(() => {
    const t = sinTildes(buscar.trim());
    return (lista ?? []).filter((r) => (!uso || r.uso === uso) && (!t || sinTildes(`${r.producto ?? ''} ${r.nombre}`).includes(t)));
  }, [lista, uso, buscar]);
  const cuenta = (u: Uso) => (lista ?? []).filter((r) => !u || r.uso === u).length;

  const abrir = (id: number) => op.getReceta(id).then(setDetalle).catch((err) => avisar('No se pudo abrir', mensajeError(err)));
  const activar = async (id: number) => {
    try {
      const r = await op.activarReceta(id);
      avisar(r.message);
      cargar();
      abrir(id);
    } catch (err) {
      avisar('No se pudo activar', mensajeError(err));
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={e.barra}>
        <TextInput style={[e.buscar, { flex: 1, minWidth: 220 }]} value={buscar} onChangeText={setBuscar} placeholder="Buscar receta o producto" placeholderTextColor={C.tenue} />
        <Boton titulo="+ Receta" deshabilitado={!catalogo} onPress={() => setEditando({ receta: null })} />
      </View>
      <View style={[e.barra, { paddingTop: 8 }]}>
        <Opciones valor={uso} onCambiar={setUso} opciones={[
          { valor: '', texto: `Todas (${cuenta('')})` },
          { valor: 'venta', texto: `Se descuenta al vender (${cuenta('venta')})` },
          { valor: 'produccion', texto: `Producción (${cuenta('produccion')})` },
        ]} />
      </View>
      <FlatList
        data={visibles}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={e.lista}
        ListEmptyComponent={<Text style={e.vacio}>{lista ? 'No hay recetas con ese filtro.' : 'Cargando...'}</Text>}
        renderItem={({ item: r }) => (
          <Pressable onPress={() => abrir(r.id)} style={({ pressed }) => [e.tarjeta, pressed && { opacity: 0.85 }]}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={e.titulo}>{r.producto ?? r.nombre}</Text>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <Etiqueta {...USO[r.uso]} />
                <Text style={e.suave}>rinde {cantidad(r.rendimiento)} {r.unidad ?? ''}</Text>
              </View>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <Text style={e.texto}>costo {dinero(r.costo_unitario)}</Text>
              {r.margen != null && <Text style={[e.suave, r.margen < 0 && { color: C.peligro }]}>margen {r.margen}%</Text>}
            </View>
          </Pressable>
        )}
      />

      {detalle && (
        <Ventana visible titulo={detalle.producto ?? detalle.nombre} ancho={720} onCerrar={() => setDetalle(null)}
          subtitulo={`${USO[detalle.uso].texto} · versión ${detalle.version}${detalle.activa ? ' (activa)' : ' (inactiva)'} · rinde ${cantidad(detalle.rendimiento)} ${detalle.unidad ?? ''}`}
          pie={<>
            {puede('produccion.registrar') && detalle.activa && detalle.uso !== 'venta' && (
              <Boton estilo={{ flex: 1 }} titulo="Producir" variante="exito"
                onPress={() => { const id = detalle.id; setDetalle(null); router.push({ pathname: '/produccion', params: { receta: String(id) } } as Href); }} />
            )}
            <Boton estilo={{ flex: 1 }} titulo="Editar receta" onPress={() => { setEditando({ receta: detalle }); setDetalle(null); }} deshabilitado={!catalogo} />
          </>}>
          <Pressable onPress={() => setVerAyudaVersion((v) => !v)} hitSlop={8} accessibilityLabel="¿Qué es la versión?"
            style={[e.ayudaBoton, { alignSelf: 'flex-start', marginTop: 0 }, verAyudaVersion && e.ayudaBotonActivo]}>
            <Text style={[e.ayudaBotonTexto, verAyudaVersion && { color: '#fff' }]}>? ¿Qué es la versión {detalle.version}?</Text>
          </Pressable>
          {verAyudaVersion && (
            <View style={e.ayudaCaja}>
            <Text style={e.ayudaTexto}>El sistema guarda el historial de cada receta para que el costo de lo que ya se horneó no cambie después.</Text>
            <Text style={e.ayudaTexto}><Text style={{ fontWeight: '700' }}>Al crearla:</Text> la receta queda como versión 1.</Text>
            <Text style={e.ayudaTexto}><Text style={{ fontWeight: '700' }}>Al editarla sin haberla usado:</Text> se corrige ahí mismo y sigue siendo la misma versión.</Text>
            <Text style={e.ayudaTexto}><Text style={{ fontWeight: '700' }}>Al editarla después de usarla:</Text> se crea la versión siguiente (2, 3…) y la anterior queda en el historial, con lo que se gastó y su costo de entonces.</Text>
              <View style={e.ayudaEjemplo}>
                <Text style={[e.ayudaTexto, { fontWeight: '700' }]}>Ejemplo: Pan francés</Text>
                <Text style={e.ayudaTexto}>Ayer horneaste 100 panes con la versión 1 (10 lb de harina). Hoy cambias la receta a 11 lb: se crea la versión 2 y lo que hornees desde ahora usa 11 lb. La producción de ayer sigue mostrando 10 lb y su costo de ayer.</Text>
              </View>
              <Text style={e.ayudaTexto}><Text style={{ fontWeight: '700' }}>Volver atrás:</Text> si el cambio salió mal, abre la receta y en Versiones toca «Usar esta» en la anterior. Solo una versión está activa a la vez.</Text>
            </View>
          )}
          {detalle.ingredientes.map((i, n) => (
            <View key={n} style={e.fila}>
              <Text style={[e.texto, { flex: 1 }]}>{i.producto}</Text>
              <Text style={e.texto}>{cantidad(i.cantidad)} {i.unidad}{i.merma_porcentaje ? ` +${i.merma_porcentaje}%` : ''}</Text>
              <Text style={[e.suave, { minWidth: 70, textAlign: 'right' }]}>{dinero(i.costo)}</Text>
            </View>
          ))}
          <View style={e.fila}><Text style={[e.titulo, { flex: 1 }]}>Costo de la tanda</Text><Text style={e.titulo}>{dinero(detalle.costo_total)}</Text></View>
          <View style={e.fila}>
            <Text style={[e.texto, { flex: 1 }]}>Por {detalle.unidad ?? 'unidad'} · precio {dinero(detalle.precio_venta)}</Text>
            <Text style={e.texto}>{dinero(detalle.costo_unitario)}{detalle.margen != null ? ` · margen ${detalle.margen}%` : ''}</Text>
          </View>
          {detalle.notas ? <Text style={e.suave}>Notas: {detalle.notas}</Text> : null}
          {detalle.versiones.length > 1 && (
            <>
              <Seccion titulo="Versiones" />
              {detalle.versiones.map((v) => (
                <View key={v.id} style={e.fila}>
                  <Text style={[e.texto, { flex: 1 }]}>Versión {v.version} · {fecha(v.actualizada)}</Text>
                  {v.activa ? <Etiqueta texto="Activa" fondo="#DCFCE7" color="#166534" />
                    : <Pressable onPress={() => activar(v.id)} hitSlop={8}><Text style={e.enlace}>Usar esta</Text></Pressable>}
                </View>
              ))}
            </>
          )}
        </Ventana>
      )}

      {editando && catalogo && <FormReceta receta={editando.receta} catalogo={catalogo} onCerrar={() => setEditando(null)}
        onListo={(id) => { setEditando(null); cargar(); abrir(id); }} />}
    </View>
  );
}

interface IngForm { producto_id: number; unidad_medida_id: number; cantidad: string; merma: string }

function FormReceta({ receta, catalogo, onCerrar, onListo }: { receta: op.RecetaDetalle | null; catalogo: Catalogo; onCerrar: () => void; onListo: (id: number) => void }) {
  const [productoId, setProductoId] = useState<number | null>(receta?.producto_id ?? null);
  const [rendimiento, setRendimiento] = useState(receta ? String(receta.rendimiento) : '1');
  const [notas, setNotas] = useState(receta?.notas ?? '');
  const [ingredientes, setIngredientes] = useState<IngForm[]>(receta?.ingredientes.map((i) => ({
    producto_id: i.producto_id, unidad_medida_id: i.unidad_medida_id, cantidad: String(i.cantidad), merma: i.merma_porcentaje ? String(i.merma_porcentaje) : '',
  })) ?? []);
  const [buscarProducto, setBuscarProducto] = useState('');
  const [buscarInsumo, setBuscarInsumo] = useState('');
  const [guardando, setGuardando] = useState(false);

  const prod = (id: number | null) => catalogo.productos.find((p) => p.id === id);
  const unidad = (id: number | null) => catalogo.unidades.find((u) => u.id === id);
  const producto = prod(productoId);
  // El sistema decide el tipo: sin inventario propio se descuenta al vender; con inventario, se usa al producir
  const deVenta = producto ? !producto.controla_stock : false;

  const productosBuscados = useMemo(() => {
    const t = sinTildes(buscarProducto.trim());
    return t ? catalogo.productos.filter((p) => sinTildes(p.nombre).includes(t)).slice(0, 8) : [];
  }, [buscarProducto, catalogo.productos]);
  // Ingredientes: todo lo que lleva inventario (sin inventario no hay nada que descontar).
  // Primero materias primas y empaques; después horneados y reventa (pan del desayuno, lata del combo)
  const insumosBuscados = useMemo(() => {
    const t = sinTildes(buscarInsumo.trim());
    if (!t) return [];
    const prioridad = (clase: string) => (esBasico(clase) ? 0 : 1);
    return catalogo.productos
      .filter((p) => p.id !== productoId && p.controla_stock && sinTildes(p.nombre).includes(t) && !ingredientes.some((i) => i.producto_id === p.id))
      .sort((a, b) => prioridad(a.clase) - prioridad(b.clase) || a.nombre.localeCompare(b.nombre))
      .slice(0, 8);
  }, [buscarInsumo, catalogo.productos, productoId, ingredientes]);
  const [verAyudaMerma, setVerAyudaMerma] = useState(false);

  // Costo en vivo: la cantidad se pasa a la unidad del insumo con la equivalencia de cada unidad
  const costoDe = (i: IngForm) => {
    const ins = prod(i.producto_id);
    const u = unidad(i.unidad_medida_id);
    const base = unidad(ins?.unidad_medida_id ?? null);
    if (!ins || !u || !base || !base.factor_base) return 0;
    return Number(i.cantidad || 0) * (u.factor_base / base.factor_base) * (1 + Number(i.merma || 0) / 100) * ins.costo_unitario;
  };
  const total = ingredientes.reduce((t, i) => t + costoDe(i), 0);
  const porUnidad = Number(rendimiento) > 0 ? total / Number(rendimiento) : 0;
  const margen = producto && producto.precio_venta > 0 ? Math.round(((producto.precio_venta - porUnidad) / producto.precio_venta) * 1000) / 10 : null;

  const cambiar = (n: number, c: Partial<IngForm>) => setIngredientes((is) => is.map((x, j) => (j === n ? { ...x, ...c } : x)));
  const error = !producto ? 'Elige el producto de la receta'
    : !(Number(rendimiento) > 0) ? 'Indica cuánto rinde'
      : !ingredientes.length ? 'Agrega al menos un ingrediente'
        : ingredientes.some((i) => !(Number(i.cantidad) > 0)) ? 'Todas las cantidades deben ser mayores a 0'
          : null;

  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await op.guardarReceta({
        producto_id: productoId!, rendimiento: Number(rendimiento), notas: notas.trim() || undefined,
        ingredientes: ingredientes.map((i) => ({ producto_id: i.producto_id, unidad_medida_id: i.unidad_medida_id, cantidad: Number(i.cantidad), merma_porcentaje: Number(i.merma || 0) })),
      }, receta?.id);
      avisar(r.message);
      onListo(r.receta.id);
    } catch (err) {
      avisar('No se pudo guardar', mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Ventana visible titulo={receta ? `Editar receta de ${receta.producto}` : 'Nueva receta'} onCerrar={onCerrar} ancho={800}
      pie={
        <View style={{ flex: 1, gap: 6 }}>
          {error && <Text style={{ color: C.peligro }}>{error}</Text>}
          <Boton titulo="Guardar receta" cargando={guardando} deshabilitado={!!error} onPress={guardar} />
        </View>
      }>
      <Seccion titulo="Producto" />
      {producto ? (
        <View style={e.fila}>
          <Text style={[e.titulo, { flex: 1 }]}>{producto.nombre}</Text>
          {!receta && <Pressable onPress={() => setProductoId(null)} hitSlop={8}><Text style={{ color: C.peligro, fontWeight: '700' }}>Cambiar</Text></Pressable>}
        </View>
      ) : (
        <>
          <TextInput style={e.buscar} value={buscarProducto} onChangeText={setBuscarProducto} placeholder="Buscar el producto (Pan francés, Americano...)" placeholderTextColor={C.tenue} autoFocus />
          {productosBuscados.map((p) => (
            <Pressable key={p.id} style={e.resultado} onPress={() => { setProductoId(p.id); setBuscarProducto(''); if (!p.controla_stock) setRendimiento('1'); }}>
              <Text style={e.texto}>{p.nombre}</Text><Text style={e.suave}>{p.controla_stock ? 'con inventario' : 'sin inventario'}</Text>
            </Pressable>
          ))}
        </>
      )}
      {producto && (
        <Text style={[e.aviso, deVenta ? { backgroundColor: '#DCFCE7', color: '#166534' } : { backgroundColor: '#FEF3C7', color: '#92400E' }]}>
          {deVenta
            ? 'Se descuenta al vender: cada vez que se vende, salen estos ingredientes del inventario. Normalmente rinde 1.'
            : 'Receta de producción: se usa al registrar lo que se hizo en Producción (descuenta los insumos y suma el producto).'}
        </Text>
      )}

      <Campo etiqueta={`Rinde (${producto?.unidad ?? 'unidades'} por tanda)`} value={rendimiento} keyboardType="decimal-pad"
        onChangeText={(t) => setRendimiento(t.replace(/[^0-9.]/g, ''))} />

      <View style={e.cabeceraIng}>
        <Seccion titulo="Ingredientes" />
        <Pressable onPress={() => setVerAyudaMerma((v) => !v)} hitSlop={8} accessibilityLabel="¿Qué es la merma?"
          style={[e.ayudaBoton, verAyudaMerma && e.ayudaBotonActivo]}>
          <Text style={[e.ayudaBotonTexto, verAyudaMerma && { color: '#fff' }]}>? ¿Qué es la merma?</Text>
        </Pressable>
      </View>
      {verAyudaMerma && (
        <View style={e.ayudaCaja}>
          <Text style={e.ayudaTexto}><Text style={{ fontWeight: '700' }}>Merma</Text> es lo que se pierde al preparar y no llega al producto: cáscaras, semillas, masa que se queda en la batidora, lo que se derrama o se quema. Se escribe como porcentaje de la cantidad de la receta y el sistema descuenta esa cantidad extra del inventario y la suma al costo.</Text>
          <View style={e.ayudaEjemplo}>
            <Text style={[e.ayudaTexto, { fontWeight: '700' }]}>Ejemplo: limones de la limonada</Text>
            <Text style={e.ayudaTexto}>La receta lleva 4 limones, pero de cada 10 sale uno seco o malo. Con 10 % de merma se descuentan 4.4 limones por limonada y el costo sube de $0.40 a $0.44.</Text>
          </View>
          <View style={e.ayudaEjemplo}>
            <Text style={[e.ayudaTexto, { fontWeight: '700' }]}>Ejemplo: fresas del topping</Text>
            <Text style={e.ayudaTexto}>Se sirven 50 g, pero al quitar hojas y partes feas se pierde un 20 %. Con 20 % de merma se descuentan 60 g del inventario.</Text>
          </View>
          <Text style={e.ayudaTexto}><Text style={{ fontWeight: '700' }}>Cuándo dejarla vacía:</Text> en lo que se usa entero y no se pierde (huevo, vaso, una lata), o si la cantidad de la receta ya incluye lo que se desperdicia.</Text>
          <Text style={e.ayudaTexto}><Text style={{ fontWeight: '700' }}>Para qué sirve:</Text> que el inventario del sistema coincida con lo que hay de verdad en la bodega y que el costo de cada producto sea el real. Si al contar la bodega siempre falta un ingrediente, súbele un poco la merma.</Text>
        </View>
      )}
      {ingredientes.map((i, n) => {
        const ins = prod(i.producto_id);
        const tipos = catalogo.unidades.filter((u) => !ins?.unidad_tipo || u.tipo === ins.unidad_tipo);
        return (
          <View key={i.producto_id} style={e.ingrediente}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={[e.titulo, { flex: 1 }]}>{ins?.nombre ?? `#${i.producto_id}`}</Text>
              <Text style={e.suave}>{dinero(costoDe(i))}</Text>
              <Pressable onPress={() => setIngredientes((is) => is.filter((_, j) => j !== n))} hitSlop={8}><Text style={{ color: C.peligro, fontWeight: '700' }}>Quitar</Text></Pressable>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <View style={{ width: 110 }}><Campo value={i.cantidad} onChangeText={(t) => cambiar(n, { cantidad: t.replace(/[^0-9.]/g, '') })} keyboardType="decimal-pad" placeholder="Cantidad" /></View>
              <View style={{ flexBasis: '100%' }}>
                <OpcionesBuscables opciones={tipos.map((u) => ({ valor: u.id, texto: u.abreviatura ?? u.nombre, detalle: u.abreviatura ? u.nombre : undefined }))}
                  valor={i.unidad_medida_id} onCambiar={(id) => cambiar(n, { unidad_medida_id: id })} placeholder="Buscar unidad" />
              </View>
              <View style={{ width: 110 }}><Campo value={i.merma} onChangeText={(t) => cambiar(n, { merma: t.replace(/[^0-9.]/g, '') })} keyboardType="decimal-pad" placeholder="% merma" /></View>
            </View>
          </View>
        );
      })}
      <TextInput style={e.buscar} value={buscarInsumo} onChangeText={setBuscarInsumo} placeholderTextColor={C.tenue}
        placeholder="Agregar ingrediente (materia prima, empaque u otro producto con inventario)" />
      {insumosBuscados.map((p) => (
        <Pressable key={p.id} style={e.resultado} onPress={() => {
          if (p.unidad_medida_id) setIngredientes((is) => [...is, { producto_id: p.id, unidad_medida_id: p.unidad_medida_id!, cantidad: '', merma: '' }]);
          setBuscarInsumo('');
        }}>
          <Text style={e.texto}>+ {p.nombre}</Text>
          <Text style={[e.clase, esBasico(p.clase) ? e.claseBasica : e.claseOtra]}>{op.CLASES[p.clase] ?? p.clase}</Text>
          <Text style={e.suave}>{p.unidad ?? ''} · {dinero(p.costo_unitario)}/{p.unidad ?? 'u'}</Text>
        </Pressable>
      ))}

      <View style={e.totales}>
        <Text style={e.texto}>Costo de la tanda <Text style={e.titulo}>{dinero(total)}</Text></Text>
        <Text style={e.texto}>Por {producto?.unidad ?? 'unidad'} <Text style={e.titulo}>{dinero(porUnidad)}</Text></Text>
        {margen !== null && <Text style={[e.texto, margen < 0 && { color: C.peligro }]}>Margen <Text style={e.titulo}>{margen}%</Text> con precio {dinero(producto?.precio_venta)}</Text>}
      </View>
      <Campo etiqueta="Procedimiento o notas" value={notas} onChangeText={setNotas} maxLength={1000} multiline style={{ minHeight: 80, textAlignVertical: 'top' }} />
      {receta && <Text style={e.suave}>Si esta receta ya se usó, al guardar se crea una versión nueva y la anterior queda en el historial.</Text>}
    </Ventana>
  );
}

const e = StyleSheet.create({
  clase: { fontSize: 12, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden', alignSelf: 'center' },
  claseBasica: { backgroundColor: '#F3F4F6', color: '#4B5563' },
  claseOtra: { backgroundColor: '#FEF3C7', color: '#92400E' },
  cabeceraIng: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  ayudaBoton: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginTop: 6 },
  ayudaBotonActivo: { backgroundColor: C.primario, borderColor: C.primario },
  ayudaBotonTexto: { fontSize: 13, fontWeight: '600', color: C.suave },
  ayudaCaja: { gap: 8, backgroundColor: '#EFF6FF', borderRadius: 8, padding: 12 },
  ayudaTexto: { fontSize: 13, lineHeight: 19, color: '#1E3A8A' },
  ayudaEjemplo: { gap: 4, backgroundColor: '#fff', borderRadius: 6, borderWidth: 1, borderColor: '#DBEAFE', padding: 8 },
  barra: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center', paddingHorizontal: 12, paddingTop: 12, maxWidth: 1000, width: '100%', alignSelf: 'center' },
  buscar: { height: 48, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: radio, paddingHorizontal: 14, fontSize: 16, backgroundColor: '#fff', color: C.texto },
  lista: { padding: 12, gap: 8, maxWidth: 1000, width: '100%', alignSelf: 'center' },
  vacio: { textAlign: 'center', color: C.suave, padding: 24 },
  tarjeta: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: '#fff', borderRadius: radio, borderWidth: 1, borderColor: C.borde, padding: 14 },
  titulo: { fontSize: 16, fontWeight: '700', color: C.texto },
  texto: { fontSize: 15, color: C.texto },
  suave: { fontSize: 13, color: C.suave },
  enlace: { fontSize: 14, fontWeight: '700', color: C.primario },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderColor: C.borde },
  resultado: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, borderRadius: radio, borderWidth: 1, borderColor: C.borde, backgroundColor: '#fff' },
  aviso: { padding: 10, borderRadius: radio, fontSize: 14, overflow: 'hidden' },
  ingrediente: { gap: 8, padding: 12, borderRadius: radio, borderWidth: 1, borderColor: C.borde, backgroundColor: '#FAFAFA' },
  totales: { gap: 4, padding: 12, borderRadius: radio, backgroundColor: '#F3F4F6' },
});
