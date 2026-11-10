import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Encabezado } from '@/components/encabezado';
import { FiltroFechas, rangoDe } from '@/components/filtroFechas';
import { Boton, Campo, Etiqueta, Ventana } from '@/components/ui';
import { C, radio } from '@/constants/colores';
import { mensajeError } from '@/lib/api';
import { avisar, confirmar } from '@/lib/aviso';
import { cantidad, dinero, fecha, hoy } from '@/lib/formato';
import * as op from '@/lib/operaciones';
import { useSesion } from '@/lib/sesion';

const FILTROS = [['', 'Todo'], ['alerta', 'En su mínimo'], ['sin_stock', 'Sin existencia']] as const;
const CLASES: Record<string, string> = { producto_terminado: 'Producto', materia_prima: 'Materia prima', reventa: 'Reventa', empaque: 'Empaque' };
const MOTIVOS_SALIDA = ['Consumo del personal', 'Regalía', 'Uso en el local', 'Prueba o degustación'];
const MOTIVOS_ENTRADA = ['Regalo del proveedor', 'Préstamo', 'Devolución de un préstamo', 'Inventario inicial'];

type Accion = 'entrada' | 'salida' | 'ajuste';

// Existencias, entradas y salidas manuales, ajuste a lo contado, conteo físico y kárdex.
// Lo vencido o dañado va en Mermas; lo comprado, en Compras
export default function Inventario() {
  const { cajaId, puede } = useSesion();
  const [estado, setEstado] = useState<(typeof FILTROS)[number][0]>('');
  const [buscar, setBuscar] = useState('');
  const [productos, setProductos] = useState<op.Existencia[] | null>(null);
  const [error, setError] = useState('');
  const [conTurno, setConTurno] = useState(false);
  const [elegido, setElegido] = useState<op.Existencia | null>(null);
  const [accion, setAccion] = useState<{ tipo: Accion; producto: op.Existencia } | null>(null);
  const [kardex, setKardex] = useState<op.Existencia | null>(null);
  const [contando, setContando] = useState(false);

  const cargar = useCallback(() => {
    op.getExistencias({ estado, buscar: buscar.trim() || undefined })
      .then((p) => { setProductos(p); setError(''); })
      .catch((err) => setError(mensajeError(err)));
  }, [estado, buscar]);

  useEffect(() => {
    const t = setTimeout(cargar, 400);
    return () => clearTimeout(t);
  }, [cargar]);

  // Sin turno abierto solo se consulta: lo que se registra queda a nombre del turno
  useEffect(() => {
    if (!cajaId) return;
    op.getTurnoCaja(cajaId).then((r) => setConTurno(!!r.turno)).catch(() => setConTurno(false));
  }, [cajaId]);

  const registra = conTurno && puede('inventario.registrar');
  const ajusta = conTurno && puede('inventario.ajustar');
  const veKardex = puede('inventario.kardex');
  const enAlerta = (productos ?? []).filter((p) => p.bajo_minimo).length;
  const tocable = registra || ajusta || veKardex;

  return (
    <SafeAreaView style={e.pantalla} edges={['top', 'left', 'right', 'bottom']}>
      <Encabezado titulo="Inventario" subtitulo={productos ? `${productos.length} producto(s) · ${enAlerta} en su mínimo` : undefined}
        derecha={ajusta ? <Boton titulo="Conteo físico" chico variante="contorno" onPress={() => setContando(true)} /> : null} />
      <View style={e.filtros}>
        <TextInput style={e.buscar} value={buscar} onChangeText={setBuscar} placeholder="Buscar producto" placeholderTextColor={C.tenue} />
        <View style={e.chips}>
          {FILTROS.map(([v, t]) => (
            <Pressable key={v} onPress={() => setEstado(v)} style={[e.chip, estado === v && e.chipActivo]}>
              <Text style={[e.chipTexto, estado === v && { color: '#fff' }]}>{t}</Text>
            </Pressable>
          ))}
        </View>
        {tocable
          ? <Text style={e.suave}>Toca un producto para ver su kárdex o registrar una entrada, una salida o un ajuste.</Text>
          : puede('inventario.registrar') && <Text style={e.suave}>Abre tu turno para registrar movimientos de inventario.</Text>}
        {!conTurno && (puede('inventario.registrar') || puede('inventario.ajustar')) && veKardex && <Text style={e.suave}>Sin turno abierto solo se puede ver el kárdex.</Text>}
      </View>
      {error ? <Text style={e.error}>{error}</Text> : null}
      <FlatList
        data={productos ?? []}
        keyExtractor={(p) => String(p.producto_id)}
        contentContainerStyle={e.lista}
        ListEmptyComponent={<Text style={e.vacio}>{productos ? 'Sin productos' : 'Cargando...'}</Text>}
        renderItem={({ item: p }) => (
          <Pressable disabled={!tocable} onPress={() => setElegido(p)}
            style={({ pressed }) => [e.producto, p.bajo_minimo && { borderColor: '#FCA5A5' }, pressed && { opacity: 0.7 }]}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={e.titulo}>{p.producto}</Text>
              <Text style={e.suave}>{CLASES[p.clase] ?? p.clase}{p.categorias.length ? ` · ${p.categorias.join(', ')}` : ''} · costo {dinero(p.costo_unitario)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={[e.existencia, p.stock_actual <= 0 ? { color: C.peligro } : p.bajo_minimo ? { color: C.aviso } : null]}>
                {cantidad(p.stock_actual)} {p.unidad ?? ''}
              </Text>
              {p.stock_minimo > 0 && <Text style={e.suave}>mínimo {cantidad(p.stock_minimo)}</Text>}
              {p.bajo_minimo && <Etiqueta texto="Comprar" fondo="#FEF3C7" color="#92400E" />}
            </View>
          </Pressable>
        )}
      />

      {elegido && (
        <Ventana visible titulo={elegido.producto} subtitulo={`Hay ${cantidad(elegido.stock_actual)} ${elegido.unidad ?? ''} · costo ${dinero(elegido.costo_unitario)}`}
          onCerrar={() => setElegido(null)} ancho={480}>
          {veKardex && <Boton titulo="Ver kárdex (entradas y salidas)" variante="contorno" onPress={() => { setKardex(elegido); setElegido(null); }} />}
          {registra && <Boton titulo="+ Entrada (llegó sin compra)" variante="contorno" onPress={() => { setAccion({ tipo: 'entrada', producto: elegido }); setElegido(null); }} />}
          {registra && <Boton titulo="− Salida (consumo, regalía, uso)" variante="contorno" onPress={() => { setAccion({ tipo: 'salida', producto: elegido }); setElegido(null); }} />}
          {ajusta && <Boton titulo="Ajustar a lo contado" variante="contorno" onPress={() => { setAccion({ tipo: 'ajuste', producto: elegido }); setElegido(null); }} />}
          <Text style={e.suave}>Lo vencido, quemado o dañado se registra en Producción › Mermas. Lo comprado, en Compras.</Text>
        </Ventana>
      )}

      {accion && <Movimiento key={`${accion.tipo}-${accion.producto.producto_id}`} tipo={accion.tipo} producto={accion.producto}
        onCerrar={() => setAccion(null)} onListo={() => { setAccion(null); cargar(); }} />}
      {kardex && <VerKardex producto={kardex} onCerrar={() => setKardex(null)} />}
      {contando && <Conteo onCerrar={() => setContando(false)} onListo={() => { setContando(false); cargar(); }} />}
    </SafeAreaView>
  );
}

const TITULOS: Record<Accion, string> = { entrada: 'Entrada de inventario', salida: 'Salida de inventario', ajuste: 'Ajustar a lo contado' };

function Movimiento({ tipo, producto, onCerrar, onListo }: { tipo: Accion; producto: op.Existencia; onCerrar: () => void; onListo: () => void }) {
  const [cant, setCant] = useState('');
  const [costo, setCosto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const valor = Number(cant.replace(',', '.'));
  const diferencia = tipo === 'ajuste' && cant !== '' ? valor - producto.stock_actual : 0;
  const valido = (tipo === 'ajuste' ? cant !== '' && valor >= 0 && Math.abs(diferencia) > 0.0001 : valor > 0) && motivo.trim().length >= 3;
  const motivos = tipo === 'entrada' ? MOTIVOS_ENTRADA : tipo === 'salida' ? MOTIVOS_SALIDA : ['Conteo físico', 'Error de registro', 'Producto encontrado'];

  const guardar = async () => {
    setGuardando(true);
    try {
      await op.registrarInventario({
        fecha: hoy(), tipo, descripcion: motivo.trim(),
        items: [{ producto_id: producto.producto_id, cantidad: valor, costo_unitario: tipo === 'entrada' && costo ? Number(costo) : undefined }],
      });
      avisar('Inventario actualizado', tipo === 'ajuste'
        ? `${producto.producto}: queda en ${cantidad(valor)} ${producto.unidad ?? ''}`
        : `${producto.producto}: ${tipo === 'entrada' ? '+' : '−'}${cantidad(valor)} ${producto.unidad ?? ''}`);
      onListo();
    } catch (err) {
      avisar('No se pudo registrar', mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Ventana visible titulo={TITULOS[tipo]} subtitulo={`${producto.producto} · hay ${cantidad(producto.stock_actual)} ${producto.unidad ?? ''}`}
      onCerrar={onCerrar} ancho={520}
      pie={<Boton estilo={{ flex: 1 }} titulo="Registrar" variante={tipo === 'salida' ? 'peligro' : 'primario'} cargando={guardando} deshabilitado={!valido} onPress={guardar} />}>
      <Campo etiqueta={tipo === 'ajuste' ? `¿Cuánto hay contado? (${producto.unidad ?? 'unidades'})` : `Cantidad (${producto.unidad ?? 'unidades'})`}
        value={cant} onChangeText={setCant} keyboardType="decimal-pad" placeholder="0" autoFocus />
      {tipo === 'ajuste' && cant !== '' && (
        <Text style={[e.texto, { color: diferencia < 0 ? C.peligro : diferencia > 0 ? C.exito : C.suave }]}>
          {Math.abs(diferencia) < 0.0001 ? 'Cuadra: no hay que ajustar' : `${diferencia < 0 ? 'Faltan' : 'Sobran'} ${cantidad(Math.abs(diferencia))} ${producto.unidad ?? ''} (${dinero(Math.abs(diferencia) * producto.costo_unitario)})`}
        </Text>
      )}
      {tipo === 'entrada' && (
        <Campo etiqueta="Costo por unidad (opcional, entra al costo promedio)" value={costo} onChangeText={(t) => setCosto(t.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder={String(producto.costo_unitario)} />
      )}
      <Text style={e.etiqueta}>Motivo</Text>
      <View style={e.chips}>
        {motivos.map((m) => (
          <Pressable key={m} onPress={() => setMotivo(m)} style={[e.chip, motivo === m && e.chipActivo]}>
            <Text style={[e.chipTexto, motivo === m && { color: '#fff' }]}>{m}</Text>
          </Pressable>
        ))}
      </View>
      <Campo value={motivo} onChangeText={setMotivo} placeholder="U otro motivo..." />
      {tipo !== 'entrada' && <Text style={e.suave}>Si el producto es ingrediente de una receta, bajarlo pide el PIN de un encargado.</Text>}
    </Ventana>
  );
}

function VerKardex({ producto, onCerrar }: { producto: op.Existencia; onCerrar: () => void }) {
  const [rango, setRango] = useState(() => rangoDe('30'));
  const [datos, setDatos] = useState<op.Kardex | null>(null);
  useEffect(() => {
    op.getKardex(producto.producto_id, { desde: rango.desde, hasta: rango.hasta }).then(setDatos).catch((err) => avisar('No se pudo cargar el kárdex', mensajeError(err)));
  }, [producto.producto_id, rango]);
  const u = producto.unidad ?? '';

  return (
    <Ventana visible titulo={`Kárdex · ${producto.producto}`} subtitulo={datos ? `${fecha(datos.desde)} al ${fecha(datos.hasta)}` : 'Cargando...'} onCerrar={onCerrar} ancho={760}>
      <View style={{ marginHorizontal: -12 }}><FiltroFechas valor={rango} onCambio={setRango} /></View>
      {datos && (
        <>
          <View style={e.resumen}>
            <View style={e.dato}><Text style={e.suave}>Inicial</Text><Text style={e.grande}>{cantidad(datos.saldo_inicial)}</Text></View>
            <View style={e.dato}><Text style={e.suave}>Entradas</Text><Text style={[e.grande, { color: C.exito }]}>+{cantidad(datos.total_entradas)}</Text></View>
            <View style={e.dato}><Text style={e.suave}>Salidas</Text><Text style={[e.grande, { color: C.peligro }]}>−{cantidad(datos.total_salidas)}</Text></View>
            <View style={e.dato}><Text style={e.suave}>Final</Text><Text style={e.grande}>{cantidad(datos.saldo_final)} {u}</Text></View>
          </View>
          {datos.movimientos.length === 0 && <Text style={e.suave}>Sin movimientos en este periodo.</Text>}
          {datos.movimientos.map((m) => (
            <View key={m.id} style={e.mov}>
              <View style={{ flex: 1 }}>
                <Text style={e.texto}>{m.tipo_texto}{m.referencia ? ` · ${m.referencia}` : ''}</Text>
                <Text style={e.suave}>{fecha(m.fecha)}{m.usuario ? ` · ${m.usuario}` : ''}{m.motivo ? ` · ${m.motivo}` : ''}</Text>
              </View>
              <Text style={[e.texto, { minWidth: 70, textAlign: 'right', color: m.entrada ? C.exito : C.peligro }]}>{m.entrada ? `+${cantidad(m.entrada)}` : `−${cantidad(m.salida)}`}</Text>
              <Text style={[e.texto, { minWidth: 70, textAlign: 'right', fontWeight: '700' }]}>{cantidad(m.saldo)}</Text>
            </View>
          ))}
          {datos.total_paginas > 1 && <Text style={e.suave}>Se muestran los 50 movimientos más recientes del periodo; el resto, en la web.</Text>}
        </>
      )}
    </Ventana>
  );
}

// Conteo físico: se escribe lo contado y solo se ajusta lo que tiene diferencia
function Conteo({ onCerrar, onListo }: { onCerrar: () => void; onListo: () => void }) {
  const [productos, setProductos] = useState<op.Existencia[]>([]);
  const [buscar, setBuscar] = useState('');
  const [contado, setContado] = useState<Record<number, string>>({});
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { op.getExistencias({}).then(setProductos).catch((err) => avisar('No se pudo cargar', mensajeError(err))); }, []);

  const visibles = useMemo(() => {
    const t = buscar.trim().toLowerCase();
    return productos.filter((p) => !t || p.producto.toLowerCase().includes(t));
  }, [productos, buscar]);
  const diferencias = productos.filter((p) => contado[p.producto_id] !== undefined && contado[p.producto_id] !== ''
    && Math.abs(Number(contado[p.producto_id]) - p.stock_actual) > 0.0001);
  const valor = diferencias.reduce((t, p) => t + (Number(contado[p.producto_id]) - p.stock_actual) * p.costo_unitario, 0);

  const aplicar = async () => {
    if (!(await confirmar('Aplicar conteo', `Se ajustan ${diferencias.length} producto(s) a lo contado (${valor < 0 ? 'faltante' : 'sobrante'} de ${dinero(Math.abs(valor))}).`, 'Aplicar'))) return;
    setGuardando(true);
    try {
      await op.registrarInventario({
        fecha: hoy(), tipo: 'ajuste', descripcion: 'Conteo físico',
        items: diferencias.map((p) => ({ producto_id: p.producto_id, cantidad: Number(contado[p.producto_id]) })),
      });
      avisar('Conteo aplicado', `${diferencias.length} producto(s) ajustado(s).`);
      onListo();
    } catch (err) {
      avisar('No se pudo aplicar', mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Ventana visible titulo="Conteo físico" subtitulo="Escribe lo que contaste. Solo se ajustan los productos con diferencia." onCerrar={onCerrar} ancho={760}
      pie={<Boton estilo={{ flex: 1 }} titulo={diferencias.length ? `Aplicar ${diferencias.length} ajuste(s) · ${valor < 0 ? '−' : '+'}${dinero(Math.abs(valor))}` : 'Sin diferencias'}
        cargando={guardando} deshabilitado={!diferencias.length} onPress={aplicar} />}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <TextInput style={[e.buscar, { flex: 1 }]} value={buscar} onChangeText={setBuscar} placeholder="Buscar producto" placeholderTextColor={C.tenue} />
        <Boton titulo="Copiar existencias" chico variante="contorno"
          onPress={() => setContado((c) => ({ ...Object.fromEntries(visibles.map((p) => [p.producto_id, String(p.stock_actual)])), ...c }))} />
      </View>
      <Text style={e.suave}>«Copiar existencias» llena lo visible con lo del sistema para que corrijas solo lo distinto.</Text>
      {visibles.map((p) => {
        const v = contado[p.producto_id];
        const dif = v !== undefined && v !== '' ? Number(v) - p.stock_actual : 0;
        return (
          <View key={p.producto_id} style={e.mov}>
            <View style={{ flex: 1 }}>
              <Text style={e.texto}>{p.producto}</Text>
              <Text style={e.suave}>sistema {cantidad(p.stock_actual)} {p.unidad ?? ''}{Math.abs(dif) > 0.0001 ? ` · ${dif < 0 ? 'faltan' : 'sobran'} ${cantidad(Math.abs(dif))}` : ''}</Text>
            </View>
            <TextInput style={[e.contado, Math.abs(dif) > 0.0001 && { borderColor: dif < 0 ? C.peligro : C.exito }]} value={v ?? ''} keyboardType="decimal-pad"
              placeholder="—" placeholderTextColor={C.tenue} onChangeText={(t) => setContado((c) => ({ ...c, [p.producto_id]: t.replace(/[^0-9.]/g, '') }))} />
          </View>
        );
      })}
    </Ventana>
  );
}

const e = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: C.fondo },
  filtros: { padding: 12, gap: 10, maxWidth: 900, width: '100%', alignSelf: 'center' },
  buscar: { height: 48, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: radio, paddingHorizontal: 14, fontSize: 16, backgroundColor: '#fff', color: C.texto },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 16, height: 44, justifyContent: 'center', borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: C.borde },
  chipActivo: { backgroundColor: C.texto, borderColor: C.texto },
  chipTexto: { fontWeight: '600', color: C.texto },
  etiqueta: { fontSize: 14, fontWeight: '600', color: C.texto },
  error: { color: C.peligro, paddingHorizontal: 16 },
  lista: { padding: 12, gap: 8, maxWidth: 900, width: '100%', alignSelf: 'center' },
  vacio: { textAlign: 'center', color: C.suave, padding: 24 },
  producto: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: '#fff', borderRadius: radio, borderWidth: 1, borderColor: C.borde, padding: 14 },
  titulo: { fontSize: 16, fontWeight: '700', color: C.texto },
  texto: { fontSize: 15, color: C.texto },
  suave: { fontSize: 13, color: C.suave },
  existencia: { fontSize: 18, fontWeight: '800', color: C.texto },
  resumen: { flexDirection: 'row', gap: 8 },
  dato: { flex: 1, backgroundColor: '#F9FAFB', borderRadius: radio, padding: 10, gap: 2 },
  grande: { fontSize: 18, fontWeight: '800', color: C.texto },
  mov: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderColor: C.borde },
  contado: { width: 110, height: 48, borderWidth: 2, borderColor: '#D1D5DB', borderRadius: radio, paddingHorizontal: 10, fontSize: 16, textAlign: 'right', color: C.texto, backgroundColor: '#fff' },
});
