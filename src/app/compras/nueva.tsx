import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Encabezado } from '@/components/encabezado';
import { ProveedorForm } from '@/components/proveedorForm';
import { Boton, Campo, Cargando, Ventana } from '@/components/ui';
import { C, radio } from '@/constants/colores';
import { mensajeError } from '@/lib/api';
import { avisar } from '@/lib/aviso';
import { dinero, hoy, nuevoUuid } from '@/lib/formato';
import * as op from '@/lib/operaciones';
import { useSesion } from '@/lib/sesion';
import { sinTildes } from '@/lib/texto';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fechaLarga = (f: string) => `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7)) - 1]} ${f.slice(0, 4)}`;

interface Linea { clave: string; producto: op.ProductoCompra; unidadId: number | null; cantidad: string; costo: string }

const DOCUMENTOS = [['factura', 'Factura'], ['ccf', 'Crédito fiscal'], ['ticket', 'Ticket'], ['otro', 'Otro']] as const;

function Opciones<T extends string>({ valor, opciones, onCambiar }: { valor: T; opciones: readonly (readonly [T, string])[]; onCambiar: (v: T) => void }) {
  return (
    <View style={e.opciones}>
      {opciones.map(([v, texto]) => (
        <Pressable key={v} onPress={() => onCambiar(v)} style={[e.opcion, valor === v && e.opcionActiva]}>
          <Text style={[e.opcionTexto, valor === v && { color: '#fff' }]}>{texto}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// Registrar lo que se compró: entra al inventario y actualiza el costo promedio
export default function NuevaCompra() {
  const { cajaId, puede } = useSesion();
  const [proveedores, setProveedores] = useState<op.Proveedor[] | null>(null);
  const [catalogo, setCatalogo] = useState<Awaited<ReturnType<typeof op.getCatalogoCompras>> | null>(null);
  const [proveedorId, setProveedorId] = useState<number | null>(null);
  const [documento, setDocumento] = useState<(typeof DOCUMENTOS)[number][0]>('ticket');
  const [numero, setNumero] = useState('');
  const [condicion, setCondicion] = useState<'contado' | 'credito'>('contado');
  const [origen, setOrigen] = useState<'caja' | 'externo'>('caja');
  const [dias, setDias] = useState('');
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [totalFactura, setTotalFactura] = useState('');
  const [buscando, setBuscando] = useState<'producto' | 'proveedor' | null>(null);
  const [nuevoProveedor, setNuevoProveedor] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [guardando, setGuardando] = useState(false);
  const uuid = useRef(nuevoUuid());

  useEffect(() => {
    Promise.all([op.getProveedores(), op.getCatalogoCompras()])
      .then(([p, c]) => { setProveedores(p); setCatalogo(c); })
      .catch((err) => avisar('No se pudo cargar', mensajeError(err)));
  }, []);

  const unidades = catalogo?.unidades ?? [];
  const factor = (id: number | null) => unidades.find((u) => u.id === id)?.factor_base ?? 1;

  // Costo sugerido en la unidad elegida, a partir del costo promedio del producto
  const costoSugerido = (p: op.ProductoCompra, unidadId: number | null) =>
    (p.costo_unitario * factor(unidadId) / factor(p.unidad_medida_id)).toFixed(2);

  const agregar = (p: op.ProductoCompra) => {
    setLineas((ls) => [...ls, { clave: nuevoUuid(), producto: p, unidadId: p.unidad_medida_id, cantidad: '', costo: costoSugerido(p, p.unidad_medida_id) }]);
    setBuscando(null);
    setBusqueda('');
  };

  const cambiar = (clave: string, cambios: Partial<Linea>) => setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)));

  const total = Math.round(lineas.reduce((t, l) => t + Math.round(Number(l.cantidad || 0) * Number(l.costo || 0) * 100) / 100, 0) * 100) / 100;
  // Total impreso en la factura del proveedor: si no cuadra con lo digitado, algo está mal
  const factura = totalFactura.trim() === '' ? null : Number(totalFactura.replace(',', '.'));
  const diferencia = factura === null || !Number.isFinite(factura) ? 0 : Math.round((total - factura) * 100) / 100;
  const proveedor = proveedores?.find((p) => p.id === proveedorId);
  const diasNum = Math.floor(Number(dias));
  const diasValidos = dias.trim() !== '' && Number.isFinite(diasNum) && diasNum >= 0;

  // El plazo del proveedor es la propuesta; en cada compra se puede cambiar
  const elegirProveedor = (p: op.Proveedor) => {
    const plazo = p.dias_credito ?? 0;
    setProveedorId(p.id);
    setDias(String(plazo));
    setCondicion(plazo > 0 ? 'credito' : 'contado');
    setBuscando(null);
  };

  const encontrados = useMemo(() => {
    const t = sinTildes(busqueda.trim());
    if (buscando === 'proveedor') return (proveedores ?? []).filter((p) => !t || sinTildes(p.nombre).includes(t));
    return (catalogo?.productos ?? []).filter((p) => !t || sinTildes(p.nombre).includes(t) || p.sku?.toLowerCase() === t).slice(0, 60);
  }, [busqueda, buscando, proveedores, catalogo]);

  const guardar = async () => {
    if (!proveedorId) return avisar('Elige el proveedor');
    if (lineas.length === 0) return avisar('Agrega al menos un producto');
    if (lineas.some((l) => !(Number(l.cantidad) > 0))) return avisar('Falta la cantidad', 'Escribe cuánto llegó de cada producto.');
    if (diferencia !== 0) return avisar('El total no cuadra con la factura', `Lo digitado suma ${dinero(total)} y la factura dice ${dinero(factura ?? 0)}. Revisa cantidades y costos.`);
    if (condicion === 'credito' && !diasValidos) return avisar('Escribe en cuántos días vence la compra');
    if (condicion === 'contado' && origen === 'caja' && !cajaId) return avisar('Elige la caja de esta tablet');
    setGuardando(true);
    try {
      const res = await op.registrarCompra({
        uuid: uuid.current, proveedor_id: proveedorId, fecha: hoy(), tipo_documento: documento,
        numero_documento: numero.trim() || undefined, condicion,
        fecha_vencimiento: condicion === 'credito' ? hoy(diasNum) : undefined,
        items: lineas.map((l) => ({ producto_id: l.producto.id, unidad_medida_id: l.unidadId, cantidad: Number(l.cantidad), costo_unitario: Number(l.costo || 0) })),
        pago: condicion === 'contado' ? { origen, caja_id: origen === 'caja' ? cajaId ?? undefined : undefined } : undefined,
      });
      avisar(res.message || 'Compra registrada');
      if (router.canGoBack()) router.back();
      else router.replace('/compras');
    } catch (err) {
      avisar('No se pudo registrar la compra', mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };

  if (!proveedores || !catalogo) return <Cargando />;

  return (
    <SafeAreaView style={e.pantalla} edges={['top', 'left', 'right', 'bottom']}>
      <Encabezado titulo="Nueva compra" subtitulo="Lo comprado entra al inventario con su costo" />
      <ScrollView contentContainerStyle={e.contenido} keyboardShouldPersistTaps="handled">
        <View style={e.bloque}>
          <Text style={e.etiqueta}>Proveedor</Text>
          <Pressable onPress={() => { setBusqueda(''); setBuscando('proveedor'); }} style={e.selector}>
            <Text style={[e.selectorTexto, !proveedor && { color: C.tenue }]}>{proveedor?.nombre ?? 'Elegir proveedor'}</Text>
          </Pressable>
          <Text style={e.etiqueta}>Documento</Text>
          <Opciones valor={documento} opciones={DOCUMENTOS} onCambiar={setDocumento} />
          <Campo placeholder="Número del documento (opcional)" value={numero} onChangeText={setNumero} />
        </View>

        <View style={e.bloque}>
          <View style={e.fila}>
            <Text style={[e.etiqueta, { flex: 1 }]}>Productos ({lineas.length})</Text>
            <Boton chico titulo="+ Agregar producto" onPress={() => { setBusqueda(''); setBuscando('producto'); }} />
          </View>
          {lineas.map((l) => {
            const tipo = l.producto.unidad_tipo;
            const opcionesUnidad = unidades.filter((u) => !tipo || u.tipo === tipo);
            return (
              <View key={l.clave} style={e.linea}>
                <View style={e.fila}>
                  <Text style={[e.lineaNombre, { flex: 1 }]}>{l.producto.nombre}</Text>
                  <Pressable onPress={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))} hitSlop={8}><Text style={e.quitar}>Quitar</Text></Pressable>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {opcionesUnidad.map((u) => (
                    <Pressable key={u.id} onPress={() => cambiar(l.clave, { unidadId: u.id, costo: costoSugerido(l.producto, u.id) })}
                      style={[e.unidad, l.unidadId === u.id && e.opcionActiva]}>
                      <Text style={[e.opcionTexto, l.unidadId === u.id && { color: '#fff' }]}>{u.nombre}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <View style={e.fila}>
                  <View style={{ flex: 1 }}><Campo etiqueta="Cantidad" value={l.cantidad} onChangeText={(v) => cambiar(l.clave, { cantidad: v })} keyboardType="decimal-pad" placeholder="¿Cuánto llegó?" style={!(Number(l.cantidad) > 0) ? { borderColor: C.peligro } : undefined} /></View>
                  <View style={{ flex: 1 }}><Campo etiqueta="Costo por unidad ($)" value={l.costo} onChangeText={(v) => cambiar(l.clave, { costo: v })} keyboardType="decimal-pad" /></View>
                  <Text style={e.subtotal}>{dinero(Number(l.cantidad || 0) * Number(l.costo || 0))}</Text>
                </View>
              </View>
            );
          })}
        </View>

        <View style={e.bloque}>
          <Text style={e.etiqueta}>Pago</Text>
          <Opciones valor={condicion} opciones={[['contado', 'Contado'], ['credito', 'Crédito']] as const} onCambiar={setCondicion} />
          {condicion === 'credito' && (
            <View style={e.credito}>
              <View style={e.fila}>
                <View style={{ width: 140 }}><Campo etiqueta="Vence en (días)" value={dias} onChangeText={(v) => setDias(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" /></View>
                <View style={[e.opciones, { flex: 1, alignSelf: 'flex-end' }]}>
                  {[...new Set([proveedor?.dias_credito ?? 0, 5, 8, 15, 30].filter((n) => n > 0))].map((n) => (
                    <Pressable key={n} onPress={() => setDias(String(n))} style={[e.unidad, diasNum === n && diasValidos && e.opcionActiva]}>
                      <Text style={[e.opcionTexto, diasNum === n && diasValidos && { color: '#fff' }]}>{n} días</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <Text style={e.suave}>
                {diasValidos ? `Vence el ${fechaLarga(hoy(diasNum))}` : 'Escribe los días de plazo'}
                {proveedor ? ` · plazo del proveedor: ${proveedor.dias_credito ?? 0} días` : ''}
              </Text>
            </View>
          )}
          {condicion === 'contado' && (
            <Opciones valor={origen} opciones={[['caja', 'Sale de la caja'], ['externo', 'Fuera de caja (banco)']] as const} onCambiar={setOrigen} />
          )}
          <View style={e.fila}>
            <Text style={[e.total, { flex: 1 }]}>Total</Text>
            <Text style={e.total}>{dinero(total)}</Text>
          </View>
          <Campo etiqueta="Total de la factura (para comparar)" value={totalFactura} onChangeText={setTotalFactura} keyboardType="decimal-pad" placeholder="Opcional" />
          {factura !== null && (diferencia === 0
            ? <Text style={{ color: C.exito, fontWeight: '600' }}>Cuadra con la factura</Text>
            : <Text style={{ color: C.peligro, fontWeight: '600' }}>No cuadra: diferencia de {dinero(Math.abs(diferencia))}. Revisa cantidades y costos.</Text>)}
          <Boton titulo="Registrar compra" variante="exito" cargando={guardando} onPress={guardar} />
        </View>
      </ScrollView>

      <Ventana visible={!!buscando} titulo={buscando === 'proveedor' ? 'Elegir proveedor' : 'Agregar producto'} onCerrar={() => setBuscando(null)} ancho={560}>
        <TextInput style={e.buscar} value={busqueda} onChangeText={setBusqueda} placeholder="Buscar" placeholderTextColor={C.tenue} autoFocus />
        {buscando === 'proveedor' && puede('proveedores.gestionar') && (
          <Boton titulo="+ Nuevo proveedor" variante="contorno" onPress={() => { setBuscando(null); setNuevoProveedor(true); }} />
        )}
        <FlatList
          data={encontrados as (op.Proveedor | op.ProductoCompra)[]}
          keyExtractor={(x) => String(x.id)}
          scrollEnabled={false}
          contentContainerStyle={{ gap: 6 }}
          ListEmptyComponent={<Text style={e.suave}>{buscando === 'proveedor' ? 'Sin proveedores con ese nombre: toca «+ Nuevo proveedor».' : 'Sin resultados'}</Text>}
          renderItem={({ item }) => (
            <Pressable style={e.resultado} onPress={() => {
              if (buscando === 'proveedor') elegirProveedor(item as op.Proveedor); else agregar(item as op.ProductoCompra);
            }}>
              <Text style={e.lineaNombre}>{item.nombre}</Text>
              {'unidad' in item && <Text style={e.suave}>{item.unidad ?? ''} · costo {dinero(item.costo_unitario)}</Text>}
              {'saldo' in item && item.saldo > 0 && <Text style={e.suave}>Se le debe {dinero(item.saldo)}</Text>}
            </Pressable>
          )}
        />
      </Ventana>

      <ProveedorForm visible={nuevoProveedor} proveedor={null} onCerrar={() => setNuevoProveedor(false)}
        onGuardado={(p) => {
          setNuevoProveedor(false);
          setProveedores((l) => [...(l ?? []), { id: p.id, nombre: p.nombre, dias_credito: p.dias_credito, saldo: p.saldo }]);
          elegirProveedor({ id: p.id, nombre: p.nombre, dias_credito: p.dias_credito, saldo: p.saldo });
        }} />
    </SafeAreaView>
  );
}

const e = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: C.fondo },
  contenido: { padding: 16, gap: 14, maxWidth: 820, width: '100%', alignSelf: 'center' },
  bloque: { backgroundColor: '#fff', borderRadius: radio, borderWidth: 1, borderColor: C.borde, padding: 14, gap: 10 },
  etiqueta: { fontSize: 15, fontWeight: '700', color: C.texto },
  suave: { fontSize: 13, color: C.suave },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  selector: { minHeight: 50, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: radio, paddingHorizontal: 14, justifyContent: 'center' },
  selectorTexto: { fontSize: 16, color: C.texto },
  opciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opcion: { minHeight: 46, paddingHorizontal: 14, borderRadius: radio, borderWidth: 1, borderColor: '#D1D5DB', justifyContent: 'center' },
  opcionActiva: { backgroundColor: C.primario, borderColor: C.primario },
  opcionTexto: { fontSize: 15, fontWeight: '600', color: C.texto },
  unidad: { minHeight: 40, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: '#D1D5DB', justifyContent: 'center' },
  linea: { borderWidth: 1, borderColor: C.borde, borderRadius: radio, padding: 10, gap: 8 },
  lineaNombre: { fontSize: 16, fontWeight: '700', color: C.texto },
  subtotal: { minWidth: 80, textAlign: 'right', fontSize: 16, fontWeight: '700', color: C.texto, alignSelf: 'flex-end', paddingBottom: 14 },
  credito: { gap: 6 },
  quitar: { color: C.peligro, fontWeight: '600' },
  total: { fontSize: 22, fontWeight: '800', color: C.texto },
  buscar: { height: 48, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: radio, paddingHorizontal: 14, fontSize: 16, color: C.texto },
  resultado: { padding: 12, borderRadius: radio, borderWidth: 1, borderColor: C.borde, gap: 2 },
});
