// Extras (grupos de modificadores): Leche, Endulzante... cada opción con su precio y el insumo que descuenta
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Interruptor, Opciones, Seccion } from '@/components/formulario';
import { Boton, Campo, Etiqueta, Ventana } from '@/components/ui';
import { C, radio } from '@/constants/colores';
import { mensajeError } from '@/lib/api';
import { avisar } from '@/lib/aviso';
import { dinero } from '@/lib/formato';
import * as op from '@/lib/operaciones';
import { sinTildes } from '@/lib/texto';

type Datos = Awaited<ReturnType<typeof op.getGruposExtras>>;

export function ExtrasCatalogo() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [editando, setEditando] = useState<{ grupo: op.GrupoExtra | null } | null>(null);

  const cargar = useCallback(() => {
    op.getGruposExtras().then(setDatos).catch((err) => avisar('No se pudieron cargar los extras', mensajeError(err)));
  }, []);
  useEffect(cargar, [cargar]);

  return (
    <ScrollView contentContainerStyle={e.contenido}>
      <View style={e.cabecera}>
        <Text style={[e.suave, { flex: 1 }]}>
          Opciones que se eligen al tocar un producto (tipo de leche, endulzante, saborizante). Pueden subir el precio y descontar un insumo del inventario.
        </Text>
        <Boton titulo="+ Grupo de extras" onPress={() => setEditando({ grupo: null })} />
      </View>
      {!datos && <Text style={e.suave}>Cargando...</Text>}
      {datos?.grupos.length === 0 && <Text style={e.vacio}>Todavía no hay extras. Crea el primero, por ejemplo «Leche».</Text>}
      {datos?.grupos.map((g) => (
        <Pressable key={g.id} onPress={() => setEditando({ grupo: g })} style={({ pressed }) => [e.tarjeta, !g.activo && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={e.titulo}>{g.nombre}</Text>
            {g.obligatorio && <Etiqueta texto="Obligatorio" fondo="#FEF3C7" color="#92400E" />}
            <Etiqueta texto={g.multiple ? 'Varias opciones' : 'Una opción'} fondo="#E0F2FE" color="#075985" />
            {!g.activo && <Etiqueta texto="Inactivo" fondo="#E5E7EB" color="#374151" />}
          </View>
          <Text style={e.texto}>
            {g.opciones.filter((o) => o.activo !== false).map((o) => `${o.nombre}${o.precio > 0 ? ` +${dinero(o.precio)}` : ''}${o.insumo ? ` (${o.cantidad} ${o.unidad ?? ''} de ${o.insumo})` : ''}`).join(' · ')}
          </Text>
          <Text style={e.suave}>{g.productos.length ? `En: ${g.productos.map((p) => p.nombre).join(', ')}` : 'No está asignado a ningún producto'}</Text>
        </Pressable>
      ))}
      {editando && datos && <FormGrupo grupo={editando.grupo} datos={datos} onCerrar={() => setEditando(null)} onListo={() => { setEditando(null); cargar(); }} />}
    </ScrollView>
  );
}

interface OpcionForm { id?: number; nombre: string; precio: string; producto_id: number | null; cantidad: string; unidad_medida_id: number | null }

// «¿Cómo funciona?» del grupo de extras (la misma explicación que la web)
const AYUDA: { titulo: string; lineas: string[] }[] = [
  { titulo: 'Nombre', lineas: ['Corto, porque es lo que ve el mesero: «Salsa», «Leche», «Huevos». El producto al que aplica se elige abajo, en Productos (no hace falta escribirlo en el nombre).'] },
  { titulo: 'Obligatorio y Varias opciones', lineas: [
    'Obligatorio: no deja agregar el producto sin elegir una opción. Ej.: «Huevos» del desayuno (estrellados, revueltos).',
    'Varias opciones: encendido, se marcan varias a la vez (toppings: fresas y mantequilla). Apagado, solo una (salsa: Nutella o caramelo).',
  ] },
  { titulo: 'Precio extra', lineas: [
    'Lo que se suma al precio del producto si el cliente elige esa opción. Waffle $2.75 + Nutella (+$0.50) = $3.25.',
    'En blanco o $0.00: la opción es gratis, el precio no cambia. Sirve para opciones que ya van incluidas o que solo son instrucciones («Sin azúcar», «Revueltos»).',
  ] },
  { titulo: 'Insumo, cantidad y unidad', lineas: [
    'Lo que se descuenta del inventario cada vez que se vende el producto con esa opción. Nutella, 30 g: se vende un waffle con Nutella y bajan 30 g de Nutella.',
    'Aunque la opción sea gratis, el insumo se descuenta igual y su costo se suma al costo de la venta (así la utilidad es real). Si el insumo se acaba, la opción sale «Agotado» cuando no se permite stock negativo.',
    'Sin insumo: para instrucciones que no gastan nada.',
  ] },
  { titulo: 'Ejemplo: grupo «Salsa» para el Waffle', lineas: ['Opcional, una sola opción. Nutella +$0.50, insumo Nutella 30 g · Caramelo +$0.50, insumo Caramelo 30 g · Sin salsa (en blanco), sin insumo.'] },
];

function FormGrupo({ grupo, datos, onCerrar, onListo }: { grupo: op.GrupoExtra | null; datos: Datos; onCerrar: () => void; onListo: () => void }) {
  const [nombre, setNombre] = useState(grupo?.nombre ?? '');
  const [obligatorio, setObligatorio] = useState(grupo?.obligatorio ?? false);
  const [multiple, setMultiple] = useState(grupo?.multiple ?? false);
  const [activo, setActivo] = useState(grupo?.activo ?? true);
  const [opciones, setOpciones] = useState<OpcionForm[]>(
    grupo?.opciones.filter((o) => o.activo !== false).map((o) => ({
      id: o.id, nombre: o.nombre, precio: o.precio ? String(o.precio) : '', producto_id: o.producto_id,
      cantidad: o.cantidad ? String(o.cantidad) : '', unidad_medida_id: o.unidad_medida_id,
    })) ?? [{ nombre: '', precio: '', producto_id: null, cantidad: '', unidad_medida_id: null }]);
  const [productos, setProductos] = useState<number[]>(grupo?.productos.map((p) => p.id) ?? []);
  const [eligiendoInsumo, setEligiendoInsumo] = useState<number | null>(null);
  const [buscarInsumo, setBuscarInsumo] = useState('');
  const [buscarProducto, setBuscarProducto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [verAyuda, setVerAyuda] = useState(false);

  const cambiar = (i: number, c: Partial<OpcionForm>) => setOpciones((os) => os.map((o, j) => (j === i ? { ...o, ...c } : o)));
  const insumo = (id: number | null) => datos.insumos.find((x) => x.id === id);
  const insumosVisibles = useMemo(() => {
    const t = sinTildes(buscarInsumo.trim());
    return datos.insumos.filter((x) => !t || sinTildes(x.nombre).includes(t)).slice(0, 8);
  }, [buscarInsumo, datos.insumos]);
  const productosVisibles = useMemo(() => {
    const t = sinTildes(buscarProducto.trim());
    return t ? datos.productos.filter((p) => sinTildes(p.nombre).includes(t) && !productos.includes(p.id)).slice(0, 8) : [];
  }, [buscarProducto, datos.productos, productos]);

  const error = !nombre.trim() ? 'Ponle un nombre al grupo'
    : !opciones.length ? 'Agrega al menos una opción'
      : opciones.some((o) => !o.nombre.trim()) ? 'Cada opción necesita un nombre'
        : opciones.some((o) => o.producto_id && (!(Number(o.cantidad) > 0) || !o.unidad_medida_id)) ? 'Indica cuánto y en qué unidad gasta cada opción con insumo'
          : null;

  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await op.guardarGrupoExtras({
        nombre: nombre.trim(), obligatorio, multiple, activo, productos,
        opciones: opciones.map((o) => ({
          id: o.id, nombre: o.nombre.trim(), precio: Number(o.precio || 0), producto_id: o.producto_id,
          cantidad: o.producto_id ? Number(o.cantidad) : null, unidad_medida_id: o.producto_id ? o.unidad_medida_id : null,
        })),
      }, grupo?.id);
      avisar(r.message ?? 'Extras guardados');
      onListo();
    } catch (err) {
      avisar('No se pudo guardar', mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Ventana visible titulo={grupo ? `Editar ${grupo.nombre}` : 'Nuevo grupo de extras'} onCerrar={onCerrar} ancho={780}
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
          <Text style={e.ayudaTexto}>Un <Text style={e.negrita}>grupo</Text> son las opciones que se eligen al tocar un producto en la venta o la mesa (tipo de leche, salsa, cómo van los huevos). Salen en el ticket y en la comanda debajo del producto.</Text>
          {AYUDA.map((b) => (
            <View key={b.titulo} style={e.ayudaBloque}>
              <Text style={[e.ayudaTexto, e.negrita]}>{b.titulo}</Text>
              {b.lineas.map((l) => <Text key={l} style={e.ayudaTexto}>{l}</Text>)}
            </View>
          ))}
        </View>
      )}
      <Campo etiqueta="Nombre del grupo" value={nombre} onChangeText={setNombre} placeholder="Leche, Endulzante, Saborizante..." maxLength={80} />
      <Interruptor titulo="Obligatorio" detalle="No deja agregar el producto sin elegir una opción" valor={obligatorio} onCambiar={setObligatorio} />
      <Interruptor titulo="Varias opciones" detalle="Se puede elegir más de una (ej. saborizantes). Apagado: solo una (ej. tipo de leche)" valor={multiple} onCambiar={setMultiple} />
      {grupo && <Interruptor titulo="Activo" valor={activo} onCambiar={setActivo} />}

      <Seccion titulo="Opciones" />
      {opciones.map((o, i) => {
        const ins = insumo(o.producto_id);
        const unidadesInsumo = datos.unidades.filter((u) => !ins?.tipo || u.tipo === ins.tipo);
        return (
          <View key={i} style={e.opcion}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
              <View style={{ flex: 2 }}><Campo etiqueta="Opción" value={o.nombre} onChangeText={(t) => cambiar(i, { nombre: t })} placeholder="Deslactosada" maxLength={80} /></View>
              <View style={{ flex: 1 }}><Campo etiqueta="Precio extra ($)" value={o.precio} onChangeText={(t) => cambiar(i, { precio: t.replace(/[^0-9.]/g, '') })} keyboardType="decimal-pad" placeholder="0.00" /></View>
              <Pressable onPress={() => setOpciones((os) => os.filter((_, j) => j !== i))} hitSlop={8} style={{ paddingBottom: 14 }}>
                <Text style={{ color: C.peligro, fontWeight: '700' }}>Quitar</Text>
              </Pressable>
            </View>
            {ins ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={[e.texto, { flex: 1 }]}>Descuenta: <Text style={{ fontWeight: '700' }}>{ins.nombre}</Text></Text>
                  <Pressable onPress={() => cambiar(i, { producto_id: null, cantidad: '', unidad_medida_id: null })} hitSlop={8}><Text style={{ color: C.peligro, fontWeight: '600' }}>No descontar</Text></Pressable>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <View style={{ width: 120 }}><Campo value={o.cantidad} onChangeText={(t) => cambiar(i, { cantidad: t.replace(/[^0-9.]/g, '') })} keyboardType="decimal-pad" placeholder="Cantidad" /></View>
                  <Opciones opciones={unidadesInsumo.map((u) => ({ valor: u.id, texto: u.abreviatura ?? u.nombre }))} valor={o.unidad_medida_id} onCambiar={(id) => cambiar(i, { unidad_medida_id: id })} />
                </View>
              </>
            ) : eligiendoInsumo === i ? (
              <View style={{ gap: 6 }}>
                <TextInput style={e.buscar} value={buscarInsumo} onChangeText={setBuscarInsumo} placeholder="Buscar insumo (leche, jarabe...)" placeholderTextColor={C.tenue} autoFocus />
                {insumosVisibles.map((x) => (
                  <Pressable key={x.id} style={e.resultado} onPress={() => { cambiar(i, { producto_id: x.id, unidad_medida_id: x.unidad_medida_id }); setEligiendoInsumo(null); setBuscarInsumo(''); }}>
                    <Text style={e.texto}>{x.nombre}</Text><Text style={e.suave}>{x.unidad ?? ''}</Text>
                  </Pressable>
                ))}
                <Pressable onPress={() => setEligiendoInsumo(null)}><Text style={e.suave}>Cancelar</Text></Pressable>
              </View>
            ) : (
              <Pressable onPress={() => { setEligiendoInsumo(i); setBuscarInsumo(''); }} hitSlop={6}>
                <Text style={e.enlace}>+ Descontar un insumo al venderla (opcional)</Text>
              </Pressable>
            )}
          </View>
        );
      })}
      <Boton titulo="+ Agregar opción" variante="contorno" onPress={() => setOpciones((os) => [...os, { nombre: '', precio: '', producto_id: null, cantidad: '', unidad_medida_id: null }])} />

      <Seccion titulo="Productos que lo usan" />
      <View style={e.chips}>
        {productos.map((id) => (
          <Pressable key={id} onPress={() => setProductos((ps) => ps.filter((x) => x !== id))} style={e.chipActivo}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>{datos.productos.find((p) => p.id === id)?.nombre ?? `#${id}`} ✕</Text>
          </Pressable>
        ))}
        {productos.length === 0 && <Text style={e.suave}>Ninguno todavía: búscalos abajo.</Text>}
      </View>
      <TextInput style={e.buscar} value={buscarProducto} onChangeText={setBuscarProducto} placeholder="Buscar producto para asignarlo (Americano, Frappé...)" placeholderTextColor={C.tenue} />
      {productosVisibles.map((p) => (
        <Pressable key={p.id} style={e.resultado} onPress={() => { setProductos((ps) => [...ps, p.id]); setBuscarProducto(''); }}>
          <Text style={e.texto}>+ {p.nombre}</Text>
        </Pressable>
      ))}
    </Ventana>
  );
}

