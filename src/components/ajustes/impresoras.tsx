// Impresoras térmicas: de red (IP), por la tablet (servidor en la nube) o USB en el servidor; su uso, el cajón y la prueba
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Interruptor, Opciones, Seccion } from '@/components/formulario';
import { Boton, Campo, Etiqueta, Ventana } from '@/components/ui';
import { C, radio } from '@/constants/colores';
import { mensajeError } from '@/lib/api';
import { avisar } from '@/lib/aviso';
import { procesarCola, puedeImprimir } from '@/lib/impresionLocal';
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

// Las tablets mandan a la impresora lo que el servidor deja en la cola (impresoras «Desde la tablet»).
// Siempre activo en todas: las tablets del negocio no salen del local.
function TabletsImprimen({ hayDeTablet }: { hayDeTablet: boolean }) {
  const [ayuda, setAyuda] = useState(false);
  const [verErrores, setVerErrores] = useState(false);
  const [conError, setConError] = useState(0);
  const disponible = puedeImprimir();

  const contar = useCallback(() => {
    op.getTrabajosImpresion('error').then((r) => setConError(r.total)).catch(() => null);
  }, []);
  useEffect(contar, [contar]);

  return (
    <View style={e.tarjeta}>
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={e.titulo}>Las tablets imprimen</Text>
        <Text style={e.suave}>
          {disponible
            ? 'Esta tablet manda a la impresora los tickets y comandas de las impresoras «Desde la tablet», igual que las demás tablets del negocio.'
            : 'Esta versión no puede imprimir: instala el APK de la app (Expo Go y el navegador no se conectan a la impresora).'}
          {hayDeTablet ? '' : ' Todavía no hay impresoras configuradas «Desde la tablet».'}
        </Text>
        {conError > 0 && (
          <Pressable onPress={() => setVerErrores(true)} style={e.alerta}>
            <Text style={e.alertaTexto}>{conError === 1 ? '1 impresión no salió' : `${conError} impresiones no salieron`}</Text>
            <Text style={[e.alertaTexto, { fontWeight: '800' }]}>Ver y reintentar ›</Text>
          </Pressable>
        )}
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Boton titulo="¿Cómo funciona?" chico variante="contorno" onPress={() => setAyuda(true)} />
          <Boton titulo="Impresiones con error" chico variante="contorno" onPress={() => setVerErrores(true)} />
        </View>
      </View>
      <AyudaTabletsImprimen visible={ayuda} onCerrar={() => setAyuda(false)} />
      {verErrores && <ImpresionesConError onCerrar={() => { setVerErrores(false); contar(); }} />}
    </View>
  );
}

