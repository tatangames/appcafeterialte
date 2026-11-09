// Impresoras térmicas: de red (IP), por la tablet (servidor en la nube) o USB en el servidor; su uso, el cajón y la prueba
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Interruptor, Opciones, Seccion } from '@/components/formulario';
import { Boton, Campo, Etiqueta, Ventana } from '@/components/ui';
import { C, radio } from '@/constants/colores';
import { mensajeError } from '@/lib/api';
import { avisar } from '@/lib/aviso';
import { activarImpresionLocal, cargarImpresionLocal, procesarCola, puedeImprimir } from '@/lib/impresionLocal';
import * as op from '@/lib/operaciones';

const USOS = [{ valor: 'ticket', texto: 'Tickets' }, { valor: 'comanda', texto: 'Comandas' }, { valor: 'ambos', texto: 'Ambos' }] as const;
const CAJON = [{ valor: 'ninguno', texto: 'Sin cajón' }, { valor: 'pin2', texto: 'Cajón en pin 2' }, { valor: 'pin5', texto: 'Cajón en pin 5' }] as const;
const PAPEL = [{ valor: 48, texto: '80 mm' }, { valor: 42, texto: '80 mm (fuente grande)' }, { valor: 32, texto: '58 mm' }];
const TIPOS = [{ valor: 'escpos', texto: 'ESC/POS (Epson y la mayoría)' }, { valor: 'star_raster', texto: 'Star TSP100 (imagen)' }] as const;
const CONEXIONES = [
  { valor: 'dispositivo', texto: 'Desde la tablet (Wi-Fi)' },
  { valor: 'red', texto: 'Desde el servidor (red local)' },
  { valor: 'windows', texto: 'USB en el servidor (Windows)' },
] as const;
const conIp = (c: op.Impresora['conexion']) => c === 'red' || c === 'dispositivo';
const describir = (i: op.Impresora) => i.conexion === 'windows' ? `USB · ${i.nombre_windows}`
  : `${i.conexion === 'dispositivo' ? 'Tablet' : 'Red'} · ${i.ip_impresora}:${i.puerto ?? 9100}`;

// Esta tablet manda a la impresora lo que el servidor deja en la cola (impresoras «Desde la tablet»)
function EstaTabletImprime({ hayDeTablet }: { hayDeTablet: boolean }) {
  const [activa, setActiva] = useState(false);
  useEffect(() => { cargarImpresionLocal().then(setActiva); }, []);
  const disponible = puedeImprimir();

  const cambiar = async (v: boolean) => {
    if (v && !disponible) {
      avisar('Esta versión no puede imprimir', 'Instala el APK de la app (Expo Go y el navegador no pueden conectarse a la impresora).');
      return;
    }
    setActiva(v);
    await activarImpresionLocal(v);
  };

  return (
    <View style={e.tarjeta}>
      <View style={{ flex: 1 }}>
        <Interruptor titulo="Esta tablet imprime"
          detalle={`Manda a la impresora los tickets y comandas de las impresoras «Desde la tablet». Actívalo solo en la tablet que está en el Wi-Fi del local.${hayDeTablet ? '' : ' Todavía no hay impresoras configuradas así.'}${disponible ? '' : ' (Necesita el APK.)'}`}
          valor={activa} onCambiar={cambiar} />
        {activa && <Boton titulo="Revisar la cola ahora" chico variante="contorno" onPress={() => procesarCola()} />}
      </View>
    </View>
  );
}