const e = StyleSheet.create({
  ayudaBoton: { alignSelf: 'flex-end', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  ayudaBotonActivo: { backgroundColor: C.primario, borderColor: C.primario },
  ayudaBotonTexto: { fontSize: 13, fontWeight: '600', color: C.suave },
  ayudaCaja: { gap: 8, backgroundColor: '#EFF6FF', borderRadius: 8, padding: 12 },
  ayudaBloque: { gap: 4, backgroundColor: '#fff', borderRadius: 6, borderWidth: 1, borderColor: '#DBEAFE', padding: 8 },
  ayudaTexto: { fontSize: 13, lineHeight: 19, color: '#1E3A8A' },
  negrita: { fontWeight: '700' },
  contenido: { padding: 12, gap: 10, maxWidth: 1000, width: '100%', alignSelf: 'center' },
  cabecera: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  vacio: { textAlign: 'center', color: C.suave, padding: 24 },
  tarjeta: { backgroundColor: '#fff', borderRadius: radio, borderWidth: 1, borderColor: C.borde, padding: 14, gap: 6 },
  titulo: { fontSize: 17, fontWeight: '800', color: C.texto },
  texto: { fontSize: 15, color: C.texto },
  suave: { fontSize: 13, color: C.suave },
  enlace: { fontSize: 14, fontWeight: '700', color: C.primario },
  opcion: { gap: 8, padding: 12, borderRadius: radio, borderWidth: 1, borderColor: C.borde, backgroundColor: '#FAFAFA' },
  buscar: { height: 48, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: radio, paddingHorizontal: 14, fontSize: 16, backgroundColor: '#fff', color: C.texto },
  resultado: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, borderRadius: radio, borderWidth: 1, borderColor: C.borde, backgroundColor: '#fff' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  chipActivo: { paddingHorizontal: 14, minHeight: 40, justifyContent: 'center', borderRadius: 999, backgroundColor: C.texto },
});
