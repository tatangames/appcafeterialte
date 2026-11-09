// Clientes: formulario de alta/edición y buscador para asignarlo a una venta o a un encargo
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Boton, Campo, Ventana } from '@/components/ui';
import { C, radio } from '@/constants/colores';
import { mensajeError } from '@/lib/api';
import { avisar } from '@/lib/aviso';
import { dinero } from '@/lib/formato';
import * as op from '@/lib/operaciones';
import { useSesion } from '@/lib/sesion';

type PropsForm = { cliente: op.Cliente | null; nombreInicial?: string; onCerrar: () => void; onGuardado: (c: op.Cliente) => void };

export function ClienteForm({ visible, ...props }: PropsForm & { visible: boolean }) {
  return visible ? <Formulario {...props} /> : null;
}

function Formulario({ cliente, nombreInicial = '', onCerrar, onGuardado }: PropsForm) {
  const { puede } = useSesion();
  // El límite de crédito lo da quien maneja las cuentas por cobrar
  const daCredito = puede('cuentas_cobrar.gestionar');
  const [d, setD] = useState({
    nombre: cliente?.nombre ?? nombreInicial, documento: cliente?.documento ?? '', telefono: cliente?.telefono ?? '',
    correo: cliente?.correo ?? '', direccion: cliente?.direccion ?? '', notas: cliente?.notas ?? '',
    limite_credito: cliente ? String(cliente.limite_credito || '') : '', dias_credito: cliente?.dias_credito ? String(cliente.dias_credito) : '',
    activo: cliente?.activo ?? true,
  });
  const [guardando, setGuardando] = useState(false);
  const campo = (k: keyof typeof d) => (v: string) => setD((x) => ({ ...x, [k]: v }));

  const guardar = async () => {
    setGuardando(true);
    try {
      const vacio = (v: string) => (v.trim() ? v.trim() : null);
      const r = await op.guardarCliente({
        nombre: d.nombre.trim(), documento: vacio(d.documento), telefono: vacio(d.telefono), correo: vacio(d.correo),
        direccion: vacio(d.direccion), notas: vacio(d.notas), activo: d.activo,
        ...(daCredito ? { limite_credito: Number(d.limite_credito || 0), dias_credito: d.dias_credito ? Number(d.dias_credito) : null } : {}),
      }, cliente?.id);
      avisar(r.message);
      onGuardado(r.cliente);
    } catch (err) {
      avisar('No se pudo guardar', mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Ventana visible titulo={cliente ? `Editar ${cliente.nombre}` : 'Nuevo cliente'} onCerrar={onCerrar} ancho={620}
      pie={<Boton estilo={{ flex: 1 }} titulo="Guardar" cargando={guardando} deshabilitado={!d.nombre.trim()} onPress={guardar} />}>
      <Campo etiqueta="Nombre *" value={d.nombre} onChangeText={campo('nombre')} placeholder="Tienda Don Pepe" maxLength={200} autoFocus={!cliente} />
      <View style={e.fila}>
        <View style={e.col}><Campo etiqueta="DUI o NIT" value={d.documento} onChangeText={campo('documento')} maxLength={30} /></View>
        <View style={e.col}><Campo etiqueta="Teléfono" value={d.telefono} onChangeText={campo('telefono')} keyboardType="phone-pad" maxLength={30} /></View>
      </View>
      <Campo etiqueta="Correo" value={d.correo} onChangeText={campo('correo')} keyboardType="email-address" autoCapitalize="none" maxLength={100} />
      <Campo etiqueta="Dirección" value={d.direccion} onChangeText={campo('direccion')} maxLength={300} />
      {daCredito ? (
        <View style={e.fila}>
          <View style={e.col}>
            <Campo etiqueta="Límite de crédito ($)" value={d.limite_credito} keyboardType="decimal-pad" placeholder="0 = sin crédito"
              onChangeText={(t) => campo('limite_credito')(t.replace(/[^0-9.]/g, ''))} />
          </View>
          <View style={e.col}>
            <Campo etiqueta="Días para pagar" value={d.dias_credito} keyboardType="number-pad" placeholder="15"
              onChangeText={(t) => campo('dias_credito')(t.replace(/\D/g, ''))} />
          </View>
        </View>
      ) : (
        <Text style={e.suave}>El crédito lo asigna quien maneja las cuentas por cobrar.</Text>
      )}
      <Campo etiqueta="Notas" value={d.notas} onChangeText={campo('notas')} maxLength={500} />
      {cliente && (
        <Pressable onPress={() => setD((x) => ({ ...x, activo: !x.activo }))} style={e.check}>
          <View style={[e.casilla, d.activo && e.casillaOn]}>{d.activo && <Text style={{ color: '#fff', fontWeight: '800' }}>✓</Text>}</View>
          <Text style={{ fontSize: 15, color: C.texto }}>Activo</Text>
        </Pressable>
      )}
    </Ventana>
  );
}

type PropsBuscador = { titulo?: string; onCerrar: () => void; onElegir: (c: op.Cliente) => void };

export function BuscarCliente({ visible, ...props }: PropsBuscador & { visible: boolean }) {
  return visible ? <Buscador {...props} /> : null;
}

function Buscador({ titulo = 'Asignar cliente', onCerrar, onElegir }: PropsBuscador) {
  const { puede } = useSesion();
  const [buscar, setBuscar] = useState('');
  const [lista, setLista] = useState<op.Cliente[] | null>(null);
  const [nuevo, setNuevo] = useState(false);

  const cargar = useCallback((texto: string) => {
    op.getClientes({ buscar: texto.trim() }).then((r) => setLista(r.clientes)).catch((err) => avisar('No se pudo buscar', mensajeError(err)));
  }, []);
  useEffect(() => {
    const t = setTimeout(() => cargar(buscar), 300);
    return () => clearTimeout(t);
  }, [buscar, cargar]);

  if (nuevo) {
    return <ClienteForm visible cliente={null} nombreInicial={buscar.trim()} onCerrar={() => setNuevo(false)} onGuardado={onElegir} />;
  }

  return (
    <Ventana visible titulo={titulo} subtitulo="Para venderle al crédito o guardar la venta en su historial" onCerrar={onCerrar} ancho={560}>
      <TextInput style={e.buscar} value={buscar} onChangeText={setBuscar} placeholder="Nombre, DUI/NIT o teléfono" placeholderTextColor={C.tenue} autoFocus />
      {puede('clientes.gestionar') && <Boton titulo="+ Nuevo cliente" variante="contorno" onPress={() => setNuevo(true)} />}
      <FlatList
        data={lista ?? []}
        keyExtractor={(c) => String(c.id)}
        scrollEnabled={false}
        contentContainerStyle={{ gap: 6 }}
        ListEmptyComponent={<Text style={e.suave}>{lista ? 'Ningún cliente coincide' : 'Buscando...'}</Text>}
        renderItem={({ item: c }) => (
          <Pressable style={({ pressed }) => [e.resultado, pressed && { opacity: 0.8 }]} onPress={() => onElegir(c)}>
            <Text style={e.nombre}>{c.nombre}</Text>
            <Text style={e.suave}>
              {[c.telefono, c.documento].filter(Boolean).join(' · ')}
              {c.limite_credito > 0 ? `${c.telefono || c.documento ? ' · ' : ''}crédito disponible ${dinero(c.credito_disponible)}` : ''}
              {c.saldo > 0 ? ` · debe ${dinero(c.saldo)}` : ''}
            </Text>
          </Pressable>
        )}
      />
    </Ventana>
  );
}

const e = StyleSheet.create({
  fila: { flexDirection: 'row', gap: 10 },
  col: { flex: 1 },
  suave: { fontSize: 13, color: C.suave },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  casilla: { width: 28, height: 28, borderRadius: 6, borderWidth: 2, borderColor: '#9CA3AF', alignItems: 'center', justifyContent: 'center' },
  casillaOn: { backgroundColor: C.exito, borderColor: C.exito },
  buscar: { height: 48, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: radio, paddingHorizontal: 14, fontSize: 16, backgroundColor: '#fff', color: C.texto },
  resultado: { padding: 12, borderRadius: radio, borderWidth: 1, borderColor: C.borde, gap: 2 },
  nombre: { fontSize: 16, fontWeight: '700', color: C.texto },
});