// Lo que no salió (impresora apagada, sin papel, fuera del Wi-Fi): reintentar una o todas, o quitarlas.
// Al reintentar vuelve a la cola y esta tablet la manda de inmediato; si vuelve a fallar, sigue en la lista.
function ImpresionesConError({ onCerrar }: { onCerrar: () => void }) {
  const [lista, setLista] = useState<op.TrabajoImpresion[] | null>(null);
  const [ocupado, setOcupado] = useState<number | 'todas' | 'quitar' | null>(null);

  const cargar = useCallback(() => {
    op.getTrabajosImpresion('error').then((r) => setLista(r.trabajos)).catch((err) => avisar('No se pudieron cargar', mensajeError(err)));
  }, []);
  useEffect(cargar, [cargar]);

  // Devuelve a la cola, la manda ya (si es «Desde la tablet») y recarga para ver qué sigue fallando
  const reintentar = async (ids: number[], clave: number | 'todas') => {
    setOcupado(clave);
    const fallos: string[] = [];
    for (const id of ids) {
      try {
        const r = await op.reintentarTrabajo(id);
        if (!r.impreso && !r.en_cola) fallos.push(r.message);
      } catch (err) {
        fallos.push(mensajeError(err));
      }
    }
    await procesarCola({ silencioso: true });
    const r = await op.getTrabajosImpresion('error').catch(() => null);
    const siguen = r ? r.trabajos.filter((t) => ids.includes(t.id)).length : 0;
    if (r) setLista(r.trabajos);
    setOcupado(null);
    if (fallos.length || siguen) {
      avisar(siguen ? `${siguen === 1 ? 'Sigue sin salir' : `${siguen} siguen sin salir`}` : 'No se pudo reintentar',
        [...new Set(fallos)].join('\n') || 'Revisa que la impresora esté encendida, con papel y en el mismo Wi-Fi.');
    } else {
      avisar(ids.length === 1 ? 'Impresión enviada' : `${ids.length} impresiones enviadas`);
    }
  };

  const quitar = async (id?: number) => {
    setOcupado(id ?? 'quitar');
    try {
      const r = await (id ? op.quitarTrabajo(id) : op.quitarTrabajosConError());
      avisar(r.message);
      cargar();
    } catch (err) {
      avisar('No se pudo quitar', mensajeError(err));
    } finally {
      setOcupado(null);
    }
  };

  const ids = (lista ?? []).map((t) => t.id);
  return (
    <Ventana visible titulo="Impresiones con error" subtitulo="Lo que no salió en la impresora" onCerrar={onCerrar} ancho={680}
      pie={ids.length > 0 ? (
        <View style={{ flexDirection: 'row', gap: 8, flex: 1 }}>
          <View style={{ flex: 1 }}><Boton titulo="Quitar todas" variante="contorno" cargando={ocupado === 'quitar'} deshabilitado={!!ocupado} onPress={() => quitar()} /></View>
          <View style={{ flex: 2 }}><Boton titulo={`Reintentar todas (${ids.length})`} cargando={ocupado === 'todas'} deshabilitado={!!ocupado} onPress={() => reintentar(ids, 'todas')} /></View>
        </View>
      ) : undefined}>
      {lista === null && <Text style={e.vacio}>Cargando…</Text>}
      {lista?.length === 0 && <Text style={e.vacio}>Todo salió bien: no hay impresiones con error.</Text>}
      {(lista ?? []).map((t) => (
        <View key={t.id} style={[e.tarjeta, { alignItems: 'flex-start' }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={e.titulo}>{t.tipo_texto}</Text>
            <Text style={e.suave}>{t.impresora ?? 'Sin impresora'} · {t.fecha}{t.usuario ? ` · ${t.usuario}` : ''}</Text>
            {t.error && <Text style={{ fontSize: 13, color: C.peligro }}>{t.error}</Text>}
          </View>
          <View style={{ gap: 6 }}>
            <Boton titulo="Reintentar" chico cargando={ocupado === t.id} deshabilitado={!!ocupado} onPress={() => reintentar([t.id], t.id)} />
            <Boton titulo="Quitar" chico variante="contorno" deshabilitado={!!ocupado} onPress={() => quitar(t.id)} />
          </View>
        </View>
      ))}
    </Ventana>
  );
}

const AYUDA: { titulo: string; texto: string }[] = [
  {
    titulo: '¿Para qué sirve?',
    texto: 'El servidor está en internet y no puede llegar a las impresoras del local. Cuando se cobra o se manda una comanda, '
      + 'el servidor deja el ticket en una cola. Las tablets la revisan cada 3 segundos y la primera que lo toma lo manda '
      + 'por el Wi-Fi a la impresora. Solo aplica a las impresoras con conexión «Desde la tablet (Wi-Fi)».',
  },
  {
    titulo: '¿Hay que activar algo?',
    texto: 'No: todas las tablets imprimen solas. Basta con una abierta para que se imprima todo (también lo que se cobra '
      + 'desde la web o desde otras tablets); con dos o más, si una se apaga, las demás siguen imprimiendo.',
  },
  {
    titulo: '¿Sale doble con varias tablets?',
    texto: 'No: cada ticket o comanda lo toma una sola tablet, la primera que revisa la cola.',
  },
  {
    titulo: 'Qué necesita la tablet',
    texto: 'Estar conectada al Wi-Fi del local, con la app abierta y la sesión iniciada (con la app cerrada o la pantalla '
      + 'bloqueada mucho rato no imprime). Tener instalado el APK; Expo Go y el navegador no pueden imprimir. '
      + 'Una tablet fuera del local no alcanza la impresora: lo que tome queda con error y se reimprime desde el ticket o la comanda.',
  },
  {
    titulo: 'Sin internet',
    texto: 'Las ventas que se hacen sin conexión las imprime la misma tablet que vende, directo a la impresora.',
  },
  {
    titulo: 'Si no imprime',
    texto: 'Revisa que haya una tablet abierta y en el Wi-Fi, y usa «Imprimir prueba» en la impresora. '
      + '«Revisar la cola ahora» manda de inmediato lo que esté pendiente. Lo que lleva más de 30 minutos en cola ya no se imprime.',
  },
];

function AyudaTabletsImprimen({ visible, onCerrar }: { visible: boolean; onCerrar: () => void }) {
  return (
    <Ventana visible={visible} titulo="Las tablets imprimen" subtitulo="Cómo funciona" onCerrar={onCerrar} ancho={620}
      pie={<Boton titulo="Entendido" onPress={onCerrar} />}>
      {AYUDA.map((a) => (
        <View key={a.titulo} style={{ gap: 4 }}>
          <Text style={e.titulo}>{a.titulo}</Text>
          <Text style={e.ayuda}>{a.texto}</Text>
        </View>
      ))}
    </Ventana>
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
        r.success ? (i.conexion === 'dispositivo' ? 'La imprime la primera tablet del local que revise la cola.' : undefined) : r.message);
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
      <TabletsImprimen hayDeTablet={(lista ?? []).some((i) => i.conexion === 'dispositivo')} />
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
  ayuda: { fontSize: 14, color: C.texto, lineHeight: 20 },
  alerta: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: radio, padding: 10 },
  alertaTexto: { fontSize: 14, color: '#991B1B' },
});
