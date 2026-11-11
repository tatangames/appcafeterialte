// Productos: lista con buscador y el formulario completo (clase, precio, inventario, cómo se ve en el POS)
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AyudaClases } from '@/components/catalogo/ayudaClases';
import { BloquesProducto } from '@/components/catalogo/bloquesProducto';
import { Interruptor, Opciones, Seccion } from '@/components/formulario';
import { Boton, Campo, Etiqueta, Ventana } from '@/components/ui';
import { C, radio } from '@/constants/colores';
import { mensajeError } from '@/lib/api';
import { avisar } from '@/lib/aviso';
import { cantidad, dinero } from '@/lib/formato';
import * as op from '@/lib/operaciones';
import { useSesion } from '@/lib/sesion';
import { sinTildes } from '@/lib/texto';

const COLORES = ['#2563EB', '#16A34A', '#DC2626', '#D97706', '#7C3AED', '#DB2777', '#0891B2', '#78350F', '#4B5563', '#111827'];

// Lo que se sugiere al elegir la clase (después se puede cambiar), igual que en la web
const sugeridoPorClase = (clase: string) =>
  clase === 'materia_prima' ? { se_vende: false, controla_stock: true, permite_fraccion: true }
    : clase === 'empaque' ? { se_vende: false, controla_stock: true, permite_fraccion: false }
      : { se_vende: true, controla_stock: true, permite_fraccion: false };

export function ProductosCatalogo() {
  const { puede } = useSesion();
  const [lista, setLista] = useState<op.ProductoTabla[] | null>(null);
  const [buscar, setBuscar] = useState('');
  const [clase, setClase] = useState('');
  const [formulario, setFormulario] = useState<{ producto: op.ProductoEditar | null } | null>(null);

  const cargar = useCallback(() => {
    op.getProductosTabla().then(setLista).catch((err) => avisar('No se pudieron cargar los productos', mensajeError(err)));
  }, []);
  useEffect(cargar, [cargar]);

  const visibles = useMemo(() => {
    const t = sinTildes(buscar.trim());
    return (lista ?? []).filter((p) => (!clase || p.clase === clase)
      && (!t || sinTildes(p.nombre).includes(t) || p.codigo_barras === t || p.sku?.toLowerCase() === t));
  }, [lista, buscar, clase]);

  const abrir = (id: number) => op.getProductoEditar(id).then((p) => setFormulario({ producto: p })).catch((err) => avisar('No se pudo abrir', mensajeError(err)));
  const gestiona = puede('productos.gestionar');

  return (
    <View style={{ flex: 1 }}>
      <View style={e.barra}>
        <TextInput style={[e.buscar, { flex: 1, minWidth: 220 }]} value={buscar} onChangeText={setBuscar} placeholder="Buscar por nombre o código" placeholderTextColor={C.tenue} />
        {gestiona && <Boton titulo="+ Producto" onPress={() => setFormulario({ producto: null })} />}
      </View>
      <View style={[e.barra, { paddingTop: 8 }]}>
        <Opciones opciones={[{ valor: '', texto: 'Todas las clases' }, ...Object.entries(op.CLASES).map(([v, t]) => ({ valor: v, texto: t }))]}
          valor={clase} onCambiar={setClase} />
      </View>
      <FlatList
        data={visibles}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={e.lista}
        ListEmptyComponent={<Text style={e.vacio}>{lista ? 'Ningún producto coincide.' : 'Cargando...'}</Text>}
        renderItem={({ item: p }) => (
          <Pressable onPress={() => gestiona && abrir(p.id)} style={({ pressed }) => [e.tarjeta, !p.activo && { opacity: 0.5 }, pressed && { opacity: 0.8 }]}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={e.titulo}>{p.nombre}</Text>
              <Text style={e.suave}>{[op.CLASES[p.clase] ?? p.clase, p.categorias.join(', '), p.unidad_abrev].filter(Boolean).join(' · ')}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={e.precio}>{p.consumo_interno ? 'Consumo interno' : p.se_vende ? dinero(p.precio_venta) : `costo ${dinero(p.costo_unitario)}`}</Text>
              {p.controla_stock && <Text style={e.suave}>hay {cantidad(p.stock_actual ?? 0)} {p.unidad_abrev ?? ''}</Text>}
              {!p.activo && <Etiqueta texto="Inactivo" fondo="#E5E7EB" color="#374151" />}
            </View>
          </Pressable>
        )}
      />
      {formulario && <FormProducto producto={formulario.producto} onCerrar={() => setFormulario(null)} onGuardado={() => { setFormulario(null); cargar(); }} />}
    </View>
  );
}

