import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Encabezado } from '@/components/encabezado';
import { VentanaMotivo } from '@/components/motivo';
import { ProveedorForm } from '@/components/proveedorForm';
import { Boton, Campo, Etiqueta, Ventana } from '@/components/ui';
import { C, radio } from '@/constants/colores';
import { mensajeError } from '@/lib/api';
import { avisar } from '@/lib/aviso';
import { dinero, fecha, nuevoUuid } from '@/lib/formato';
import * as op from '@/lib/operaciones';
import { getCatalogosCaja } from '@/lib/servicios';
import { useSesion } from '@/lib/sesion';
import { MetodoPago } from '@/lib/tipos';

type Ficha = Awaited<ReturnType<typeof op.getProveedor>>;

// Proveedores: registrarlos, ver lo que se les debe y pagarles (desde la caja o fuera de caja)
export default function Proveedores() {
  const { puede } = useSesion();
  const [buscar, setBuscar] = useState('');
  const [lista, setLista] = useState<op.ProveedorFicha[] | null>(null);
  const [error, setError] = useState('');
  const [formulario, setFormulario] = useState<{ proveedor: op.ProveedorFicha | null } | null>(null);
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [pagando, setPagando] = useState(false);
  const [anularPago, setAnularPago] = useState<op.PagoProveedor | null>(null);

  const cargar = useCallback(() => {
    op.getProveedoresFicha(buscar.trim()).then((l) => { setLista(l); setError(''); }).catch((err) => setError(mensajeError(err)));
  }, [buscar]);
  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  const abrirFicha = (id: number) => op.getProveedor(id).then(setFicha).catch((err) => avisar('No se pudo abrir', mensajeError(err)));
  const refrescar = () => {
    cargar();
    if (ficha) abrirFicha(ficha.proveedor.id);
  };

  const gestiona = puede('proveedores.gestionar');
  const paga = puede('cuentas_pagar.gestionar');

  return (
    <SafeAreaView style={e.pantalla} edges={['top', 'left', 'right']}>
      <Encabezado titulo="Proveedores" subtitulo="Lo que se les debe y sus pagos"
        derecha={gestiona ? <Boton titulo="+ Proveedor" chico onPress={() => setFormulario({ proveedor: null })} /> : null} />
      <View style={e.barra}>
        <TextInput style={e.buscar} value={buscar} onChangeText={setBuscar} placeholder="Buscar por nombre, NIT o teléfono"
          placeholderTextColor={C.tenue} returnKeyType="search" onSubmitEditing={cargar} />
      </View>
      {error ? <Text style={e.error}>{error}</Text> : null}
      <FlatList
        data={lista ?? []}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={e.lista}
        ListEmptyComponent={<Text style={e.vacio}>{lista ? 'No hay proveedores. Toca «+ Proveedor» para registrar el primero.' : 'Cargando...'}</Text>}
        renderItem={({ item: p }) => (
          <Pressable onPress={() => abrirFicha(p.id)} style={({ pressed }) => [e.tarjeta, !p.activo && { opacity: 0.55 }, pressed && { opacity: 0.8 }]}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={e.titulo}>{p.nombre}</Text>
              <Text style={e.suave}>{[p.contacto, p.telefono, p.dias_credito ? `${p.dias_credito} días de crédito` : 'Contado'].filter(Boolean).join(' · ')}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              {p.saldo > 0 ? <Text style={e.monto}>Debe {dinero(p.saldo)}</Text> : <Text style={e.suave}>Sin deuda</Text>}
              {(p.vencido ?? 0) > 0 && <Etiqueta texto={`Vencido ${dinero(p.vencido)}`} fondo="#FEE2E2" color="#B91C1C" />}
              {!p.activo && <Etiqueta texto="Inactivo" fondo="#E5E7EB" color="#374151" />}
            </View>
          </Pressable>
        )}
      />

      <ProveedorForm visible={!!formulario} proveedor={formulario?.proveedor ?? null} onCerrar={() => setFormulario(null)}
        onGuardado={() => { setFormulario(null); refrescar(); }} />

      {ficha && (
        <Ventana visible titulo={ficha.proveedor.nombre} ancho={720} onCerrar={() => setFicha(null)}
          subtitulo={`${ficha.resumen.compras} compra(s) · ${dinero(ficha.resumen.total_comprado)} comprado${ficha.resumen.ultima_compra ? ` · última ${fecha(ficha.resumen.ultima_compra)}` : ''}`}
          pie={
            <>
              {gestiona && <Boton estilo={{ flex: 1 }} titulo="Editar datos" variante="contorno" onPress={() => setFormulario({ proveedor: ficha.proveedor })} />}
              {paga && <Boton estilo={{ flex: 1 }} titulo="Registrar pago" variante="exito" deshabilitado={ficha.proveedor.saldo <= 0} onPress={() => setPagando(true)} />}
            </>
          }>
          <View style={e.resumen}>
            <View style={e.dato}><Text style={e.suave}>Se le debe</Text><Text style={e.grande}>{dinero(ficha.proveedor.saldo)}</Text></View>
            <View style={e.dato}><Text style={e.suave}>Vencido</Text><Text style={[e.grande, ficha.resumen.vencido > 0 && { color: C.peligro }]}>{dinero(ficha.resumen.vencido)}</Text></View>
          </View>

          <Text style={e.subtitulo}>Compras por pagar</Text>
          {ficha.pendientes.length === 0 && <Text style={e.suave}>Nada pendiente.</Text>}
          {ficha.pendientes.map((c) => (
            <View key={c.id} style={e.fila}>
              <View style={{ flex: 1 }}>
                <Text style={e.texto}>{c.compra}{c.documento ? ` · ${c.documento}` : ''}</Text>
                <Text style={[e.suave, c.vencida && { color: C.peligro }]}>
                  Vence {fecha(c.fecha_vencimiento)}{c.vencida ? ` · vencida hace ${c.dias_vencida} día(s)` : ''}
                </Text>
              </View>
              <Text style={e.texto}>{dinero(c.saldo)} <Text style={e.suave}>de {dinero(c.monto)}</Text></Text>
            </View>
          ))}

          <Text style={e.subtitulo}>Pagos</Text>
          {ficha.pagos.length === 0 && <Text style={e.suave}>Todavía no hay pagos.</Text>}
          {ficha.pagos.map((p) => (
            <View key={p.id} style={[e.fila, p.anulado && { opacity: 0.5 }]}>
              <View style={{ flex: 1 }}>
                <Text style={[e.texto, p.anulado && { textDecorationLine: 'line-through' }]}>{p.numero} · {dinero(p.monto)}</Text>
                <Text style={e.suave}>{fecha(p.fecha)} · {p.origen === 'caja' ? 'Desde la caja' : p.metodo ?? 'Fuera de caja'}{p.referencia ? ` · ${p.referencia}` : ''}{p.compras.length ? ` · ${p.compras.join(', ')}` : ''}</Text>
              </View>
              {p.anulado ? <Etiqueta texto="Anulado" fondo="#FEE2E2" color="#B91C1C" />
                : paga && <Pressable onPress={() => setAnularPago(p)} hitSlop={8}><Text style={e.anular}>Anular</Text></Pressable>}
            </View>
          ))}
        </Ventana>
      )}

      {ficha && <PagoProveedor visible={pagando} proveedor={ficha.proveedor} onCerrar={() => setPagando(false)} onPagado={() => { setPagando(false); refrescar(); }} />}

      <VentanaMotivo visible={!!anularPago} titulo={`Anular pago ${anularPago?.numero ?? ''}`}
        aviso={anularPago?.origen === 'caja' ? 'El dinero vuelve a la caja (solo si su turno sigue abierto) y la deuda regresa.' : 'La deuda con el proveedor regresa.'}
        onCerrar={() => setAnularPago(null)} onConfirmar={(m) => (anularPago ? op.anularPagoProveedor(anularPago.id, m) : Promise.reject(new Error('Elige qué anular')))}
        onListo={() => { setAnularPago(null); refrescar(); }} />
    </SafeAreaView>
  );
}

