import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Encabezado } from '@/components/encabezado';
import { FiltroFechas, rangoDe, SelectorFecha, textoRango, type Rango } from '@/components/filtroFechas';
import { VentanaMotivo } from '@/components/motivo';
import { Boton, Campo, Cargando, Etiqueta, Ventana } from '@/components/ui';
import { C, radio } from '@/constants/colores';
import { borrarJson, guardarJson, leerJson } from '@/lib/almacenLocal';
import { mensajeError } from '@/lib/api';
import { avisar, confirmar } from '@/lib/aviso';
import { cantidad, dinero, fecha as fechaCorta, hoy, nuevoUuid } from '@/lib/formato';
import * as op from '@/lib/operaciones';
import { useSesion } from '@/lib/sesion';
import { sinTildes } from '@/lib/texto';

type Pestana = 'produccion' | 'mermas' | 'resumen';

const redondear = (v: number) => Math.round(v * 1000) / 1000;
const conUnidad = (v: number, u?: string | null) => `${cantidad(v)}${u ? ` ${u}` : ''}`;
const dinero4 = (v: number) => `$${(Math.round(v * 10000) / 10000).toFixed(4)}`;

// Lo que se horneó o cocinó, lo que no se vendió (mermas) y el resumen del periodo: lo mismo que la web
export default function Produccion() {
  const { puede } = useSesion();
  const { receta } = useLocalSearchParams<{ receta?: string }>();
  const verProd = puede('produccion.ver') || puede('produccion.registrar');
  const verMermas = puede('mermas.registrar') || puede('produccion.ver');
  const [pestana, setPestana] = useState<Pestana>(verProd ? 'produccion' : 'mermas');

  return (
    <SafeAreaView style={e.pantalla} edges={['top', 'left', 'right']}>
      <Encabezado titulo="Producción" subtitulo={fechaCorta(hoy())} />
      <View style={e.pestanas}>
        {verProd && <PestanaBoton activa={pestana === 'produccion'} texto="Producción" onPress={() => setPestana('produccion')} />}
        {verMermas && <PestanaBoton activa={pestana === 'mermas'} texto="Mermas y cierre" onPress={() => setPestana('mermas')} />}
        {verProd && <PestanaBoton activa={pestana === 'resumen'} texto="Resumen" onPress={() => setPestana('resumen')} />}
      </View>
      {pestana === 'produccion' ? <Producir recetaInicial={receta ? Number(receta) : null} />
        : pestana === 'mermas' ? <Mermas /> : <Resumen />}
    </SafeAreaView>
  );
}

function PestanaBoton({ activa, texto, onPress }: { activa: boolean; texto: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[e.pestana, activa && e.pestanaActiva]}>
      <Text style={[e.pestanaTexto, activa && { color: C.primario }]}>{texto}</Text>
    </Pressable>
  );
}

