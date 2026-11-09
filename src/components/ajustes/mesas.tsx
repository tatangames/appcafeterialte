// Mesas y cocina: áreas de preparación (con su impresora), a qué área va cada categoría y las mesas del mapa
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Interruptor, Opciones, Seccion } from '@/components/formulario';
import { Boton, Campo, Etiqueta, Ventana } from '@/components/ui';
import { C, radio } from '@/constants/colores';
import { mensajeError } from '@/lib/api';
import { avisar } from '@/lib/aviso';
import * as op from '@/lib/operaciones';
import { getCatalogosCaja } from '@/lib/servicios';

const COLORES = ['#DB2777', '#0891B2', '#D97706', '#16A34A', '#7C3AED', '#2563EB', '#DC2626', '#4B5563'];
const TIPOS = [{ valor: 'mesa', texto: 'Mesa' }, { valor: 'caja', texto: 'Caja (mostrador)' }];

export function MesasCocina() {
  const [areas, setAreas] = useState<Awaited<ReturnType<typeof op.getAreas>> | null>(null);
  const [terminales, setTerminales] = useState<Awaited<ReturnType<typeof op.getTerminalesConfig>> | null>(null);
  const [asignadas, setAsignadas] = useState<Record<number, number | null>>({});
  const [area, setArea] = useState<{ item: op.AreaPrep | null } | null>(null);
  const [terminal, setTerminal] = useState<{ item: op.TerminalConfig | null } | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(() => {
    op.getAreas().then((a) => {
      setAreas(a);
      setAsignadas(Object.fromEntries(a.categorias.map((c) => [c.id, c.area_preparacion_id])));
    }).catch((err) => avisar('No se pudo cargar', mensajeError(err)));
    op.getTerminalesConfig().then(setTerminales).catch(() => null);
  }, []);
  useEffect(cargar, [cargar]);

  const cambiadas = (areas?.categorias ?? []).filter((c) => asignadas[c.id] !== c.area_preparacion_id);
  const guardarCategorias = async () => {
    setGuardando(true);
    try {
      // Sin área (null): se entrega directo y no imprime comanda
      const r = await op.asignarAreas((areas?.categorias ?? []).map((c) => ({ categoria_id: c.id, area_id: asignadas[c.id] ?? null })));
      avisar(r.message);
      cargar();
    } catch (err) {
      avisar('No se pudo guardar', mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };

  const impresora = (id: number | null) => areas?.impresoras.find((i) => i.id === id)?.nombre;

  return (
    <ScrollView contentContainerStyle={e.contenido}>
      <View style={e.bloque}>
        <View style={e.cabecera}>
          <View style={{ flex: 1 }}>
            <Text style={e.titulo}>Áreas de preparación</Text>
            <Text style={e.suave}>Cada área imprime su propio ticket de comanda (COCINA, BARRA) en su impresora.</Text>
          </View>
          <Boton titulo="+ Área" chico onPress={() => setArea({ item: null })} />
        </View>
        <View style={e.rejilla}>
          {(areas?.areas ?? []).map((a) => (
            <Pressable key={a.id} onPress={() => setArea({ item: a })} style={[e.pastilla, { borderLeftColor: a.color ?? C.borde }, !a.activo && { opacity: 0.5 }]}>
              <Text style={e.nombre}>{a.nombre}</Text>
              <Text style={e.suave}>{impresora(a.impresora_id) ? `Imprime en ${impresora(a.impresora_id)}` : 'Impresora de comandas predeterminada'}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={e.bloque}>
        <Text style={e.titulo}>¿A qué área va cada categoría?</Text>
        <Text style={e.suave}>Define en qué comanda sale cada producto. Lo que se entrega directo (pan y postres de vitrina, bebidas embotelladas) va en «Sin comanda»: solo sale el ticket de venta.</Text>
        {(areas?.categorias ?? []).map((c) => (
          <View key={c.id} style={e.filaCategoria}>
            <Text style={[e.nombre, { minWidth: 160 }]}>{c.nombre}</Text>
            <View style={{ flex: 1 }}>
              <Opciones opciones={[{ valor: 0, texto: 'Sin comanda' }, ...(areas?.areas ?? []).filter((a) => a.activo).map((a) => ({ valor: a.id, texto: a.nombre }))]}
                valor={asignadas[c.id] ?? 0} onCambiar={(id) => setAsignadas((x) => ({ ...x, [c.id]: id || null }))} />
            </View>
          </View>
        ))}
        <Boton titulo={cambiadas.length ? `Guardar ${cambiadas.length} cambio(s)` : 'Sin cambios'} cargando={guardando} deshabilitado={!cambiadas.length} onPress={guardarCategorias} />
      </View>

      <View style={e.bloque}>
        <View style={e.cabecera}>
          <View style={{ flex: 1 }}>
            <Text style={e.titulo}>Mesas y terminales</Text>
            <Text style={e.suave}>Lo que aparece en el mapa de Mesas: las mesas y la caja de mostrador (venta rápida).</Text>
          </View>
          <Boton titulo="+ Mesa" chico onPress={() => setTerminal({ item: null })} />
        </View>
        {(terminales?.terminales ?? []).map((t) => (
          <Pressable key={t.id} onPress={() => setTerminal({ item: t })} style={[e.fila, !t.activo && { opacity: 0.5 }]}>
            <View style={{ flex: 1 }}>
              <Text style={e.nombre}>{t.nombre}</Text>
              <Text style={e.suave}>{TIPOS.find((x) => x.valor === t.tipo)?.texto}{t.zona ? ` · ${t.zona}` : ''}{t.capacidad ? ` · ${t.capacidad} personas` : ''}{t.caja ? ` · ${t.caja}` : ''}</Text>
            </View>
            {t.ocupada && <Etiqueta texto="Ocupada" fondo="#FCE7F3" color="#9D174D" />}
            {!t.activo && <Etiqueta texto="Inactiva" fondo="#E5E7EB" color="#374151" />}
          </Pressable>
        ))}
      </View>

      {area && areas && <FormArea item={area.item} impresoras={areas.impresoras} onCerrar={() => setArea(null)} onListo={() => { setArea(null); cargar(); }} />}
      {terminal && <FormTerminal item={terminal.item} zonas={terminales?.zonas ?? []} siguiente={(terminales?.terminales.length ?? 0) + 1}
        onCerrar={() => setTerminal(null)} onListo={() => { setTerminal(null); cargar(); }} />}
    </ScrollView>
  );
}

function FormArea({ item, impresoras, onCerrar, onListo }: { item: op.AreaPrep | null; impresoras: { id: number; nombre: string }[]; onCerrar: () => void; onListo: () => void }) {
  const [nombre, setNombre] = useState(item?.nombre ?? '');
  const [color, setColor] = useState<string | null>(item?.color ?? COLORES[0]);
  const [impresoraId, setImpresoraId] = useState<number | null>(item?.impresora_id ?? null);
  const [activo, setActivo] = useState(item?.activo ?? true);
  const [guardando, setGuardando] = useState(false);
  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await op.guardarArea({ nombre: nombre.trim(), color, impresora_id: impresoraId, activo }, item?.id);
      avisar(r.message);
      onListo();
    } catch (err) {
      avisar('No se pudo guardar', mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };
  return (
    <Ventana visible titulo={item ? `Editar ${item.nombre}` : 'Nueva área'} onCerrar={onCerrar} ancho={560}
      pie={<Boton estilo={{ flex: 1 }} titulo="Guardar" cargando={guardando} deshabilitado={!nombre.trim()} onPress={guardar} />}>
      <Campo etiqueta="Nombre" value={nombre} onChangeText={setNombre} placeholder="Cocina, Barra, Vitrina..." maxLength={60} />
      <Seccion titulo="Color" />
      <View style={e.rejilla}>
        {COLORES.map((c) => <Pressable key={c} onPress={() => setColor(c)} style={[e.color, { backgroundColor: c }, color === c && e.colorActivo]} />)}
      </View>
      <Seccion titulo="Impresora de sus comandas" />
      <Opciones opciones={[{ valor: 0, texto: 'La predeterminada de comandas' }, ...impresoras.map((i) => ({ valor: i.id, texto: i.nombre }))]}
        valor={impresoraId ?? 0} onCambiar={(v) => setImpresoraId(v || null)} />
      {item && <Interruptor titulo="Activa" valor={activo} onCambiar={setActivo} />}
    </Ventana>
  );
}

function FormTerminal({ item, zonas, siguiente, onCerrar, onListo }: { item: op.TerminalConfig | null; zonas: string[]; siguiente: number; onCerrar: () => void; onListo: () => void }) {
  const [nombre, setNombre] = useState(item?.nombre ?? '');
  const [tipo, setTipo] = useState<string>(item?.tipo ?? 'mesa');
  const [zona, setZona] = useState(item?.zona ?? '');
  const [capacidad, setCapacidad] = useState(item?.capacidad ? String(item.capacidad) : '4');
  const [orden, setOrden] = useState(String(item?.orden ?? siguiente * 10));
  const [cajaId, setCajaId] = useState<number | null>(item?.caja_id ?? null);
  const [activo, setActivo] = useState(item?.activo ?? true);
  const [cajas, setCajas] = useState<{ id: number; nombre: string }[]>([]);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { getCatalogosCaja().then((c) => setCajas(c.cajas)).catch(() => null); }, []);

  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await op.guardarTerminal({
        nombre: nombre.trim(), tipo, zona: zona.trim() || null, capacidad: capacidad ? Number(capacidad) : null,
        orden: Number(orden || 0), caja_id: tipo === 'caja' ? cajaId : null, activo,
      }, item?.id);
      avisar(r.message ?? 'Guardado');
      onListo();
    } catch (err) {
      avisar('No se pudo guardar', mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };
  return (
    <Ventana visible titulo={item ? `Editar ${item.nombre}` : 'Nueva mesa'} onCerrar={onCerrar} ancho={580}
      pie={<Boton estilo={{ flex: 1 }} titulo="Guardar" cargando={guardando} deshabilitado={!nombre.trim() || (tipo === 'caja' && !cajaId)} onPress={guardar} />}>
      <Campo etiqueta="Nombre" value={nombre} onChangeText={setNombre} placeholder="MESA 7" maxLength={60} autoFocus={!item} />
      <Seccion titulo="Tipo" />
      <Opciones opciones={TIPOS} valor={tipo} onCambiar={setTipo} />
      {tipo === 'caja' && (
        <>
          <Seccion titulo="Caja que usa" />
          <Opciones opciones={cajas.map((c) => ({ valor: c.id, texto: c.nombre }))} valor={cajaId} onCambiar={setCajaId} />
        </>
      )}
      <Campo etiqueta="Zona" value={zona} onChangeText={setZona} placeholder="Salón, Terraza..." maxLength={60} />
      {zonas.length > 0 && <Opciones opciones={zonas.map((z) => ({ valor: z, texto: z }))} valor={zona} onCambiar={setZona} />}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Campo etiqueta="Personas" value={capacidad} onChangeText={(t) => setCapacidad(t.replace(/\D/g, ''))} keyboardType="number-pad" /></View>
        <View style={{ flex: 1 }}><Campo etiqueta="Orden en el mapa" value={orden} onChangeText={(t) => setOrden(t.replace(/\D/g, ''))} keyboardType="number-pad" /></View>
      </View>
      {item && <Interruptor titulo="Activa" detalle={item.ocupada ? 'Tiene una orden abierta: ciérrala antes de desactivarla' : 'Si la apagas deja de salir en el mapa'} valor={activo} onCambiar={setActivo} />}
    </Ventana>
  );
}

const e = StyleSheet.create({
  contenido: { padding: 12, gap: 12, maxWidth: 1000, width: '100%', alignSelf: 'center' },
  bloque: { backgroundColor: '#fff', borderRadius: radio, borderWidth: 1, borderColor: C.borde, padding: 14, gap: 10 },
  cabecera: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  titulo: { fontSize: 18, fontWeight: '800', color: C.texto },
  suave: { fontSize: 13, color: C.suave },
  nombre: { fontSize: 15, fontWeight: '700', color: C.texto },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pastilla: { minWidth: 200, padding: 12, borderRadius: radio, borderWidth: 1, borderLeftWidth: 6, borderColor: C.borde, gap: 2 },
  filaCategoria: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderColor: C.borde, flexWrap: 'wrap' },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderColor: C.borde },
  color: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: C.borde },
  colorActivo: { borderColor: C.texto, borderWidth: 4 },
});