function PagoProveedor({ visible, ...props }: { visible: boolean; proveedor: op.ProveedorFicha; onCerrar: () => void; onPagado: () => void }) {
  return visible ? <FormPago {...props} /> : null;
}

// Pago a la compra más antigua primero. Desde la caja sale en efectivo del turno abierto
function FormPago({ proveedor, onCerrar, onPagado }: { proveedor: op.ProveedorFicha; onCerrar: () => void; onPagado: () => void }) {
  const { cajaId } = useSesion();
  const [metodos, setMetodos] = useState<MetodoPago[]>([]);
  const [monto, setMonto] = useState(String(proveedor.saldo));
  const [origen, setOrigen] = useState<'caja' | 'externo'>('caja');
  const [metodoId, setMetodoId] = useState<number | null>(null);
  const [referencia, setReferencia] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [uuid] = useState(nuevoUuid);

  useEffect(() => { getCatalogosCaja().then((c) => setMetodos(c.metodos_pago)).catch(() => null); }, []);
  const externos = metodos.filter((m) => m.tipo !== 'credito' && !m.afecta_efectivo);
  const efectivo = metodos.find((m) => m.afecta_efectivo);

  const pagar = async () => {
    if (origen === 'caja' && !cajaId) return avisar('Elige la caja de esta tablet');
    setGuardando(true);
    try {
      const r = await op.pagarProveedor(proveedor.id, {
        uuid, monto: Number(monto), origen,
        caja_id: origen === 'caja' ? cajaId ?? undefined : undefined,
        metodo_pago_id: origen === 'caja' ? efectivo?.id : metodoId ?? undefined,
        referencia: referencia.trim() || undefined,
      });
      avisar(r.message);
      onPagado();
    } catch (err) {
      avisar('No se pudo registrar el pago', mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };

  const valido = Number(monto) > 0 && Number(monto) <= proveedor.saldo + 0.001;
  return (
    <Ventana visible titulo={`Pagar a ${proveedor.nombre}`} subtitulo={`Se le debe ${dinero(proveedor.saldo)}. Se aplica a las compras más antiguas primero.`}
      onCerrar={onCerrar} ancho={520}
      pie={<Boton estilo={{ flex: 1 }} titulo={`Pagar ${valido ? dinero(Number(monto)) : ''}`} variante="exito" cargando={guardando} deshabilitado={!valido} onPress={pagar} />}>
      <Campo etiqueta="Monto" value={monto} onChangeText={(t) => setMonto(t.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" />
      {Number(monto) > proveedor.saldo + 0.001 && <Text style={{ color: C.peligro }}>No puede ser más de lo que se debe.</Text>}
      <Text style={e.etiqueta}>¿De dónde sale el dinero?</Text>
      <View style={e.chips}>
        {([['caja', 'De la caja (efectivo)'], ['externo', 'Fuera de caja (banco, cheque)']] as const).map(([v, t]) => (
          <Pressable key={v} onPress={() => setOrigen(v)} style={[e.chip, origen === v && e.chipActivo]}>
            <Text style={[e.chipTexto, origen === v && { color: '#fff' }]}>{t}</Text>
          </Pressable>
        ))}
      </View>
      {origen === 'externo' && externos.length > 0 && (
        <View style={e.chips}>
          {externos.map((m) => (
            <Pressable key={m.id} onPress={() => setMetodoId(m.id)} style={[e.chip, metodoId === m.id && e.chipActivo]}>
              <Text style={[e.chipTexto, metodoId === m.id && { color: '#fff' }]}>{m.nombre}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {origen === 'externo' && <Campo etiqueta="Referencia (opcional)" value={referencia} onChangeText={setReferencia} placeholder="N.º de transferencia o cheque" maxLength={100} />}
      {origen === 'caja' && <Text style={e.suave}>Sale del efectivo del turno abierto y aparece en el cierre como egreso.</Text>}
    </Ventana>
  );
}

const e = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: C.fondo },
  barra: { padding: 12, paddingBottom: 0, maxWidth: 900, width: '100%', alignSelf: 'center' },
  buscar: { height: 48, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: radio, paddingHorizontal: 14, fontSize: 16, backgroundColor: '#fff', color: C.texto },
  error: { color: C.peligro, padding: 16 },
  lista: { padding: 12, gap: 8, maxWidth: 900, width: '100%', alignSelf: 'center' },
  vacio: { textAlign: 'center', color: C.suave, padding: 24 },
  tarjeta: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: '#fff', borderRadius: radio, borderWidth: 1, borderColor: C.borde, padding: 14 },
  titulo: { fontSize: 16, fontWeight: '700', color: C.texto },
  suave: { fontSize: 13, color: C.suave },
  monto: { fontSize: 16, fontWeight: '800', color: '#92400E' },
  resumen: { flexDirection: 'row', gap: 10 },
  dato: { flex: 1, backgroundColor: '#F9FAFB', borderRadius: radio, padding: 12, gap: 2 },
  grande: { fontSize: 22, fontWeight: '800', color: C.texto },
  subtitulo: { fontSize: 16, fontWeight: '800', color: C.texto, marginTop: 6 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderColor: C.borde },
  texto: { fontSize: 15, color: C.texto },
  anular: { color: C.peligro, fontWeight: '700' },
  etiqueta: { fontSize: 14, fontWeight: '600', color: C.texto },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, minHeight: 44, justifyContent: 'center', borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: C.borde },
  chipActivo: { backgroundColor: C.texto, borderColor: C.texto },
  chipTexto: { fontWeight: '600', color: C.texto },
});
