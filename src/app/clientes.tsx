import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AyudaClientes } from '@/components/ayudaClientes';
import { ClienteForm } from '@/components/clientes';
import { Encabezado } from '@/components/encabezado';
import { VentanaMotivo } from '@/components/motivo';
import { Boton, Campo, Etiqueta, Ventana } from '@/components/ui';
import { C, radio } from '@/constants/colores';
import { mensajeError } from '@/lib/api';
import { avisar } from '@/lib/aviso';
import { dinero, fecha, nuevoUuid } from '@/lib/formato';
import * as op from '@/lib/operaciones';
import { getCatalogosCaja } from '@/lib/servicios';
import { useSesion } from '@/lib/sesion';
import { MetodoPago } from '@/lib/tipos';

type Ficha = Awaited<ReturnType<typeof op.getCliente>>;

// Clientes: registrarlos, darles crédito, ver lo que deben y recibir sus abonos
export default function Clientes() {
  const { puede } = useSesion();
  const [buscar, setBuscar] = useState('');
  const [conSaldo, setConSaldo] = useState(false);
  const [verAyuda, setVerAyuda] = useState(false);
  const [lista, setLista] = useState<op.Cliente[] | null>(null);
  const [error, setError] = useState('');
  const [formulario, setFormulario] = useState<{ cliente: op.Cliente | null } | null>(null);
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [abonando, setAbonando] = useState(false);
  const [anularAbono, setAnularAbono] = useState<op.Abono | null>(null);

  const cargar = useCallback(() => {
    op.getClientes({ buscar: buscar.trim(), con_saldo: conSaldo ? 1 : undefined })
      .then((r) => { setLista(r.clientes); setError(''); }).catch((err) => setError(mensajeError(err)));
  }, [buscar, conSaldo]);
  useFocusEffect(useCallback(() => {
    const t = setTimeout(cargar, 250);
    return () => clearTimeout(t);
  }, [cargar]));

  const abrirFicha = (id: number) => op.getCliente(id).then(setFicha).catch((err) => avisar('No se pudo abrir', mensajeError(err)));
  const refrescar = () => {
    cargar();
    if (ficha) abrirFicha(ficha.cliente.id);
  };
  const cobra = puede('cuentas_cobrar.gestionar');

  return (
    <SafeAreaView style={e.pantalla} edges={['top', 'left', 'right', 'bottom']}>
      <Encabezado titulo="Clientes" subtitulo="Crédito, lo que deben y sus abonos"
        derecha={puede('clientes.gestionar') ? <Boton titulo="+ Cliente" chico onPress={() => setFormulario({ cliente: null })} /> : null} />
      <View style={e.barra}>
        <TextInput style={[e.buscar, { flex: 1 }]} value={buscar} onChangeText={setBuscar} placeholder="Buscar por nombre, DUI/NIT o teléfono" placeholderTextColor={C.tenue} />
        <Pressable onPress={() => setConSaldo((v) => !v)} style={[e.chip, conSaldo && e.chipActivo]}>
          <Text style={[e.chipTexto, conSaldo && { color: '#fff' }]}>{conSaldo ? '✓ ' : ''}Solo los que deben</Text>
        </Pressable>
        <Pressable onPress={() => setVerAyuda((v) => !v)} accessibilityLabel="¿Para qué sirven los clientes?" style={[e.chip, verAyuda && e.chipActivo]}>
          <Text style={[e.chipTexto, verAyuda && { color: '#fff' }]}>? ¿Para qué sirven?</Text>
        </Pressable>
      </View>
      {verAyuda && <AyudaClientes />}
      {error ? <Text style={e.error}>{error}</Text> : null}
      <FlatList
        data={lista ?? []}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={e.lista}
        ListEmptyComponent={<Text style={e.vacio}>{lista ? 'No hay clientes con ese filtro.' : 'Cargando...'}</Text>}
        renderItem={({ item: c }) => (
          <Pressable onPress={() => abrirFicha(c.id)} style={({ pressed }) => [e.tarjeta, !c.activo && { opacity: 0.55 }, pressed && { opacity: 0.8 }]}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={e.titulo}>{c.nombre}</Text>
              <Text style={e.suave}>
                {[c.telefono, c.documento, c.limite_credito > 0 ? `límite ${dinero(c.limite_credito)}` : 'sin crédito'].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              {c.saldo > 0 ? <Text style={e.monto}>Debe {dinero(c.saldo)}</Text> : <Text style={e.suave}>Al día</Text>}
              {(c.vencido ?? 0) > 0 && <Etiqueta texto={`Vencido ${dinero(c.vencido)}`} fondo="#FEE2E2" color="#B91C1C" />}
            </View>
          </Pressable>
        )}
      />

      <ClienteForm visible={!!formulario} cliente={formulario?.cliente ?? null} onCerrar={() => setFormulario(null)}
        onGuardado={() => { setFormulario(null); refrescar(); }} />

      {ficha && (
        <Ventana visible titulo={ficha.cliente.nombre} ancho={720} onCerrar={() => setFicha(null)}
          subtitulo={`${ficha.resumen.compras} compra(s) · ${dinero(ficha.resumen.total_comprado)}${ficha.resumen.ultima_compra ? ` · última ${fecha(ficha.resumen.ultima_compra)}` : ''}`}
          pie={
            <>
              {puede('clientes.gestionar') && <Boton estilo={{ flex: 1 }} titulo="Editar datos" variante="contorno" onPress={() => setFormulario({ cliente: ficha.cliente })} />}
              {cobra && <Boton estilo={{ flex: 1 }} titulo="Recibir abono" variante="exito" deshabilitado={ficha.cliente.saldo <= 0} onPress={() => setAbonando(true)} />}
            </>
          }>
          <View style={e.resumen}>
            <View style={e.dato}><Text style={e.suave}>Debe</Text><Text style={e.grande}>{dinero(ficha.cliente.saldo)}</Text></View>
            <View style={e.dato}><Text style={e.suave}>Vencido</Text><Text style={[e.grande, ficha.resumen.vencido > 0 && { color: C.peligro }]}>{dinero(ficha.resumen.vencido)}</Text></View>
            <View style={e.dato}><Text style={e.suave}>Crédito disponible</Text><Text style={e.grande}>{ficha.cliente.limite_credito > 0 ? dinero(ficha.cliente.credito_disponible) : '—'}</Text></View>
          </View>

          <Text style={e.subtitulo}>Ventas al crédito pendientes</Text>
          {ficha.pendientes.length === 0 && <Text style={e.suave}>No debe nada.</Text>}
          {ficha.pendientes.map((c) => (
            <View key={c.id} style={e.fila}>
              <View style={{ flex: 1 }}>
                <Text style={e.texto}>{c.venta} · {fecha(c.fecha)}</Text>
                <Text style={[e.suave, c.vencida && { color: C.peligro }]}>Vence {fecha(c.fecha_vencimiento)}{c.vencida ? ` · vencida hace ${c.dias_vencida} día(s)` : ''}</Text>
              </View>
              <Text style={e.texto}>{dinero(c.saldo)} <Text style={e.suave}>de {dinero(c.monto)}</Text></Text>
            </View>
          ))}

          <Text style={e.subtitulo}>Abonos</Text>
          {ficha.abonos.length === 0 && <Text style={e.suave}>Todavía no hay abonos.</Text>}
          {ficha.abonos.map((a) => (
            <View key={a.id} style={[e.fila, a.anulado && { opacity: 0.5 }]}>
              <View style={{ flex: 1 }}>
                <Text style={[e.texto, a.anulado && { textDecorationLine: 'line-through' }]}>{a.numero} · {dinero(a.monto)}</Text>
                <Text style={e.suave}>{fecha(a.fecha)} · {a.metodo ?? ''}{a.referencia ? ` · ${a.referencia}` : ''}{a.usuario ? ` · ${a.usuario}` : ''}</Text>
              </View>
              {a.anulado ? <Etiqueta texto="Anulado" fondo="#FEE2E2" color="#B91C1C" />
                : cobra && <Pressable onPress={() => setAnularAbono(a)} hitSlop={8}><Text style={e.anular}>Anular</Text></Pressable>}
            </View>
          ))}
        </Ventana>
      )}

      {ficha && <Abonar visible={abonando} cliente={ficha.cliente} onCerrar={() => setAbonando(false)} onListo={() => { setAbonando(false); refrescar(); }} />}

      <VentanaMotivo visible={!!anularAbono} titulo={`Anular abono ${anularAbono?.numero ?? ''}`}
        aviso="Solo se anulan abonos del turno abierto. El dinero sale de la caja y la deuda regresa. Pide autorización."
        onCerrar={() => setAnularAbono(null)} onConfirmar={(m) => (anularAbono ? op.anularAbono(anularAbono.id, m) : Promise.reject(new Error('Elige qué anular')))}
        onListo={() => { setAnularAbono(null); refrescar(); }} />
    </SafeAreaView>
  );
}

function Abonar({ visible, ...props }: { visible: boolean; cliente: op.Cliente; onCerrar: () => void; onListo: () => void }) {
  return visible ? <FormAbono {...props} /> : null;
}

// El abono entra a la caja del turno abierto y se aplica a las ventas más antiguas primero
function FormAbono({ cliente, onCerrar, onListo }: { cliente: op.Cliente; onCerrar: () => void; onListo: () => void }) {
  const { cajaId } = useSesion();
  const [metodos, setMetodos] = useState<MetodoPago[]>([]);
  const [monto, setMonto] = useState(String(cliente.saldo));
  const [metodoId, setMetodoId] = useState<number | null>(null);
  const [referencia, setReferencia] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [uuid] = useState(nuevoUuid);

  useEffect(() => {
    getCatalogosCaja().then((c) => {
      const lista = c.metodos_pago.filter((m) => m.tipo !== 'credito');
      setMetodos(lista);
      setMetodoId(lista.find((m) => m.afecta_efectivo)?.id ?? lista[0]?.id ?? null);
    }).catch(() => null);
  }, []);
  const metodo = metodos.find((m) => m.id === metodoId);

  const abonar = async () => {
    if (!cajaId) return avisar('Elige la caja de esta tablet');
    setGuardando(true);
    try {
      const r = await op.registrarAbono(cliente.id, { uuid, caja_id: cajaId, monto: Number(monto), metodo_pago_id: metodoId ?? undefined, referencia: referencia.trim() || undefined });
      avisar(r.message);
      onListo();
    } catch (err) {
      avisar('No se pudo registrar el abono', mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };

  const valido = Number(monto) > 0 && Number(monto) <= cliente.saldo + 0.001 && !(metodo?.requiere_referencia && !referencia.trim());
  return (
    <Ventana visible titulo={`Abono de ${cliente.nombre}`} subtitulo={`Debe ${dinero(cliente.saldo)}. Se aplica a sus ventas más antiguas primero.`}
      onCerrar={onCerrar} ancho={520}
      pie={<Boton estilo={{ flex: 1 }} titulo={`Recibir ${Number(monto) > 0 ? dinero(Number(monto)) : ''}`} variante="exito" cargando={guardando} deshabilitado={!valido} onPress={abonar} />}>
      <Campo etiqueta="Monto" value={monto} onChangeText={(t) => setMonto(t.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" />
      {Number(monto) > cliente.saldo + 0.001 && <Text style={{ color: C.peligro }}>No puede ser más de lo que debe.</Text>}
      <View style={e.chips}>
        {metodos.map((m) => (
          <Pressable key={m.id} onPress={() => setMetodoId(m.id)} style={[e.chip, metodoId === m.id && e.chipActivo]}>
            <Text style={[e.chipTexto, metodoId === m.id && { color: '#fff' }]}>{m.nombre}</Text>
          </Pressable>
        ))}
      </View>
      {metodo?.requiere_referencia && <Campo etiqueta={`Referencia de ${metodo.nombre}`} value={referencia} onChangeText={setReferencia} maxLength={100} />}
      <Text style={e.suave}>Entra a la caja del turno abierto.</Text>
    </Ventana>
  );
}

const e = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: C.fondo },
  barra: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 12, paddingBottom: 0, maxWidth: 900, width: '100%', alignSelf: 'center' },
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
  grande: { fontSize: 20, fontWeight: '800', color: C.texto },
  subtitulo: { fontSize: 16, fontWeight: '800', color: C.texto, marginTop: 6 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderColor: C.borde },
  texto: { fontSize: 15, color: C.texto },
  anular: { color: C.peligro, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, minHeight: 44, justifyContent: 'center', borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: C.borde },
  chipActivo: { backgroundColor: C.texto, borderColor: C.texto },
  chipTexto: { fontWeight: '600', color: C.texto },
});