// ── Producción ────────────────────────────────────────────────
function Producir({ recetaInicial }: { recetaInicial: number | null }) {
  const { puede } = useSesion();
  const puedeRegistrar = puede('produccion.registrar');

  const [recetas, setRecetas] = useState<op.RecetaLista[]>([]);
  const [buscar, setBuscar] = useState('');
  const [stock, setStock] = useState<Record<number, number | null>>({});
  const [receta, setReceta] = useState<op.RecetaDetalle | null>(null);
  const [fecha, setFecha] = useState(hoy());
  const [planificada, setPlanificada] = useState('');
  const [producida, setProducida] = useState('');
  const [reales, setReales] = useState<Record<number, string>>({});
  const [obs, setObs] = useState('');
  const [guardando, setGuardando] = useState(false);
  const uuid = useRef(nuevoUuid());

  const [rango, setRango] = useState<Rango>(rangoDe('hoy'));
  const [lista, setLista] = useState<op.ProduccionLista[] | null>(null);
  const [detalle, setDetalle] = useState<op.ProduccionDetalle | null>(null);
  const [anulando, setAnulando] = useState<op.ProduccionDetalle | null>(null);

  const cargarLista = useCallback(() => {
    op.getProducciones({ desde: rango.desde, hasta: rango.hasta }).then((r) => setLista(r.producciones))
      .catch((err) => avisar('No se pudo cargar la producción', mensajeError(err)));
  }, [rango]);
  const cargarCatalogo = useCallback(() => {
    op.getCatalogoProduccion().then((c) => setStock(Object.fromEntries(c.productos.map((p) => [p.id, p.controla_stock ? p.stock : null])))).catch(() => null);
  }, []);
  useFocusEffect(useCallback(() => { cargarLista(); }, [cargarLista]));
  useFocusEffect(useCallback(() => {
    if (!puedeRegistrar) return;
    // Las recetas de venta (limonada, platos) se descuentan al vender: no se producen
    op.getRecetas().then((r) => setRecetas(r.filter((x) => x.uso !== 'venta'))).catch((err) => avisar('No se pudo cargar', mensajeError(err)));
    cargarCatalogo();
  }, [puedeRegistrar, cargarCatalogo]));

  const elegir = useCallback((id: number | null) => {
    setReales({});
    if (!id) { setReceta(null); return; }
    op.getReceta(id).then((r) => {
      setReceta(r);
      setPlanificada(String(r.rendimiento));
      setProducida(String(r.rendimiento));
    }).catch((err) => avisar('No se pudo cargar la receta', mensajeError(err)));
  }, []);

  // Desde Catálogo › Recetas › «Producir»
  useFocusEffect(useCallback(() => {
    if (recetaInicial && puedeRegistrar) {
      elegir(recetaInicial);
      router.setParams({ receta: undefined });
    }
  }, [recetaInicial, puedeRegistrar, elegir]));

  // Consumo teórico para lo planificado, agrupado por insumo
  const consumos = useMemo(() => {
    if (!receta) return [];
    const factor = Number(planificada || 0) / (receta.rendimiento || 1);
    const agrupado = new Map<number, { producto_id: number; producto: string; unidad: string | null; teorica: number; costo: number }>();
    receta.ingredientes.forEach((i) => {
      const actual = agrupado.get(i.producto_id) ?? { producto_id: i.producto_id, producto: i.producto, unidad: i.unidad_base ?? i.unidad, teorica: 0, costo: i.costo_unitario };
      actual.teorica += (i.cantidad_base ?? i.cantidad) * factor;
      agrupado.set(i.producto_id, actual);
    });
    return [...agrupado.values()].map((c) => {
      const existencia = stock[c.producto_id] ?? null;
      const real = reales[c.producto_id] !== undefined && reales[c.producto_id] !== '' ? Number(reales[c.producto_id]) : c.teorica;
      return { ...c, teorica: redondear(c.teorica), real, stock: existencia, falta: existencia !== null && real > existencia + 0.0001 };
    });
  }, [receta, planificada, reales, stock]);

  const costoEstimado = consumos.reduce((s, c) => s + c.real * c.costo, 0);
  const prod = Number(producida || 0);
  const plan = Number(planificada || 0);
  const editados = Object.values(reales).some((v) => v !== '');

  const registrar = async () => {
    if (!receta) return;
    // Un rendimiento muy distinto casi siempre es un número mal digitado (95 en vez de 195)
    if (plan > 0) {
      const pct = Math.round(prod / plan * 1000) / 10;
      if ((pct < 80 || pct > 120) && !(await confirmar('¿Es correcto?',
        `Salieron ${cantidad(prod)} de ${cantidad(plan)} planificados (${pct}%). Si fue un error al digitar, toca Cancelar y corrígelo.`, 'Sí, registrar'))) return;
    }
    setGuardando(true);
    try {
      const res = await op.registrarProduccion({
        uuid: uuid.current, receta_id: receta.id, fecha,
        cantidad_planificada: plan, cantidad_producida: prod, observaciones: obs.trim() || undefined,
        consumos: editados ? consumos.map((c) => ({ producto_id: c.producto_id, cantidad_real: redondear(c.real) })) : undefined,
      });
      uuid.current = nuevoUuid();
      setReceta(null);
      setPlanificada('');
      setProducida('');
      setReales({});
      setObs('');
      setDetalle(res.produccion);
      cargarLista();
      cargarCatalogo();
    } catch (err) {
      avisar('No se pudo registrar', mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };

  // Lo elegido nunca se esconde aunque no coincida con la búsqueda
  const recetasVisibles = useMemo(() => {
    const t = sinTildes(buscar.trim());
    return t ? recetas.filter((r) => r.id === receta?.id || sinTildes(r.producto ?? '').includes(t) || sinTildes(r.nombre ?? '').includes(t)) : recetas;
  }, [recetas, buscar, receta]);

  const abrir = (id: number) => op.getProduccion(id).then(setDetalle).catch((err) => avisar('No se pudo abrir', mensajeError(err)));
  const totalPeriodo = (lista ?? []).filter((p) => p.estado === 'registrada').reduce((s, p) => s + p.costo_total, 0);

  return (
    <ScrollView contentContainerStyle={e.contenido} keyboardShouldPersistTaps="handled">
      {puedeRegistrar && (
        <View style={e.bloque}>
          <Text style={e.etiqueta}>¿Qué se produjo?</Text>
          {recetas.length > 0 && (
            <TextInput style={e.buscar} value={buscar} onChangeText={setBuscar} placeholder="Buscar producto (concha, pan...)"
              placeholderTextColor={C.tenue} autoCorrect={false} />
          )}
          <View style={e.opciones}>
            {recetasVisibles.map((r) => (
              <Pressable key={r.id} onPress={() => elegir(receta?.id === r.id ? null : r.id)} style={[e.opcion, receta?.id === r.id && e.opcionActiva]}>
                <Text style={[e.opcionTexto, receta?.id === r.id && { color: '#fff' }]}>{r.producto}</Text>
                <Text style={[e.suave, receta?.id === r.id && { color: '#DBEAFE' }]}>rinde {conUnidad(r.rendimiento, r.unidad)}</Text>
              </Pressable>
            ))}
            {recetas.length > 0 && recetasVisibles.length === 0 && <Text style={e.suave}>Ninguna receta coincide con «{buscar.trim()}».</Text>}
            {recetas.length === 0 && <Text style={e.suave}>No hay recetas de producción. Créalas en Inicio › Catálogo › Recetas (o en la web).</Text>}
          </View>

          {receta && (
            <>
              <Text style={e.subetiqueta}>Fecha</Text>
              <SelectorFecha valor={fecha} onCambio={setFecha} />
              <View style={e.dosColumnas}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Campo etiqueta={`Planificado (${receta.unidad ?? 'unidades'})`} value={planificada} keyboardType="decimal-pad"
                    onChangeText={(v) => { setPlanificada(v); setReales({}); }} />
                  <Text style={e.suave}>{redondear(plan / (receta.rendimiento || 1))} tanda(s)</Text>
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Campo etiqueta={`Producido (${receta.unidad ?? 'unidades'})`} value={producida} onChangeText={setProducida} keyboardType="decimal-pad" />
                  {plan > 0 && <Text style={e.suave}>{Math.round(prod / plan * 1000) / 10}% de lo planificado</Text>}
                </View>
              </View>

              {receta.ingredientes_ocultos ? <Text style={e.suave}>Tu rol no tiene permiso para ver los ingredientes de la receta.</Text> : (<>
              <Text style={e.subetiqueta}>Ingredientes (si se usó otra cantidad, escríbela en «Real»)</Text>
              <View style={e.cabeceraTabla}>
                <Text style={[e.th, { flex: 1 }]}>Ingrediente</Text>
                <Text style={[e.th, e.colNum]}>Receta</Text>
                <Text style={[e.th, { width: 104, textAlign: 'center' }]}>Real</Text>
                <Text style={[e.th, e.colNum]}>Existencia</Text>
              </View>
              {consumos.map((c) => (
                <View key={c.producto_id} style={e.fila}>
                  <Text style={[e.texto, { flex: 1 }]}>{c.producto}</Text>
                  <Text style={[e.texto, e.colNum]}>{conUnidad(c.teorica, c.unidad)}</Text>
                  <TextInput style={e.cantidad} value={reales[c.producto_id] ?? ''} keyboardType="decimal-pad" placeholder={String(c.teorica)}
                    placeholderTextColor={C.tenue} onChangeText={(v) => setReales((r) => ({ ...r, [c.producto_id]: v }))} />
                  <Text style={[e.suave, e.colNum, c.falta && { color: C.peligro, fontWeight: '700' }]}>
                    {c.stock === null ? 'Sin control' : conUnidad(c.stock, c.unidad)}
                  </Text>
                </View>
              ))}
              {consumos.some((c) => c.falta) && <Text style={e.error}>No hay existencia suficiente de algún ingrediente: registra primero la compra o el ajuste.</Text>}
              </>)}

              <Campo etiqueta="Observaciones (opcional)" value={obs} onChangeText={setObs} maxLength={500} />
              {!receta.ingredientes_ocultos && (
                <Text style={e.texto}>
                  Costo estimado: <Text style={e.negrita}>{dinero(costoEstimado)}</Text>
                  {prod > 0 ? ` · ${dinero4(costoEstimado / prod)} por ${receta.unidad ?? 'unidad'}` : ''}
                </Text>
              )}
              <Boton titulo="Registrar producción" variante="exito" cargando={guardando} deshabilitado={!(prod > 0) || !(plan > 0)} onPress={registrar} />
            </>
          )}
        </View>
      )}

      <View style={e.bloque}>
        <View style={e.filaTitulo}>
          <Text style={e.etiqueta}>Producido · {textoRango(rango)}</Text>
          <Text style={e.texto}>Costo <Text style={e.negrita}>{dinero(totalPeriodo)}</Text></Text>
        </View>
        <FiltroFechas valor={rango} onCambio={setRango} />
        {!lista && <Cargando />}
        {lista?.length === 0 && <Text style={e.suave}>Sin producción en el periodo.</Text>}
        {lista?.map((p) => (
          <Pressable key={p.id} onPress={() => abrir(p.id)} style={[e.fila, p.estado === 'anulada' && { opacity: 0.45 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[e.texto, p.estado === 'anulada' && e.tachado]}>{p.numero} · {p.producto}</Text>
              <Text style={e.suave}>{fechaCorta(p.fecha)}{p.usuario ? ` · ${p.usuario}` : ''}{p.estado === 'anulada' ? ' · Anulada' : ''}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={e.texto}>{conUnidad(p.cantidad_producida, p.unidad)}</Text>
              <Text style={[e.suave, p.rendimiento !== null && p.rendimiento < 95 && { color: C.peligro }]}>{p.rendimiento ?? '—'}%</Text>
            </View>
            <View style={{ alignItems: 'flex-end', width: 96 }}>
              <Text style={e.texto}>{dinero(p.costo_total)}</Text>
              <Text style={e.suave}>{dinero4(p.costo_unitario)} c/u</Text>
            </View>
          </Pressable>
        ))}
      </View>

      <Ventana visible={!!detalle && !anulando} titulo={detalle ? `${detalle.numero} · ${detalle.producto ?? ''}` : ''}
        subtitulo={detalle ? `${fechaCorta(detalle.fecha)}${detalle.version ? ` · receta v${detalle.version}` : ''}${detalle.usuario ? ` · ${detalle.usuario}` : ''}${detalle.turno ? ` · turno ${detalle.turno}` : ''}` : undefined}
        onCerrar={() => setDetalle(null)} ancho={640}
        pie={<>
          {puedeRegistrar && detalle?.estado === 'registrada' && <Boton estilo={{ flex: 1 }} titulo="Anular" variante="peligro" onPress={() => setAnulando(detalle)} />}
          <Boton estilo={{ flex: 1 }} titulo="Cerrar" variante="neutro" onPress={() => setDetalle(null)} />
        </>}>
        {detalle && (
          <>
            <Etiqueta texto={detalle.estado === 'anulada' ? 'Anulada' : 'Registrada'}
              fondo={detalle.estado === 'anulada' ? '#FEE2E2' : '#DCFCE7'} color={detalle.estado === 'anulada' ? C.peligro : '#166534'} />
            {detalle.motivo_anulacion && <Text style={e.error}>Anulada: {detalle.motivo_anulacion}</Text>}
            <View style={e.tarjetas}>
              <Tarjeta titulo="Planificado" valor={conUnidad(detalle.cantidad_planificada, detalle.unidad)} />
              <Tarjeta titulo="Producido" valor={conUnidad(detalle.cantidad_producida, detalle.unidad)}
                nota={`${detalle.rendimiento ?? '—'}% de lo planificado`} malo={detalle.rendimiento !== null && detalle.rendimiento < 95} />
              <Tarjeta titulo="Costo" valor={dinero(detalle.costo_total)} nota={`${dinero4(detalle.costo_unitario)} c/u`} />
            </View>
            {detalle.ingredientes_ocultos ? <Text style={e.suave}>Tu rol no tiene permiso para ver los ingredientes de la receta.</Text> : (<>
            <View style={e.cabeceraTabla}>
              <Text style={[e.th, { flex: 1 }]}>Ingrediente</Text>
              <Text style={[e.th, e.colNum]}>Teórico</Text>
              <Text style={[e.th, e.colNum]}>Real</Text>
              <Text style={[e.th, e.colNum]}>Dif.</Text>
              <Text style={[e.th, e.colNum]}>Costo</Text>
            </View>
            {detalle.consumos?.map((c) => (
              <View key={c.producto_id} style={e.fila}>
                <Text style={[e.texto, { flex: 1 }]}>{c.producto}</Text>
                <Text style={[e.texto, e.colNum]}>{conUnidad(c.cantidad_teorica, c.unidad)}</Text>
                <Text style={[e.texto, e.colNum]}>{conUnidad(c.cantidad_real, c.unidad)}</Text>
                <Diferencia valor={c.diferencia} unidad={c.unidad} />
                <Text style={[e.texto, e.colNum]}>{dinero(c.costo_total)}</Text>
              </View>
            ))}
            </>)}
            {detalle.observaciones ? <Text style={e.suave}>Obs.: {detalle.observaciones}</Text> : null}
          </>
        )}
      </Ventana>

      <VentanaMotivo visible={!!anulando} titulo={`Anular ${anulando?.numero ?? ''}`}
        subtitulo={anulando ? `${conUnidad(anulando.cantidad_producida, anulando.unidad)} de ${anulando.producto}` : undefined}
        aviso="Sale del inventario lo producido y los ingredientes vuelven a su existencia. Queda en auditoría."
        onCerrar={() => setAnulando(null)} onConfirmar={(m) => (anulando ? op.anularProduccion(anulando.id, m) : Promise.reject(new Error('Elige qué anular')))}
        onListo={() => { const id = anulando?.id; setAnulando(null); setDetalle(null); cargarLista(); cargarCatalogo(); if (id) abrir(id); }} />
    </ScrollView>
  );
}

function Tarjeta({ titulo, valor, nota, malo, aviso }: { titulo: string; valor: string; nota?: string; malo?: boolean; aviso?: boolean }) {
  return (
    <View style={[e.tarjeta, aviso && { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
      <Text style={e.suave}>{titulo}</Text>
      <Text style={e.valor}>{valor}</Text>
      {nota && <Text style={[e.suave, malo === true && { color: C.peligro }, malo === false && { color: '#15803D' }]}>{nota}</Text>}
    </View>
  );
}

function Diferencia({ valor, unidad }: { valor: number; unidad: string | null }) {
  return (
    <Text style={[e.texto, e.colNum, { color: valor > 0 ? C.peligro : valor < 0 ? '#15803D' : C.tenue }]}>
      {valor === 0 ? '—' : `${valor > 0 ? '+' : ''}${conUnidad(valor, unidad)}`}
    </Text>
  );
}

// ── Mermas ────────────────────────────────────────────────────
interface Fila { cantidad: string; motivo: string; detalle: string; uuid: string }
type Grupo = 'venta' | 'materia' | 'todo' | 'con_merma';

// Lo escrito se guarda en la tablet hasta registrarlo: salir de la pantalla no lo borra
const BORRADOR = 'mermas_borrador';

function Mermas() {
  const { puede } = useSesion();
  const puedeRegistrar = puede('mermas.registrar');

  const [productos, setProductos] = useState<op.ProductoProduccion[] | null>(null);
  const [motivos, setMotivos] = useState<Record<string, string>>({ vencido: 'Vencido', quemado: 'Quemado', danado: 'Dañado', otro: 'Otro' });
  const [fecha, setFecha] = useState(hoy());
  const [filas, setFilas] = useState<Record<number, Fila>>({});
  const [borradorListo, setBorradorListo] = useState(false);
  const [buscar, setBuscar] = useState('');
  const [grupo, setGrupo] = useState<Grupo>('venta');
  const [guardando, setGuardando] = useState(false);

  const [rango, setRango] = useState<Rango>(rangoDe('hoy'));
  const [registradas, setRegistradas] = useState<{ mermas: op.MermaLista[]; total: number } | null>(null);
  const [anulando, setAnulando] = useState<op.MermaLista | null>(null);

  const cargarCatalogo = useCallback(() => {
    op.getCatalogoProduccion().then((c) => { setProductos(c.productos); setMotivos(c.motivos); })
      .catch((err) => avisar('No se pudo cargar', mensajeError(err)));
  }, []);
  const cargarLista = useCallback(() => {
    op.getMermas({ desde: rango.desde, hasta: rango.hasta }).then(setRegistradas).catch((err) => avisar('No se pudieron cargar las mermas', mensajeError(err)));
  }, [rango]);
  useFocusEffect(useCallback(() => { if (puedeRegistrar) cargarCatalogo(); }, [puedeRegistrar, cargarCatalogo]));
  useFocusEffect(useCallback(() => { cargarLista(); }, [cargarLista]));

  useEffect(() => {
    leerJson<{ fecha?: string; filas?: Record<number, Fila> }>(BORRADOR).then((b) => {
      if (b?.filas) setFilas(b.filas);
      if (b?.fecha) setFecha(b.fecha);
    }).finally(() => setBorradorListo(true));
  }, []);
  useEffect(() => {
    if (!borradorListo) return;
    const vacio = !Object.values(filas).some((f) => f.cantidad || f.detalle);
    (vacio ? borrarJson(BORRADOR) : guardarJson(BORRADOR, { fecha, filas })).catch(() => null);
  }, [fecha, filas, borradorListo]);

  const fila = useCallback((id: number): Fila => filas[id] ?? { cantidad: '', motivo: 'vencido', detalle: '', uuid: '' }, [filas]);
  const conMerma = useCallback((id: number) => Number(filas[id]?.cantidad || 0) > 0, [filas]);
  const cambiar = (id: number, cambios: Partial<Fila>) =>
    setFilas((f) => {
      const actual = f[id] ?? { cantidad: '', motivo: 'vencido', detalle: '', uuid: '' };
      return { ...f, [id]: { ...actual, uuid: actual.uuid || nuevoUuid(), ...cambios } };
    });

  // Grupos: lo de vitrina (se vende), la materia prima, todo con existencia y lo que ya lleva merma.
  // Al buscar se ve cualquier producto con inventario. Lo que ya tiene cantidad escrita nunca se esconde.
  const todos = useMemo(() => (productos ?? []).filter((p) => p.controla_stock), [productos]);
  const delGrupo = useCallback((g: Grupo) => todos.filter((p) => conMerma(p.id) || (
    g === 'venta' ? p.se_vende && (p.stock ?? 0) > 0
      : g === 'materia' ? !p.se_vende && (p.stock ?? 0) > 0
        : g === 'todo' ? (p.stock ?? 0) > 0
          : false)), [todos, conMerma]);
  const visibles = useMemo(() => {
    const t = sinTildes(buscar.trim());
    return t ? todos.filter((p) => sinTildes(p.nombre).includes(t) || conMerma(p.id)) : delGrupo(grupo);
  }, [todos, buscar, grupo, delGrupo, conMerma]);

  const conCantidad = todos.filter((p) => conMerma(p.id));
  const costo = conCantidad.reduce((s, p) => s + Number(fila(p.id).cantidad) * p.costo_unitario, 0);
  const excede = conCantidad.some((p) => p.stock !== null && Number(fila(p.id).cantidad) > p.stock + 0.0001);

  const registrar = async () => {
    setGuardando(true);
    try {
      const res = await op.registrarMermas(fecha, conCantidad.map((p) => ({
        uuid: fila(p.id).uuid || nuevoUuid(), producto_id: p.id, cantidad: Number(fila(p.id).cantidad),
        motivo: fila(p.id).motivo, detalle: fila(p.id).detalle.trim() || undefined,
      })));
      avisar(res.message);
      setFilas({});
      cargarLista();
      cargarCatalogo();
    } catch (err) {
      avisar('No se pudo registrar', mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={e.contenido} keyboardShouldPersistTaps="handled">
      {puedeRegistrar && (
        <View style={e.bloque}>
          <Text style={e.etiqueta}>Lo que no se vendió, se quemó o se dañó</Text>
          <Text style={e.suave}>Sale del inventario a su costo. Lo escrito se guarda en la tablet hasta que lo registres.</Text>
          <Text style={e.subetiqueta}>Fecha</Text>
          <SelectorFecha valor={fecha} onCambio={setFecha} />
          <TextInput style={e.buscar} value={buscar} onChangeText={setBuscar} placeholder="Buscar cualquier producto (fresas, empaque...)" placeholderTextColor={C.tenue} />
          {!buscar.trim() && (
            <View style={e.opciones}>
              {([['venta', 'A la venta'], ['materia', 'Materia prima'], ['todo', 'Todo con existencia'], ['con_merma', 'Con merma escrita']] as const).map(([g, t]) => (
                <Pressable key={g} onPress={() => setGrupo(g)} style={[e.chip, grupo === g && e.opcionActiva]}>
                  <Text style={[e.chipTexto, grupo === g && { color: '#fff' }]}>{t} ({delGrupo(g).length})</Text>
                </Pressable>
              ))}
            </View>
          )}
          {!productos && <Cargando />}
          {productos && visibles.length === 0 && (
            <Text style={e.suave}>{buscar.trim() ? 'Ningún producto con inventario coincide.' : grupo === 'con_merma' ? 'Todavía no escribiste ninguna merma.' : 'No hay productos con existencia en este grupo.'}</Text>
          )}
          {visibles.map((p) => {
            const f = fila(p.id);
            const cant = Number(f.cantidad || 0);
            return (
              <View key={p.id} style={[e.filaMerma, cant > 0 && { backgroundColor: '#FFFBEB' }]}>
                <View style={e.filaInterna}>
                  <View style={{ flex: 1 }}>
                    <Text style={e.texto}>{p.nombre}</Text>
                    <Text style={e.suave}>hay {conUnidad(p.stock ?? 0, p.unidad)}{cant > 0 ? ` · costo ${dinero(cant * p.costo_unitario)}` : ''}</Text>
                  </View>
                  <TextInput style={e.cantidad} value={f.cantidad} keyboardType={p.permite_fraccion ? 'decimal-pad' : 'number-pad'} placeholder="0"
                    placeholderTextColor={C.tenue} onChangeText={(v) => cambiar(p.id, { cantidad: v })} />
                </View>
                {cant > 0 && (
                  <>
                    <View style={e.opciones}>
                      {Object.entries(motivos).map(([v, t]) => (
                        <Pressable key={v} onPress={() => cambiar(p.id, { motivo: v })} style={[e.chipChico, f.motivo === v && e.opcionActiva]}>
                          <Text style={[e.chipTexto, f.motivo === v && { color: '#fff' }]}>{t}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <TextInput style={e.detalle} value={f.detalle} maxLength={300} placeholder="Detalle (opcional)" placeholderTextColor={C.tenue}
                      onChangeText={(v) => cambiar(p.id, { detalle: v })} />
                  </>
                )}
              </View>
            );
          })}
          {excede && <Text style={[e.suave, { color: C.aviso }]}>Alguna merma es mayor que la existencia registrada.</Text>}
          <Text style={e.texto}>{conCantidad.length} producto(s) · costo <Text style={e.negrita}>{dinero(costo)}</Text></Text>
          <Boton titulo={`Registrar ${conCantidad.length} merma(s)`} variante="peligro" cargando={guardando} deshabilitado={conCantidad.length === 0} onPress={registrar} />
        </View>
      )}

      <View style={e.bloque}>
        <View style={e.filaTitulo}>
          <Text style={e.etiqueta}>Mermas · {textoRango(rango)}</Text>
          <Text style={e.texto}>Costo <Text style={e.negrita}>{dinero(registradas?.total ?? 0)}</Text></Text>
        </View>
        <FiltroFechas valor={rango} onCambio={setRango} />
        {!registradas && <Cargando />}
        {registradas?.mermas.length === 0 && <Text style={e.suave}>Sin mermas en el periodo.</Text>}
        {registradas?.mermas.map((m) => (
          <View key={m.id} style={[e.fila, m.anulada && { opacity: 0.45 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[e.texto, m.anulada && e.tachado]}>{conUnidad(m.cantidad, m.unidad)} · {m.producto}</Text>
              <Text style={e.suave}>
                {fechaCorta(m.fecha)} · {m.motivo_texto}{m.detalle ? ` · ${m.detalle}` : ''}{m.usuario ? ` · ${m.usuario}` : ''}{m.turno ? ` · turno ${m.turno}` : ''}
              </Text>
              {m.anulada && m.motivo_anulacion ? <Text style={e.suave}>Anulada: {m.motivo_anulacion}</Text> : null}
            </View>
            <Text style={[e.texto, e.negrita, m.anulada && e.tachado]}>{dinero(m.costo_total)}</Text>
            {m.anulada
              ? <Text style={e.suave}>Anulada</Text>
              : puedeRegistrar && <Pressable onPress={() => setAnulando(m)} hitSlop={8}><Text style={e.anular}>Anular</Text></Pressable>}
          </View>
        ))}
      </View>

      <VentanaMotivo visible={!!anulando} titulo="Anular merma"
        subtitulo={anulando ? `${conUnidad(anulando.cantidad, anulando.unidad)} de ${anulando.producto}` : undefined}
        aviso="La cantidad vuelve al inventario." ejemplo="Se escribió en el producto equivocado..."
        onCerrar={() => setAnulando(null)} onConfirmar={(m) => (anulando ? op.anularMerma(anulando.id, m) : Promise.reject(new Error('Elige qué anular')))}
        onListo={() => { setAnulando(null); cargarLista(); cargarCatalogo(); }} />
    </ScrollView>
  );
}

// ── Resumen ───────────────────────────────────────────────────
// Rendimiento real frente al planificado, desvíos de consumo y mermas del periodo
function Resumen() {
  const [rango, setRango] = useState<Rango>(rangoDe('7'));
  const [datos, setDatos] = useState<op.ResumenProduccion | null>(null);

  useFocusEffect(useCallback(() => {
    setDatos(null);
    op.getResumenProduccion({ desde: rango.desde, hasta: rango.hasta }).then(setDatos)
      .catch((err) => avisar('No se pudo cargar el resumen', mensajeError(err)));
  }, [rango]));

  return (
    <ScrollView contentContainerStyle={e.contenido}>
      <FiltroFechas valor={rango} onCambio={setRango} />
      {!datos && <Cargando />}
      {datos && (
        <>
          <View style={e.tarjetas}>
            <Tarjeta titulo="Producciones" valor={String(datos.totales.producciones)} />
            <Tarjeta titulo="Costo producido" valor={dinero(datos.totales.costo)} />
            <Tarjeta titulo="Mermas" valor={String(datos.totales.mermas)} />
            <Tarjeta titulo="Costo de mermas" valor={dinero(datos.totales.costo_mermas)} aviso={datos.totales.costo_mermas > 0}
              nota={datos.totales.costo > 0 ? `${Math.round(datos.totales.costo_mermas / datos.totales.costo * 1000) / 10}% de lo producido` : undefined} />
          </View>

          <View style={e.bloque}>
            <Text style={e.etiqueta}>Por producto</Text>
            {datos.por_producto.length === 0 && <Text style={e.suave}>Sin producción.</Text>}
            {datos.por_producto.map((p) => (
              <View key={p.producto_id} style={e.fila}>
                <View style={{ flex: 1 }}>
                  <Text style={e.texto}>{p.producto}</Text>
                  <Text style={e.suave}>{conUnidad(p.producida, p.unidad)} de {conUnidad(p.planificada, p.unidad)} planificados</Text>
                </View>
                <Text style={[e.texto, e.negrita, { color: p.rendimiento !== null && p.rendimiento < 95 ? C.peligro : '#15803D' }]}>{p.rendimiento ?? '—'}%</Text>
                <View style={{ alignItems: 'flex-end', width: 96 }}>
                  <Text style={e.texto}>{dinero(p.costo_total)}</Text>
                  <Text style={e.suave}>{dinero4(p.costo_unitario)} c/u</Text>
                </View>
              </View>
            ))}
          </View>

          {!datos.ingredientes_ocultos && (
          <View style={e.bloque}>
            <Text style={e.etiqueta}>Consumo de ingredientes (real frente a receta)</Text>
            <View style={e.cabeceraTabla}>
              <Text style={[e.th, { flex: 1 }]}>Ingrediente</Text>
              <Text style={[e.th, e.colNum]}>Receta</Text>
              <Text style={[e.th, e.colNum]}>Real</Text>
              <Text style={[e.th, e.colNum]}>Dif.</Text>
              <Text style={[e.th, e.colNum]}>Costo</Text>
            </View>
            {datos.consumos.length === 0 && <Text style={e.suave}>Sin consumos.</Text>}
            {datos.consumos.map((c) => (
              <View key={c.producto_id} style={e.fila}>
                <Text style={[e.texto, { flex: 1 }]}>{c.producto}</Text>
                <Text style={[e.texto, e.colNum]}>{conUnidad(c.teorica, c.unidad)}</Text>
                <Text style={[e.texto, e.colNum]}>{conUnidad(c.real, c.unidad)}</Text>
                <Diferencia valor={c.diferencia} unidad={c.unidad} />
                <Text style={[e.texto, e.colNum]}>{dinero(c.costo)}</Text>
              </View>
            ))}
          </View>
          )}

          <View style={e.bloque}>
            <Text style={e.etiqueta}>Mermas por motivo</Text>
            {datos.mermas.por_motivo.length === 0 && <Text style={e.suave}>Sin mermas.</Text>}
            {datos.mermas.por_motivo.map((m) => (
              <View key={m.motivo} style={e.fila}>
                <Text style={[e.texto, { flex: 1 }]}>{m.texto}</Text>
                <Text style={[e.suave, e.colNum]}>{m.cantidad} registro(s)</Text>
                <Text style={[e.texto, e.colNum]}>{dinero(m.costo)}</Text>
              </View>
            ))}
          </View>

          <View style={e.bloque}>
            <Text style={e.etiqueta}>Por día</Text>
            {datos.por_dia.length === 0 && <Text style={e.suave}>Sin datos.</Text>}
            {datos.por_dia.length > 0 && (
              <View style={e.cabeceraTabla}>
                <Text style={[e.th, { flex: 1 }]}>Día</Text>
                <Text style={[e.th, e.colNum]}>Producciones</Text>
                <Text style={[e.th, e.colNum]}>Costo</Text>
                <Text style={[e.th, e.colNum]}>Mermas</Text>
              </View>
            )}
            {datos.por_dia.map((d) => (
              <View key={d.fecha} style={e.fila}>
                <Text style={[e.texto, { flex: 1 }]}>{fechaCorta(d.fecha)}</Text>
                <Text style={[e.texto, e.colNum]}>{d.producciones}</Text>
                <Text style={[e.texto, e.colNum]}>{dinero(d.costo)}</Text>
                <Text style={[e.texto, e.colNum]}>{dinero(d.mermas)}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const e = StyleSheet.create({
  anular: { color: C.peligro, fontWeight: '700', fontSize: 14 },
  pantalla: { flex: 1, backgroundColor: C.fondo },
  pestanas: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderColor: C.borde },
  pestana: { flex: 1, height: 50, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3, borderColor: 'transparent' },
  pestanaActiva: { borderColor: C.primario },
  pestanaTexto: { fontSize: 15, fontWeight: '700', color: C.suave },
  contenido: { padding: 16, gap: 14, maxWidth: 900, width: '100%', alignSelf: 'center' },
  bloque: { backgroundColor: '#fff', borderRadius: radio, borderWidth: 1, borderColor: C.borde, padding: 14, gap: 10 },
  etiqueta: { fontSize: 16, fontWeight: '700', color: C.texto },
  subetiqueta: { fontSize: 14, fontWeight: '600', color: '#374151', marginTop: 4 },
  texto: { fontSize: 15, color: C.texto },
  negrita: { fontWeight: '700' },
  tachado: { textDecorationLine: 'line-through' },
  suave: { fontSize: 13, color: C.suave },
  error: { fontSize: 14, color: C.peligro },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderColor: '#F3F4F6' },
  filaTitulo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  filaMerma: { gap: 8, paddingVertical: 8, paddingHorizontal: 6, borderTopWidth: 1, borderColor: '#F3F4F6', borderRadius: 8 },
  filaInterna: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cabeceraTabla: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 4 },
  th: { fontSize: 12, fontWeight: '700', color: C.suave, textTransform: 'uppercase' },
  colNum: { width: 92, textAlign: 'right' },
  dosColumnas: { flexDirection: 'row', gap: 12 },
  opciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opcion: { minHeight: 52, paddingHorizontal: 14, paddingVertical: 6, borderRadius: radio, borderWidth: 1, borderColor: '#D1D5DB', justifyContent: 'center' },
  opcionActiva: { backgroundColor: C.primario, borderColor: C.primario },
  opcionTexto: { fontSize: 15, fontWeight: '700', color: C.texto },
  chip: { paddingHorizontal: 14, height: 42, justifyContent: 'center', borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: C.borde },
  chipChico: { paddingHorizontal: 12, height: 38, justifyContent: 'center', borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: C.borde },
  chipTexto: { fontSize: 14, fontWeight: '600', color: C.texto },
  buscar: { height: 48, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: radio, paddingHorizontal: 14, fontSize: 16, color: C.texto },
  cantidad: { width: 104, height: 48, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: radio, paddingHorizontal: 10, fontSize: 18, textAlign: 'center', color: C.texto, backgroundColor: '#fff' },
  detalle: { height: 44, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: radio, paddingHorizontal: 12, fontSize: 15, color: C.texto, backgroundColor: '#fff' },
  tarjetas: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tarjeta: { flexGrow: 1, flexBasis: 150, backgroundColor: '#fff', borderRadius: radio, borderWidth: 1, borderColor: C.borde, padding: 12, gap: 2 },
  valor: { fontSize: 22, fontWeight: '700', color: C.texto },
});
