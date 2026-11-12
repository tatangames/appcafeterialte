import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Encabezado } from '@/components/encabezado';
import { FiltroFechas, rangoDe, SelectorFecha, textoRango, VerMas } from '@/components/filtroFechas';
import { OpcionesBuscables } from '@/components/formulario';
import { VentanaMotivo } from '@/components/motivo';
import { Boton, Campo, Etiqueta, Ventana } from '@/components/ui';
import { C, radio } from '@/constants/colores';
import { mensajeError } from '@/lib/api';
import { avisar } from '@/lib/aviso';
import { dinero, fecha, hoy, nuevoUuid } from '@/lib/formato';
import * as op from '@/lib/operaciones';
import { useListaPaginada } from '@/lib/paginado';
import { getCatalogosCaja } from '@/lib/servicios';
import { useSesion } from '@/lib/sesion';
import type { MetodoPago } from '@/lib/tipos';

// Gastos del periodo elegido (por defecto este mes) y registro de uno nuevo (desde la caja o fuera de caja)
export default function Gastos() {
  const { nuevo } = useLocalSearchParams<{ nuevo?: string }>();
  const { cajaId, puede } = useSesion();
  const [rango, setRango] = useState(() => rangoDe('mes'));
  const [categorias, setCategorias] = useState<{ id: number; nombre: string }[]>([]);
  const [abierto, setAbierto] = useState(nuevo === '1');
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [descripcion, setDescripcion] = useState('');
  const [monto, setMonto] = useState('');
  const [documento, setDocumento] = useState('');
  const [origen, setOrigen] = useState<'caja' | 'externo'>('caja');
  const [fechaGasto, setFechaGasto] = useState(hoy());
  const [metodos, setMetodos] = useState<MetodoPago[]>([]);
  const [metodoId, setMetodoId] = useState<number | null>(null);
  const [referencia, setReferencia] = useState('');
  const [proveedores, setProveedores] = useState<op.Proveedor[]>([]);
  const [proveedorId, setProveedorId] = useState<number>(0); // 0 = sin proveedor
  const [detalle, setDetalle] = useState<op.Gasto | null>(null);
  const [guardando, setGuardando] = useState(false);
  // Administrar categorías: null = cerrado; lista o formulario de una categoría
  const [admin, setAdmin] = useState<null | { lista: op.CategoriaGasto[]; form: { id?: number; nombre: string; descripcion: string; activo: boolean } | null }>(null);
  const puedeGastos = puede('gastos.ver') || puede('gastos.registrar');
  const uuid = useRef(nuevoUuid());

  const [anulando, setAnulando] = useState<op.Gasto | null>(null);
  const pedir = useCallback((page: number) => op.getGastos({ desde: rango.desde, hasta: rango.hasta, page, per_page: 50 }), [rango]);
  const { respuesta: datos, items, error, cargar: cargarLista, verMas, hayMas, cargandoMas } = useListaPaginada(pedir, (r) => r.gastos);
  const cargar = useCallback(() => {
    if (!puedeGastos) return;
    cargarLista();
    op.getCategoriasGasto().then(setCategorias).catch(() => null);
  }, [cargarLista, puedeGastos]);

  const abrirCategorias = () => {
    op.getCategoriasGasto(true)
      .then((lista) => setAdmin({ lista, form: null }))
      .catch((err) => avisar('No se pudieron cargar las categorías', mensajeError(err)));
  };

  const guardarCategoria = async () => {
    const f = admin?.form;
    if (!f) return;
    setGuardando(true);
    try {
      await op.guardarCategoriaGasto({ nombre: f.nombre.trim(), descripcion: f.descripcion.trim() || null, activo: f.activo }, f.id);
      setAdmin({ lista: await op.getCategoriasGasto(true), form: null });
      if (puedeGastos) op.getCategoriasGasto().then(setCategorias).catch(() => null);
    } catch (err) {
      avisar('No se pudo guardar la categoría', mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };

  const cambiarForm = (cambio: Partial<{ nombre: string; descripcion: string; activo: boolean }>) =>
    setAdmin((a) => a && a.form ? { ...a, form: { ...a.form, ...cambio } } : a);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  // Al abrir el formulario: formas de pago (sin crédito; efectivo primero) y proveedores
  const abrirNuevo = useCallback(() => {
    setFechaGasto(hoy());
    setReferencia('');
    setProveedorId(0);
    setAbierto(true);
  }, []);
  useEffect(() => {
    if (!abierto) return;
    getCatalogosCaja().then((c) => {
      const lista = c.metodos_pago.filter((m) => m.tipo !== 'credito');
      setMetodos(lista);
      setMetodoId((id) => id ?? lista.find((m) => m.tipo === 'efectivo')?.id ?? lista[0]?.id ?? null);
    }).catch(() => null);
    op.getProveedores().then(setProveedores).catch(() => null);
  }, [abierto]);
  const metodo = metodos.find((m) => m.id === metodoId);
  const faltaReferencia = !!metodo?.requiere_referencia && referencia.trim() === '';

  const guardar = async () => {
    if (!categoriaId) return avisar('Elige la categoría');
    setGuardando(true);
    try {
      await op.registrarGasto({
        uuid: uuid.current, categoria_id: categoriaId, descripcion: descripcion.trim(), monto: Number(monto), origen,
        caja_id: origen === 'caja' ? cajaId ?? undefined : undefined, numero_documento: documento.trim() || undefined,
        fecha: fechaGasto, metodo_pago_id: metodoId ?? undefined, referencia: referencia.trim() || undefined,
        proveedor_id: proveedorId || undefined,
      });
      uuid.current = nuevoUuid();
      setAbierto(false);
      setDescripcion('');
      setMonto('');
      setDocumento('');
      setReferencia('');
      setProveedorId(0);
      cargar();
    } catch (err) {
      avisar('No se pudo registrar el gasto', mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <SafeAreaView style={e.pantalla} edges={['top', 'left', 'right', 'bottom']}>
      <Encabezado titulo="Gastos" subtitulo={datos ? `${textoRango(rango)} · ${dinero(datos.total_monto)}` : undefined}
        derecha={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {puede('gastos.categorias') && <Boton titulo="Categorías" variante="contorno" chico onPress={abrirCategorias} />}
            {puede('gastos.registrar') && <Boton titulo="+ Nuevo gasto" chico onPress={abrirNuevo} />}
          </View>
        } />
      {puedeGastos && <FiltroFechas valor={rango} onCambio={setRango} />}
      {error ? <Text style={{ color: C.peligro, paddingHorizontal: 16 }}>{error}</Text> : null}
      <FlatList
        data={items}
        ListFooterComponent={<VerMas hayMas={hayMas} cargando={cargandoMas} onPress={verMas} />}
        keyExtractor={(g) => String(g.id)}
        contentContainerStyle={e.lista}
        ListEmptyComponent={<Text style={e.vacio}>{!puedeGastos ? 'Usa el botón Categorías para administrarlas' : datos ? 'Sin gastos en este periodo' : 'Cargando...'}</Text>}
        renderItem={({ item: g }) => (
          <Pressable style={({ pressed }) => [e.gasto, pressed && { opacity: 0.8 }]} onPress={() => setDetalle(g)}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={e.titulo}>{g.descripcion}</Text>
              <Text style={e.suave}>{g.numero} · {fecha(g.fecha)} · {g.categoria} · {g.origen === 'caja' ? 'de la caja' : 'fuera de caja'}{g.metodo ? ` · ${g.metodo}` : ''}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={[e.total, g.anulado && { textDecorationLine: 'line-through', color: C.tenue }]}>{dinero(g.monto)}</Text>
              {g.anulado && <Etiqueta texto="Anulado" fondo="#FEE2E2" color="#B91C1C" />}
            </View>
          </Pressable>
        )}
      />

      <Ventana visible={abierto} titulo="Nuevo gasto" onCerrar={() => setAbierto(false)} ancho={560}
        pie={<Boton estilo={{ flex: 1 }} titulo={`Registrar ${monto ? dinero(Number(monto)) : ''}`} variante="exito" cargando={guardando}
          deshabilitado={!categoriaId || !(Number(monto) > 0) || descripcion.trim().length < 3 || faltaReferencia} onPress={guardar} />}>
        <Text style={e.etiqueta}>Categoría</Text>
        <View style={e.opciones}>
          {categorias.map((c) => (
            <Pressable key={c.id} onPress={() => setCategoriaId(c.id)} style={[e.opcion, categoriaId === c.id && e.opcionActiva]}>
              <Text style={[e.opcionTexto, categoriaId === c.id && { color: '#fff' }]}>{c.nombre}</Text>
            </Pressable>
          ))}
        </View>
        <Campo etiqueta="Descripción" value={descripcion} onChangeText={setDescripcion} placeholder="Recibo de luz de octubre..." />
        <Campo etiqueta="Monto ($)" value={monto} onChangeText={setMonto} keyboardType="decimal-pad" placeholder="0.00" />
        <Text style={e.etiqueta}>Fecha</Text>
        <SelectorFecha valor={fechaGasto} onCambio={setFechaGasto} />
        <Text style={e.etiqueta}>Se paga</Text>
        <View style={e.opciones}>
          {([['caja', 'Con dinero de la caja'], ['externo', 'Fuera de caja (banco, tarjeta)']] as const).map(([v, t]) => (
            <Pressable key={v} onPress={() => setOrigen(v)} style={[e.opcion, origen === v && e.opcionActiva]}>
              <Text style={[e.opcionTexto, origen === v && { color: '#fff' }]}>{t}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={e.suave}>{origen === 'caja' ? 'Sale de la gaveta del turno abierto y aparece en el cuadre como gasto.' : 'Pagado con banco, tarjeta del negocio u otra cuenta: no toca la caja.'}</Text>
        {metodos.length > 0 && (
          <>
            <Text style={e.etiqueta}>Forma de pago</Text>
            <View style={e.opciones}>
              {metodos.map((m) => (
                <Pressable key={m.id} onPress={() => setMetodoId(m.id)} style={[e.opcion, metodoId === m.id && e.opcionActiva]}>
                  <Text style={[e.opcionTexto, metodoId === m.id && { color: '#fff' }]}>{m.nombre}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
        <Campo etiqueta={metodo?.requiere_referencia ? 'Referencia *' : 'Referencia (opcional)'} value={referencia} onChangeText={setReferencia} maxLength={100}
          placeholder="N.º de transferencia o autorización" style={faltaReferencia ? { borderColor: C.peligro } : undefined} />
        <Campo etiqueta="N.º de factura o recibo (opcional)" value={documento} onChangeText={setDocumento} maxLength={50} />
        {proveedores.length > 0 && (
          <>
            <Text style={e.etiqueta}>Proveedor (opcional)</Text>
            <OpcionesBuscables opciones={[{ valor: 0, texto: 'Sin proveedor' }, ...proveedores.map((p) => ({ valor: p.id, texto: p.nombre }))]}
              valor={proveedorId} onCambiar={setProveedorId} placeholder="Buscar proveedor" />
          </>
        )}
      </Ventana>

      {/* Detalle del gasto: quién lo registró, cómo se pagó y, si se puede, anularlo */}
      <Ventana visible={!!detalle} titulo={`Gasto ${detalle?.numero ?? ''}`} ancho={520} onCerrar={() => setDetalle(null)}
        subtitulo={detalle ? `${fecha(detalle.fecha)}${detalle.usuario ? ` · ${detalle.usuario}` : ''}${detalle.registrado ? ` · ${detalle.registrado.slice(11)}` : ''}` : undefined}
        pie={detalle && !detalle.anulado && puede('gastos.registrar')
          ? <Boton estilo={{ flex: 1 }} titulo="Anular gasto" variante="contorno" onPress={() => { setAnulando(detalle); setDetalle(null); }} />
          : undefined}>
        {detalle && (
          <View style={{ gap: 8 }}>
            <Text style={[e.total, { fontSize: 28 }, detalle.anulado && { textDecorationLine: 'line-through', color: C.tenue }]}>{dinero(detalle.monto)}</Text>
            {([
              ['Categoría', detalle.categoria],
              ['Descripción', detalle.descripcion],
              ['Pago', `${detalle.metodo ?? '—'} · ${detalle.origen === 'caja' ? 'de la caja' : 'fuera de caja'}`],
              ['Turno', detalle.turno],
              ['Referencia', detalle.referencia],
              ['Proveedor', detalle.proveedor],
              ['Factura o recibo', detalle.numero_documento],
            ] as const).filter(([, v]) => !!v).map(([t, v]) => (
              <View key={t} style={e.dato}>
                <Text style={e.suave}>{t}</Text>
                <Text style={e.datoValor}>{v}</Text>
              </View>
            ))}
            {detalle.anulado && (
              <Text style={{ color: C.peligro, fontWeight: '600' }}>Anulado{detalle.anulado_por ? ` por ${detalle.anulado_por}` : ''}{detalle.motivo_anulacion ? `: ${detalle.motivo_anulacion}` : ''}</Text>
            )}
          </View>
        )}
      </Ventana>

      <Ventana visible={!!admin} ancho={600} onCerrar={() => setAdmin(null)}
        titulo={admin?.form ? (admin.form.id ? 'Editar categoría' : 'Nueva categoría') : 'Categorías de gasto'}
        subtitulo={admin?.form ? undefined : 'Toca una para editarla. Las inactivas no aparecen al registrar un gasto.'}
        pie={admin?.form
          ? <>
              <Boton estilo={{ flex: 1 }} titulo="Volver" variante="neutro" onPress={() => setAdmin({ ...admin, form: null })} />
              <Boton estilo={{ flex: 1 }} titulo="Guardar" variante="exito" cargando={guardando}
                deshabilitado={!admin.form.nombre.trim()} onPress={guardarCategoria} />
            </>
          : <Boton estilo={{ flex: 1 }} titulo="+ Nueva categoría" onPress={() => admin && setAdmin({ ...admin, form: { nombre: '', descripcion: '', activo: true } })} />}>
        {admin?.form ? (
          <>
            <Campo etiqueta="Nombre" value={admin.form.nombre} maxLength={100} onChangeText={(nombre) => cambiarForm({ nombre })} placeholder="Ej. Internet" />
            <Campo etiqueta="Descripción (opcional)" value={admin.form.descripcion} maxLength={300} onChangeText={(descripcion) => cambiarForm({ descripcion })} />
            <Text style={e.etiqueta}>Estado</Text>
            <View style={e.opciones}>
              {([[true, 'Activa'], [false, 'Inactiva']] as const).map(([v, t]) => (
                <Pressable key={t} onPress={() => cambiarForm({ activo: v })} style={[e.opcion, admin.form?.activo === v && e.opcionActiva]}>
                  <Text style={[e.opcionTexto, admin.form?.activo === v && { color: '#fff' }]}>{t}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 8 }}>
            {admin?.lista.map((c) => (
              <Pressable key={c.id} style={e.gasto}
                onPress={() => setAdmin({ ...admin, form: { id: c.id, nombre: c.nombre, descripcion: c.descripcion ?? '', activo: c.activo } })}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={e.titulo}>{c.nombre}</Text>
                  <Text style={e.suave}>{c.descripcion ?? 'Sin descripción'} · {c.gastos} gasto{c.gastos === 1 ? '' : 's'}</Text>
                </View>
                {!c.activo && <Etiqueta texto="Inactiva" fondo="#E5E7EB" color="#374151" />}
              </Pressable>
            ))}
          </ScrollView>
        )}
      </Ventana>
      <VentanaMotivo visible={!!anulando} titulo={`Anular gasto ${anulando?.numero ?? ''}`}
        subtitulo={anulando ? `${anulando.descripcion} · ${dinero(anulando.monto)}` : undefined}
        aviso="Pide el PIN de un encargado. Si salió de la caja, su turno debe seguir abierto y el dinero vuelve a la gaveta."
        onCerrar={() => setAnulando(null)} onConfirmar={(m) => (anulando ? op.anularGasto(anulando.id, m) : Promise.reject(new Error('Elige qué anular')))}
        onListo={() => { setAnulando(null); cargar(); }} />
    </SafeAreaView>
  );
}

const e = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: C.fondo },
  lista: { padding: 12, gap: 8, maxWidth: 900, width: '100%', alignSelf: 'center' },
  vacio: { textAlign: 'center', color: C.suave, padding: 24 },
  gasto: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: '#fff', borderRadius: radio, borderWidth: 1, borderColor: C.borde, padding: 14 },
  titulo: { fontSize: 16, fontWeight: '700', color: C.texto },
  suave: { fontSize: 13, color: C.suave },
  total: { fontSize: 18, fontWeight: '800', color: C.texto },
  etiqueta: { fontSize: 15, fontWeight: '700', color: C.texto },
  opciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opcion: { minHeight: 46, paddingHorizontal: 14, borderRadius: radio, borderWidth: 1, borderColor: '#D1D5DB', justifyContent: 'center' },
  opcionActiva: { backgroundColor: C.primario, borderColor: C.primario },
  opcionTexto: { fontSize: 15, fontWeight: '600', color: C.texto },
  dato: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  datoValor: { flex: 1, textAlign: 'right', fontSize: 14, color: C.texto, fontWeight: '600' },
});