export function Impresoras() {
  const [lista, setLista] = useState<op.Impresora[] | null>(null);
  const [editando, setEditando] = useState<{ item: op.Impresora | null } | null>(null);
  const [probando, setProbando] = useState<number | null>(null);

  const cargar = useCallback(() => {
    op.getImpresoras().then(setLista).catch((err) => avisar('No se pudieron cargar', mensajeError(err)));
  }, []);
  useEffect(cargar, [cargar]);

  const probar = async (i: op.Impresora, produccion = false) => {
    setProbando(produccion ? -i.id : i.id);
    try {
      const r = await (produccion ? op.probarProduccion(i.id) : op.probarImpresora(i.id));
      avisar(r.success ? (i.conexion === 'dispositivo' ? `${i.alias}: prueba enviada` : `${i.alias}: impresa la prueba`) : `${i.alias} no imprimió`,
        r.success ? (i.conexion === 'dispositivo' ? 'La imprime la tablet que tiene activado «Esta tablet imprime».' : undefined) : r.message);
    } catch (err) {
      avisar(`${i.alias} no imprimió`, mensajeError(err));
    } finally {
      setProbando(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={e.contenido}>
      <View style={e.cabecera}>
        <Text style={[e.suave, { flex: 1 }]}>Con el servidor en la nube usa «Desde la tablet»: la tablet del local manda el ticket a la IP de la impresora (puerto 9100). «Desde el servidor» y «USB» solo sirven si el servidor está en el local.</Text>
        <Boton titulo="+ Impresora" onPress={() => setEditando({ item: null })} />
      </View>
      <EstaTabletImprime hayDeTablet={(lista ?? []).some((i) => i.conexion === 'dispositivo')} />
      {lista?.length === 0 && <Text style={e.vacio}>No hay impresoras. Agrega la del mostrador y la de la cocina.</Text>}
      {(lista ?? []).map((i) => (
        <View key={i.id} style={[e.tarjeta, !i.activo && { opacity: 0.5 }]}>
          <Pressable onPress={() => setEditando({ item: i })} style={{ flex: 1, gap: 4 }}>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <Text style={e.titulo}>{i.alias}</Text>
              {i.predeterminada && <Etiqueta texto="Predeterminada" fondo="#DBEAFE" color="#1E40AF" />}
              <Etiqueta texto={USOS.find((u) => u.valor === i.uso)?.texto ?? i.uso} fondo="#F3F4F6" color="#374151" />
            </View>
            <Text style={e.suave}>{describir(i)} · {PAPEL.find((p) => p.valor === Number(i.ancho_caracteres))?.texto}{i.cash_drawer !== 'ninguno' ? ' · abre cajón' : ''}</Text>
            {(i.cajas.length > 0 || i.areas.length > 0) && <Text style={e.suave}>La usan: {[...i.cajas, ...i.areas].join(', ')}</Text>}
          </Pressable>
          <View style={{ gap: 6 }}>
            <Boton titulo="Imprimir prueba" chico variante="contorno" cargando={probando === i.id} onPress={() => probar(i)} />
            <Boton titulo="Prueba producción" chico variante="contorno" cargando={probando === -i.id} onPress={() => probar(i, true)} />
          </View>
        </View>
      ))}
      {editando && <FormImpresora item={editando.item} onCerrar={() => setEditando(null)} onListo={() => { setEditando(null); cargar(); }} />}
    </ScrollView>
  );
}

function FormImpresora({ item, onCerrar, onListo }: { item: op.Impresora | null; onCerrar: () => void; onListo: () => void }) {
  const [d, setD] = useState<op.ImpresoraDatos>({
    alias: item?.alias ?? '', conexion: item?.conexion ?? 'dispositivo', ip_impresora: item?.ip_impresora ?? '', puerto: item?.puerto ?? 9100,
    nombre_windows: item?.nombre_windows ?? '', tipo_impresion: item?.tipo_impresion ?? 'escpos', ancho_caracteres: Number(item?.ancho_caracteres ?? 48), uso: item?.uso ?? 'ticket',
    predeterminada: !!item?.predeterminada, cortar_papel: item ? !!item.cortar_papel : true, cash_drawer: item?.cash_drawer ?? 'ninguno', activo: item ? !!item.activo : true,
  });
  const [guardando, setGuardando] = useState(false);
  const cambiar = (c: Partial<op.ImpresoraDatos>) => setD((x) => ({ ...x, ...c }));
  const error = !d.alias.trim() ? 'Ponle un nombre'
    : conIp(d.conexion) && !d.ip_impresora?.trim() ? 'Escribe la IP de la impresora'
      : d.conexion === 'windows' && !d.nombre_windows?.trim() ? 'Escribe el nombre de la impresora en Windows' : null;

  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await op.guardarImpresora({
        ...d, alias: d.alias.trim(),
        ip_impresora: conIp(d.conexion) ? d.ip_impresora?.trim() || null : null,
        nombre_windows: d.conexion === 'windows' ? d.nombre_windows?.trim() || null : null,
      }, item?.id);
      avisar(r.message ?? 'Impresora guardada');
      onListo();
    } catch (err) {
      avisar('No se pudo guardar', mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Ventana visible titulo={item ? `Editar ${item.alias}` : 'Nueva impresora'} onCerrar={onCerrar} ancho={620}
      pie={
        <View style={{ flex: 1, gap: 6 }}>
          {error && <Text style={{ color: C.peligro }}>{error}</Text>}
          <Boton titulo="Guardar" cargando={guardando} deshabilitado={!!error} onPress={guardar} />
        </View>
      }>
      <Campo etiqueta="Nombre" value={d.alias} onChangeText={(t) => cambiar({ alias: t })} placeholder="Mostrador, Cocina..." maxLength={200} />
      <Seccion titulo="Conexión" />
      <Opciones opciones={[...CONEXIONES]} valor={d.conexion} onCambiar={(v) => cambiar({ conexion: v as op.Impresora['conexion'] })} />
      {conIp(d.conexion) ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 2 }}><Campo etiqueta="IP" value={d.ip_impresora ?? ''} onChangeText={(t) => cambiar({ ip_impresora: t })} placeholder="192.168.1.50" keyboardType="decimal-pad" /></View>
          <View style={{ flex: 1 }}><Campo etiqueta="Puerto" value={String(d.puerto ?? '')} onChangeText={(t) => cambiar({ puerto: t ? Number(t.replace(/\D/g, '')) : null })} keyboardType="number-pad" /></View>
        </View>
      ) : (
        <Campo etiqueta="Nombre en Windows" value={d.nombre_windows ?? ''} onChangeText={(t) => cambiar({ nombre_windows: t })} placeholder="EPSON TM-T20" />
      )}
      <Seccion titulo="Tipo de impresora" />
      <Opciones opciones={[...TIPOS]} valor={d.tipo_impresion} onCambiar={(v) => cambiar({ tipo_impresion: v as op.ImpresoraDatos['tipo_impresion'] })} />
      <Seccion titulo="Papel" />
      <Opciones opciones={PAPEL} valor={d.ancho_caracteres} onCambiar={(v) => cambiar({ ancho_caracteres: v })} />
      <Seccion titulo="Qué imprime" />
      <Opciones opciones={[...USOS]} valor={d.uso} onCambiar={(v) => cambiar({ uso: v as op.ImpresoraDatos['uso'] })} />
      <Seccion titulo="Cajón de dinero" />
      <Opciones opciones={[...CAJON]} valor={d.cash_drawer} onCambiar={(v) => cambiar({ cash_drawer: v as op.ImpresoraDatos['cash_drawer'] })} />
      <Interruptor titulo="Predeterminada" detalle="Se usa cuando la caja o el área no tienen una propia" valor={d.predeterminada} onCambiar={(v) => cambiar({ predeterminada: v })} />
      <Interruptor titulo="Cortar el papel" valor={d.cortar_papel} onCambiar={(v) => cambiar({ cortar_papel: v })} />
      {item && <Interruptor titulo="Activa" valor={d.activo} onCambiar={(v) => cambiar({ activo: v })} />}
    </Ventana>
  );
}

const e = StyleSheet.create({
  contenido: { padding: 12, gap: 10, maxWidth: 1000, width: '100%', alignSelf: 'center' },
  cabecera: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  vacio: { textAlign: 'center', color: C.suave, padding: 24 },
  tarjeta: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: radio, borderWidth: 1, borderColor: C.borde, padding: 14 },
  titulo: { fontSize: 16, fontWeight: '800', color: C.texto },
  suave: { fontSize: 13, color: C.suave },
});