function FormProducto({ producto, onCerrar, onGuardado }: { producto: op.ProductoEditar | null; onCerrar: () => void; onGuardado: () => void }) {
  const { puede } = useSesion();
  // Al crear se fija el precio inicial; cambiarlo después necesita el permiso de precios
  const fijaPrecio = !producto || puede('productos.precios');
  const [unidades, setUnidades] = useState<op.UnidadMedida[]>([]);
  const [categorias, setCategorias] = useState<op.Categoria[]>([]);
  const [d, setD] = useState({
    nombre: producto?.nombre ?? '', descripcion: producto?.descripcion ?? '', codigo_barras: producto?.codigo_barras ?? '',
    clase: producto?.clase ?? 'producto_terminado', se_vende: producto?.se_vende ?? true, consumo_interno: !!producto?.consumo_interno,
    controla_stock: producto?.controla_stock ?? true, permite_fraccion: producto?.permite_fraccion ?? false,
    permite_sin_existencia: !!producto?.permite_sin_existencia,
    imprime_comanda: producto?.imprime_comanda ?? true,
    costo: producto ? String(Number(producto.costo_unitario)) : '', precio: producto ? String(Number(producto.precio_venta)) : '',
    stock_minimo: producto?.stock_minimo ? String(producto.stock_minimo) : '', color: producto?.color_pos ?? null as string | null,
    unidad_medida_id: producto?.unidad_medida_id ?? null as number | null, categorias: producto?.categorias ?? [] as number[],
    activo: producto?.activo ?? true,
  });
  const [guardando, setGuardando] = useState(false);
  const [verAyudaClase, setVerAyudaClase] = useState(false);
  const cambiar = (c: Partial<typeof d>) => setD((x) => ({ ...x, ...c }));

  useEffect(() => {
    op.getUnidades().then((u) => setUnidades(u.filter((x) => x.estado || x.id === producto?.unidad_medida_id))).catch(() => null);
    op.getCategorias().then((c) => setCategorias(c.filter((x) => x.estado || producto?.categorias.includes(x.id)))).catch(() => null);
  }, [producto]);

  const costo = Number(d.costo || 0);
  const precio = Number(d.precio || 0);
  const margen = precio > 0 ? Math.round(((precio - costo) / precio) * 1000) / 10 : null;
  const sinInventario = !d.controla_stock;
  const area = categorias.find((c) => d.categorias.includes(c.id) && c.area)?.area?.nombre;

  const error = !d.nombre.trim() ? 'Escribe el nombre'
    : !d.unidad_medida_id ? 'Elige la unidad de medida'
      : d.costo === '' ? 'Escribe el costo (puede ser 0)'
        : d.se_vende && !d.consumo_interno && precio <= 0 ? 'Escribe el precio de venta: el producto se vende en el POS'
          : null;

  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await op.guardarProducto({
        nombre: d.nombre.trim(), descripcion: d.descripcion.trim() || null, codigo_barras: d.codigo_barras.trim() || null,
        clase: d.clase, se_vende: d.se_vende || d.consumo_interno, consumo_interno: d.consumo_interno,
        controla_stock: d.controla_stock, permite_fraccion: d.permite_fraccion, imprime_comanda: d.imprime_comanda,
        permite_sin_existencia: d.controla_stock && d.permite_sin_existencia,
        costo_unitario: costo, precio_venta: d.consumo_interno ? 0 : precio,
        stock_minimo: Number(d.stock_minimo || 0), orden_pos: producto?.orden_pos ?? 0, color_pos: d.color,
        unidad_medida_id: d.unidad_medida_id!, categorias: d.categorias, ...(producto ? { activo: d.activo } : {}),
      }, producto?.id);
      avisar(r.message);
      onGuardado();
    } catch (err) {
      avisar('No se pudo guardar', mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };

  const porTipo = (t: string) => unidades.filter((u) => u.tipo === t).map((u) => ({ valor: u.id, texto: u.abreviatura ? `${u.nombre} (${u.abreviatura})` : u.nombre }));

  return (
    <Ventana visible titulo={producto ? `Editar ${producto.nombre}` : 'Nuevo producto'} onCerrar={onCerrar} ancho={760}
      pie={
        <View style={{ flex: 1, gap: 6 }}>
          {error && <Text style={{ color: C.peligro }}>{error}</Text>}
          <Boton titulo="Guardar producto" cargando={guardando} deshabilitado={!!error} onPress={guardar} />
        </View>
      }>
      <Campo etiqueta="Nombre *" value={d.nombre} onChangeText={(t) => cambiar({ nombre: t })} placeholder="Pan francés" maxLength={300} />

      <View style={e.claseCabecera}>
        <Seccion titulo="Clase" />
        <Pressable onPress={() => setVerAyudaClase((v) => !v)} hitSlop={8} accessibilityLabel="¿Qué clase elijo?"
          style={[e.ayudaBoton, verAyudaClase && e.ayudaBotonActivo]}>
          <Text style={[e.ayudaBotonTexto, verAyudaClase && { color: '#fff' }]}>? ¿Qué clase elijo?</Text>
        </Pressable>
      </View>
      {verAyudaClase && (
        <AyudaClases actual={d} onElegir={(a) => cambiar(a)} />
      )}
      <Opciones opciones={Object.entries(op.CLASES).map(([v, t]) => ({ valor: v, texto: t }))} valor={d.clase}
        onCambiar={(c) => cambiar({ clase: c, ...(producto ? {} : sugeridoPorClase(c)) })} />

      <Seccion titulo="Unidad de medida *" />
      {(['unidad', 'masa', 'volumen'] as const).map((t) => porTipo(t).length > 0 && (
        <Opciones key={t} opciones={porTipo(t)} valor={d.unidad_medida_id} onCambiar={(id) => cambiar({ unidad_medida_id: id })} />
      ))}
      <Text style={e.suave}>Consejo: los insumos que se gastan por poquito (azúcar, leche) conviene llevarlos en gramos o mililitros.</Text>

      <Seccion titulo="Cómo se maneja" />
      <Interruptor titulo="Se vende" detalle="Aparece en Venta rápida y en Mesas" valor={d.se_vende || d.consumo_interno}
        deshabilitado={d.consumo_interno} onCambiar={(v) => cambiar({ se_vende: v })} />
      <Interruptor titulo="Lleva inventario" valor={d.controla_stock} onCambiar={(v) => cambiar({ controla_stock: v })}
        detalle={sinInventario ? 'Sin inventario propio: si tiene receta, se descuentan sus ingredientes al venderlo (bebidas, desayunos)' : 'Tiene existencia: baja al venderlo y sube al comprar o producir'} />
      <Interruptor titulo="Admite decimales" detalle="Se vende o se usa por peso o medida (1.5 lb, 250 g)" valor={d.permite_fraccion}
        onCambiar={(v) => cambiar({ permite_fraccion: v })} />
      {d.controla_stock && (
        <Interruptor titulo="Permitir vender sin existencia" valor={d.permite_sin_existencia} onCambiar={(v) => cambiar({ permite_sin_existencia: v })}
          detalle="Para productos simples (Coca-Cola, golosinas): se vende aunque marque 0 y queda en negativo, aunque el negocio no permita stock negativo" />
      )}
      <Interruptor titulo="Consumo interno" detalle="Comida del personal y cortesías: precio $0, no entra a la caja y descuenta su receta" valor={d.consumo_interno}
        onCambiar={(v) => cambiar({ consumo_interno: v })} />
      {(d.se_vende || d.consumo_interno) && (
        <Interruptor titulo="Imprime comanda" detalle="Apágalo si se entrega directo (coca en lata, pan de vitrina): no manda comanda a cocina ni a barra"
          valor={d.imprime_comanda} onCambiar={(v) => cambiar({ imprime_comanda: v })} />
      )}

      <Seccion titulo="Costo y precio" />
      <View style={e.fila}>
        <View style={e.col}>
          <Campo etiqueta="Costo ($)" value={d.costo} editable={fijaPrecio} keyboardType="decimal-pad"
            onChangeText={(t) => cambiar({ costo: t.replace(/[^0-9.]/g, '') })} />
        </View>
        <View style={e.col}>
          <Campo etiqueta="Precio de venta ($)" value={d.consumo_interno ? '0' : d.precio} editable={fijaPrecio && !d.consumo_interno} keyboardType="decimal-pad"
            onChangeText={(t) => cambiar({ precio: t.replace(/[^0-9.]/g, '') })} />
        </View>
        <View style={[e.col, e.margen]}>
          <Text style={e.suave}>Margen</Text>
          <Text style={[e.precio, margen !== null && margen < 0 && { color: C.peligro }]}>{margen === null ? '—' : `${margen}%`}</Text>
        </View>
      </View>
      {!fijaPrecio && <Text style={e.suave}>Tu rol no puede cambiar precios ni costos.</Text>}
      {d.controla_stock && <Text style={e.suave}>El costo se actualiza solo con cada compra o producción (costo promedio).</Text>}

      {d.controla_stock && (
        <Campo etiqueta="Stock mínimo (avisa y sale en «Por comprar» al llegar aquí)" value={d.stock_minimo} keyboardType="decimal-pad"
          onChangeText={(t) => cambiar({ stock_minimo: t.replace(/[^0-9.]/g, '') })} placeholder="0 = sin aviso" />
      )}

      <Seccion titulo="Categorías" />
      <Opciones multiple opciones={categorias.map((c) => ({ valor: c.id, texto: c.nombre }))} valor={d.categorias}
        onCambiar={(id) => cambiar({ categorias: d.categorias.includes(id) ? d.categorias.filter((x) => x !== id) : [...d.categorias, id] })} />
      <Text style={e.suave}>{area ? `Su comanda sale en: ${area}` : d.categorias.length ? 'Sin comanda: se entrega directo y solo sale el ticket de venta.' : 'Elige su categoría para que aparezca en su pestaña del punto de venta.'}</Text>

      <Seccion titulo="Botón en el POS" />
      <View style={e.colores}>
        <Pressable onPress={() => cambiar({ color: null })} style={[e.color, { backgroundColor: '#fff' }, !d.color && e.colorActivo]}><Text style={e.suave}>—</Text></Pressable>
        {COLORES.map((c) => (
          <Pressable key={c} onPress={() => cambiar({ color: c })} style={[e.color, { backgroundColor: c }, d.color === c && e.colorActivo]} />
        ))}
      </View>
      <Campo etiqueta="Código de barras (opcional)" value={d.codigo_barras} onChangeText={(t) => cambiar({ codigo_barras: t })} maxLength={50} />
      <Campo etiqueta="Descripción (opcional)" value={d.descripcion} onChangeText={(t) => cambiar({ descripcion: t })} />
      {producto && <Interruptor titulo="Activo" detalle="Si lo apagas deja de aparecer en ventas y compras" valor={d.activo} onCambiar={(v) => cambiar({ activo: v })} />}

      {/* Bloques de extras (Tipo de leche, Salsa...) como en las apps de delivery; un producto nuevo se guarda primero */}
      {(d.se_vende || d.consumo_interno) && puede('mesas.configurar') && (
        <>
          <Seccion titulo="Extras (modificadores)" />
          {producto ? <BloquesProducto productoId={producto.id} nombre={producto.nombre} />
            : <Text style={e.suave}>Guarda el producto primero; después, al editarlo, aquí le agregas sus extras.</Text>}
        </>
      )}
    </Ventana>
  );
}

