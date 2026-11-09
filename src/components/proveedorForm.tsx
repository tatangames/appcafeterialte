// Alta y edición de un proveedor (desde Proveedores y desde Nueva compra)
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Boton, Campo, Ventana } from '@/components/ui';
import { C } from '@/constants/colores';
import { mensajeError } from '@/lib/api';
import { avisar } from '@/lib/aviso';
import * as op from '@/lib/operaciones';

type Props = { proveedor: op.ProveedorFicha | null; onCerrar: () => void; onGuardado: (p: op.ProveedorFicha) => void };

export function ProveedorForm({ visible, ...props }: Props & { visible: boolean }) {
  return visible ? <Contenido {...props} /> : null;
}

function Contenido({ proveedor, onCerrar, onGuardado }: Props) {
  const [d, setD] = useState({
    nombre: proveedor?.nombre ?? '', nit: proveedor?.nit ?? '', nrc: proveedor?.nrc ?? '', contacto: proveedor?.contacto ?? '',
    telefono: proveedor?.telefono ?? '', correo: proveedor?.correo ?? '', direccion: proveedor?.direccion ?? '',
    dias_credito: proveedor?.dias_credito != null ? String(proveedor.dias_credito) : '', notas: proveedor?.notas ?? '',
    activo: proveedor?.activo ?? true,
  });
  const [guardando, setGuardando] = useState(false);
  const campo = (k: keyof typeof d) => (v: string) => setD((x) => ({ ...x, [k]: v }));

  const guardar = async () => {
    setGuardando(true);
    try {
      const vacio = (v: string) => (v.trim() ? v.trim() : null);
      const r = await op.guardarProveedor({
        nombre: d.nombre.trim(), nit: vacio(d.nit), nrc: vacio(d.nrc), contacto: vacio(d.contacto), telefono: vacio(d.telefono),
        correo: vacio(d.correo), direccion: vacio(d.direccion), dias_credito: d.dias_credito ? Number(d.dias_credito) : null,
        notas: vacio(d.notas), activo: d.activo,
      }, proveedor?.id);
      avisar(r.message);
      onGuardado(r.proveedor);
    } catch (err) {
      avisar('No se pudo guardar', mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Ventana visible titulo={proveedor ? `Editar ${proveedor.nombre}` : 'Nuevo proveedor'} onCerrar={onCerrar} ancho={620}
      pie={<Boton estilo={{ flex: 1 }} titulo="Guardar" cargando={guardando} deshabilitado={!d.nombre.trim()} onPress={guardar} />}>
      <Campo etiqueta="Nombre *" value={d.nombre} onChangeText={campo('nombre')} placeholder="Molinos de El Salvador" maxLength={200} />
      <View style={e.fila}>
        <View style={e.col}><Campo etiqueta="NIT" value={d.nit} onChangeText={campo('nit')} maxLength={30} /></View>
        <View style={e.col}><Campo etiqueta="NRC" value={d.nrc} onChangeText={campo('nrc')} maxLength={30} /></View>
      </View>
      <View style={e.fila}>
        <View style={e.col}><Campo etiqueta="Contacto" value={d.contacto} onChangeText={campo('contacto')} placeholder="Nombre del vendedor" maxLength={100} /></View>
        <View style={e.col}><Campo etiqueta="Teléfono" value={d.telefono} onChangeText={campo('telefono')} keyboardType="phone-pad" maxLength={30} /></View>
      </View>
      <Campo etiqueta="Correo" value={d.correo} onChangeText={campo('correo')} keyboardType="email-address" autoCapitalize="none" maxLength={100} />
      <Campo etiqueta="Dirección" value={d.direccion} onChangeText={campo('direccion')} maxLength={300} />
      <Campo etiqueta="Días de crédito (cuándo vence cada compra)" value={d.dias_credito} keyboardType="number-pad" maxLength={3}
        onChangeText={(t) => campo('dias_credito')(t.replace(/\D/g, ''))} placeholder="0 = contado" />
      <Campo etiqueta="Notas" value={d.notas} onChangeText={campo('notas')} maxLength={1000} />
      {proveedor && (
        <Pressable onPress={() => setD((x) => ({ ...x, activo: !x.activo }))} style={e.check}>
          <View style={[e.casilla, d.activo && e.casillaOn]}>{d.activo && <Text style={{ color: '#fff', fontWeight: '800' }}>✓</Text>}</View>
          <Text style={{ fontSize: 15, color: C.texto }}>Activo (aparece al registrar compras)</Text>
        </Pressable>
      )}
    </Ventana>
  );
}

const e = StyleSheet.create({
  fila: { flexDirection: 'row', gap: 10 },
  col: { flex: 1 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  casilla: { width: 28, height: 28, borderRadius: 6, borderWidth: 2, borderColor: '#9CA3AF', alignItems: 'center', justifyContent: 'center' },
  casillaOn: { backgroundColor: C.exito, borderColor: C.exito },
});