const e = StyleSheet.create({
  claseCabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  ayudaBoton: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginTop: 6 },
  ayudaBotonActivo: { backgroundColor: C.primario, borderColor: C.primario },
  ayudaBotonTexto: { fontSize: 13, fontWeight: '600', color: C.suave },
  barra: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center', paddingHorizontal: 12, paddingTop: 12, maxWidth: 1000, width: '100%', alignSelf: 'center' },
  buscar: { height: 48, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: radio, paddingHorizontal: 14, fontSize: 16, backgroundColor: '#fff', color: C.texto },
  lista: { padding: 12, gap: 8, maxWidth: 1000, width: '100%', alignSelf: 'center' },
  vacio: { textAlign: 'center', color: C.suave, padding: 24 },
  tarjeta: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: '#fff', borderRadius: radio, borderWidth: 1, borderColor: C.borde, padding: 14 },
  titulo: { fontSize: 16, fontWeight: '700', color: C.texto },
  suave: { fontSize: 13, color: C.suave },
  precio: { fontSize: 16, fontWeight: '800', color: C.primario },
  fila: { flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
  col: { flex: 1 },
  margen: { height: 52, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: radio },
  colores: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  color: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: C.borde, alignItems: 'center', justifyContent: 'center' },
  colorActivo: { borderColor: C.texto, borderWidth: 4 },
});
