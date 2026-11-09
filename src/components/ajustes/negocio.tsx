// Datos del negocio (ticket y reglas de venta), cajas y formas de pago
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { type Ayuda, Interruptor, Opciones, Seccion } from '@/components/formulario';
import { Boton, Campo, Etiqueta, Ventana } from '@/components/ui';
import { C, radio } from '@/constants/colores';
import { mensajeError } from '@/lib/api';
import { avisar } from '@/lib/aviso';
import * as op from '@/lib/operaciones';

// Explicaciones con ejemplos del botón «?» (las mismas de la web)
const AYUDA_STOCK_NEGATIVO: Ayuda = [
  { texto: 'Decide qué pasa cuando el sistema dice que ya no queda un producto pero alguien lo quiere vender, o sacar del inventario como merma o consumo interno.' },
  { ejemplo: 'Ejemplo: el sistema marca 0 conchas pero en la vitrina hay 3', lineas: [
    'Apagado: la concha sale «Agotado» en la venta y en las mesas y no se puede agregar. Primero hay que registrar la producción o ajustar el inventario.',
    'Encendido: se vende igual y la existencia queda en −1, −2, −3. El sistema avisa, y el negativo se corrige después con la producción o un ajuste.',
  ] },
  { ejemplo: 'Ejemplo: un plato con receta (desayuno con 2 huevos y pan)', lineas: [
    'Si quedan 3 huevos, solo alcanzan 1 desayuno. Apagado: el segundo desayuno ya no se deja agregar. Encendido: se vende y los huevos quedan en −1.',
  ] },
  { texto: 'Recomendado: apagado, para que el inventario sea confiable. Enciéndalo solo si todavía no registran la producción a tiempo y no quieren detener ventas.' },
];

const AYUDA_AVISO_CAMBIO: Ayuda = [
  { texto: 'Antes de registrar un cobro en efectivo, el sistema compara el cambio que hay que dar con el efectivo que debería haber en la gaveta (fondo + ventas en efectivo + ingresos − egresos − gastos de caja).' },
  { ejemplo: 'Ejemplo: en la gaveta hay $20 y el cliente paga $0.30 con un billete de $100', lineas: [
    'Encendido: el cambio ($99.70) sale en naranja y, al tocar Cobrar, pregunta: Cobrar igual, Cambiar el pago (otro billete, tarjeta o pago mixto) o Cancelar la venta.',
    'Apagado: se cobra directo, sin aviso.',
  ] },
  { texto: 'Con el cierre ciego encendido el aviso no les sale a los cajeros, porque revelaría cuánto hay en la gaveta. Sí les sale a quienes tienen el permiso «Ver historial de cierres».' },
  { texto: 'Nunca bloquea la venta: si alguien trae el cambio, se cobra igual y ese dinero se registra como ingreso de caja.' },
];

const AYUDA_POR_COMPRAR: Ayuda = [
  { texto: 'Al cerrar el turno, el ticket termina con la lista POR COMPRAR: los productos que quedaron en su stock mínimo o por debajo.' },
  { ejemplo: 'Ejemplo: la Concha quedó en 0 y su mínimo es 20', lineas: [
    'Encendido: el ticket de cierre imprime «Concha · hay 0 u / mín 20» al final.',
    'Apagado: el ticket de cierre no imprime esa sección.',
  ] },
  { texto: 'La lista no se pierde: sigue en la pantalla del turno y en la web (Inventario › Control de existencias), y la campanita sigue avisando.' },
];

const AYUDA_CIERRE_CIEGO: Ayuda = [
  { texto: 'Sirve para que el conteo de la gaveta sea honesto: quien cuenta no sabe cuánto «debería» haber, así que escribe lo que de verdad tiene en la mano.' },
  { ejemplo: 'Ejemplo: el turno abrió con $50 de fondo, vendió $320 en efectivo y pagó un gasto de $20', lineas: [
    'El sistema calcula que en la gaveta debería haber $350. Al contar, el cajero encuentra $340.',
    'Apagado: en la pantalla del turno y al contar se ve «Efectivo esperado $350». El cajero sabe cuánto falta antes de escribir su conteo.',
    'Encendido: el cajero no ve los $350. Cuenta billetes y monedas, escribe $340 y, al cerrar el turno, aparece «Faltante $10».',
  ] },
  { ejemplo: 'Ejemplo: arqueo a media jornada', lineas: [
    'Si hacen un arqueo (contar la gaveta sin cerrar el turno), con el cierre ciego encendido el cajero tampoco ve la diferencia. Queda guardada para el administrador.',
  ] },
  { texto: 'Quién sí lo ve: los usuarios con el permiso «Ver historial de cierres» (el administrador) siempre ven el esperado y la diferencia, aunque esté encendido.' },
  { texto: 'Recomendado: encendido cuando la caja la cuenta un empleado; apagado si la cuenta el mismo dueño.' },
];

const TIPOS_METODO = [
  { valor: 'efectivo', texto: 'Efectivo' }, { valor: 'tarjeta', texto: 'Tarjeta' }, { valor: 'transferencia', texto: 'Transferencia' },
  { valor: 'credito', texto: 'Crédito (a cuenta del cliente)' }, { valor: 'otro', texto: 'Otro' },
];

export function NegocioCajas() {
  const [negocio, setNegocio] = useState<op.Negocio | null>(null);
  const [cajas, setCajas] = useState<op.CajaConfig[]>([]);
  const [metodos, setMetodos] = useState<op.MetodoConfig[]>([]);
  const [impresoras, setImpresoras] = useState<op.Impresora[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [caja, setCaja] = useState<{ item: op.CajaConfig | null } | null>(null);
  const [metodo, setMetodo] = useState<{ item: op.MetodoConfig | null } | null>(null);

  const cargar = useCallback(() => {
    op.getNegocio().then(setNegocio).catch((err) => avisar('No se pudo cargar', mensajeError(err)));
    op.getCajasConfig().then(setCajas).catch(() => null);
    op.getMetodosConfig().then(setMetodos).catch(() => null);
    op.getImpresoras().then(setImpresoras).catch(() => null);
  }, []);
  useEffect(cargar, [cargar]);

  const cambiar = (c: Partial<op.Negocio>) => setNegocio((n) => (n ? { ...n, ...c } : n));
  const guardar = async () => {
    if (!negocio) return;
    setGuardando(true);
    try {
      const r = await op.guardarNegocio({ ...negocio, descuento_max_sin_autorizacion: Number(negocio.descuento_max_sin_autorizacion || 0) });
      avisar(r.message);
      cargar();
    } catch (err) {
      avisar('No se pudo guardar', mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={e.contenido} keyboardShouldPersistTaps="handled">
      {negocio && (
        <View style={e.bloque}>
          <Text style={e.titulo}>Datos del negocio</Text>
          <Text style={e.suave}>Salen en el recibo del cliente. El logo se cambia en la web.</Text>
          <Campo etiqueta="Nombre comercial" value={negocio.nombre} onChangeText={(t) => cambiar({ nombre: t })} maxLength={200} placeholder="Panadería Eduardo" />
          <Campo etiqueta="Razón social (sale grande arriba del recibo)" value={negocio.razon_social ?? ''} onChangeText={(t) => cambiar({ razon_social: t || null })} maxLength={200} placeholder="FLAVIOS SAS DE CV" />
          <View style={e.fila2}>
            <View style={{ flex: 1 }}><Campo etiqueta="NIT" value={negocio.nit ?? ''} onChangeText={(t) => cambiar({ nit: t || null })} maxLength={30} /></View>
            <View style={{ flex: 1 }}><Campo etiqueta="NRC" value={negocio.nrc ?? ''} onChangeText={(t) => cambiar({ nrc: t || null })} maxLength={30} /></View>
          </View>
          <Campo etiqueta="Actividad económica" value={negocio.actividad_economica ?? ''} onChangeText={(t) => cambiar({ actividad_economica: t || null })} maxLength={200} />
          <Campo etiqueta="Tipo de establecimiento" value={negocio.tipo_establecimiento ?? ''} onChangeText={(t) => cambiar({ tipo_establecimiento: t || null })} maxLength={100} placeholder="Sucursal / Agencia" />
          <Campo etiqueta="Dirección" value={negocio.direccion ?? ''} onChangeText={(t) => cambiar({ direccion: t || null })} maxLength={300} />
          <View style={e.fila2}>
            <View style={{ flex: 1 }}><Campo etiqueta="Teléfono" value={negocio.telefono ?? ''} onChangeText={(t) => cambiar({ telefono: t || null })} keyboardType="phone-pad" /></View>
            <View style={{ flex: 1 }}><Campo etiqueta="Correo" value={negocio.correo ?? ''} onChangeText={(t) => cambiar({ correo: t || null })} keyboardType="email-address" autoCapitalize="none" /></View>
          </View>
          <Campo etiqueta="Mensaje al pie del ticket" value={negocio.mensaje_ticket ?? ''} onChangeText={(t) => cambiar({ mensaje_ticket: t || null })} maxLength={500} placeholder="¡Gracias por su compra!" />

          <Seccion titulo="Reglas de venta" />
          <Interruptor titulo="Permitir vender sin existencia" valor={negocio.permitir_stock_negativo} onCambiar={(v) => cambiar({ permitir_stock_negativo: v })}
            detalle={negocio.permitir_stock_negativo ? 'Se puede vender aunque el sistema diga 0 (queda en negativo y avisa)' : 'Lo que no tiene existencia sale «Agotado» y no se puede vender'}
            ayuda={AYUDA_STOCK_NEGATIVO} />
          <Campo etiqueta="Descuento máximo sin autorización (%)" value={String(negocio.descuento_max_sin_autorizacion ?? '')} keyboardType="decimal-pad"
            onChangeText={(t) => cambiar({ descuento_max_sin_autorizacion: t.replace(/[^0-9.]/g, '') })} placeholder="10" />
          <Text style={e.suave}>Arriba de ese porcentaje se pide el PIN de un encargado.</Text>
          <Interruptor titulo="Cierre ciego" detalle="Quien cierra el turno cuenta sin ver cuánto debería haber; el resultado se ve al final"
            valor={!!negocio.cierre_ciego} onCambiar={(v) => cambiar({ cierre_ciego: v })} ayuda={AYUDA_CIERRE_CIEGO} />
          <Interruptor titulo="Avisar si no alcanza el cambio" detalle="Al cobrar en efectivo, avisa cuando el cambio es mayor que lo que hay en la gaveta"
            valor={negocio.aviso_cambio !== false} onCambiar={(v) => cambiar({ aviso_cambio: v })} ayuda={AYUDA_AVISO_CAMBIO} />
          <Interruptor titulo="«Por comprar» en el ticket de cierre" detalle="Imprime al final del cierre de turno los productos en su mínimo o por debajo"
            valor={negocio.ticket_por_comprar !== false} onCambiar={(v) => cambiar({ ticket_por_comprar: v })} ayuda={AYUDA_POR_COMPRAR} />
          <Boton titulo="Guardar datos del negocio" cargando={guardando} deshabilitado={!negocio.nombre.trim()} onPress={guardar} />
        </View>
      )}

      <View style={e.bloque}>
        <View style={e.cabecera}>
          <View style={{ flex: 1 }}>
            <Text style={e.titulo}>Cajas</Text>
            <Text style={e.suave}>Cada caja física con la impresora donde salen sus tickets.</Text>
          </View>
          <Boton titulo="+ Caja" chico onPress={() => setCaja({ item: null })} />
        </View>
        {cajas.map((c) => (
          <Pressable key={c.id} onPress={() => setCaja({ item: c })} style={[e.fila, !c.activo && { opacity: 0.5 }]}>
            <View style={{ flex: 1 }}>
              <Text style={e.nombre}>{c.nombre}</Text>
              <Text style={e.suave}>{impresoras.find((i) => i.id === c.impresora_id)?.alias ?? 'Impresora predeterminada'}</Text>
            </View>
            {c.turno_abierto && <Etiqueta texto={`Turno de ${c.turno_abierto.usuario ?? ''}`} fondo="#DCFCE7" color="#166534" />}
          </Pressable>
        ))}
      </View>

      <View style={e.bloque}>
        <View style={e.cabecera}>
          <View style={{ flex: 1 }}>
            <Text style={e.titulo}>Formas de pago</Text>
            <Text style={e.suave}>Solo las que mueven la gaveta cuentan en el efectivo del cierre.</Text>
          </View>
          <Boton titulo="+ Forma de pago" chico onPress={() => setMetodo({ item: null })} />
        </View>
        {metodos.map((m) => (
          <Pressable key={m.id} onPress={() => setMetodo({ item: m })} style={[e.fila, !m.activo && { opacity: 0.5 }]}>
            <View style={{ flex: 1 }}>
              <Text style={e.nombre}>{m.nombre}</Text>
              <Text style={e.suave}>{TIPOS_METODO.find((t) => t.valor === m.tipo)?.texto ?? m.tipo}{m.afecta_efectivo ? ' · mueve la gaveta' : ''}{m.requiere_referencia ? ' · pide referencia' : ''}</Text>
            </View>
            {!m.activo && <Etiqueta texto="Inactiva" fondo="#E5E7EB" color="#374151" />}
          </Pressable>
        ))}
      </View>

      {caja && <FormCaja item={caja.item} impresoras={impresoras} onCerrar={() => setCaja(null)} onListo={() => { setCaja(null); cargar(); }} />}
      {metodo && <FormMetodo item={metodo.item} siguiente={metodos.length + 1} onCerrar={() => setMetodo(null)} onListo={() => { setMetodo(null); cargar(); }} />}
    </ScrollView>
  );
}

function FormCaja({ item, impresoras, onCerrar, onListo }: { item: op.CajaConfig | null; impresoras: op.Impresora[]; onCerrar: () => void; onListo: () => void }) {
  const [nombre, setNombre] = useState(item?.nombre ?? '');
  const [impresoraId, setImpresoraId] = useState<number | null>(item?.impresora_id ?? null);
  const [activo, setActivo] = useState(item?.activo ?? true);
  const [guardando, setGuardando] = useState(false);
  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await op.guardarCaja({ nombre: nombre.trim(), impresora_id: impresoraId, activo }, item?.id);
      avisar(r.message);
      onListo();
    } catch (err) {
      avisar('No se pudo guardar', mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };
  return (
    <Ventana visible titulo={item ? `Editar ${item.nombre}` : 'Nueva caja'} onCerrar={onCerrar} ancho={520}
      pie={<Boton estilo={{ flex: 1 }} titulo="Guardar" cargando={guardando} deshabilitado={!nombre.trim()} onPress={guardar} />}>
      <Campo etiqueta="Nombre" value={nombre} onChangeText={setNombre} placeholder="Caja principal" maxLength={100} />
      <Seccion titulo="Impresora de tickets" />
      <Opciones opciones={[{ valor: 0, texto: 'La predeterminada' }, ...impresoras.filter((i) => i.uso !== 'comanda').map((i) => ({ valor: i.id, texto: i.alias }))]}
        valor={impresoraId ?? 0} onCambiar={(v) => setImpresoraId(v || null)} />
      {item && <Interruptor titulo="Activa" detalle="No se puede desactivar con un turno abierto" valor={activo} onCambiar={setActivo} />}
    </Ventana>
  );
}

function FormMetodo({ item, siguiente, onCerrar, onListo }: { item: op.MetodoConfig | null; siguiente: number; onCerrar: () => void; onListo: () => void }) {
  const [nombre, setNombre] = useState(item?.nombre ?? '');
  const [tipo, setTipo] = useState(item?.tipo ?? 'transferencia');
  const [efectivo, setEfectivo] = useState(item?.afecta_efectivo ?? false);
  const [referencia, setReferencia] = useState(item?.requiere_referencia ?? false);
  const [activo, setActivo] = useState(item?.activo ?? true);
  const [guardando, setGuardando] = useState(false);
  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await op.guardarMetodo({ nombre: nombre.trim(), tipo, afecta_efectivo: efectivo, requiere_referencia: referencia, orden: item?.orden ?? siguiente, activo }, item?.id);
      avisar(r.message);
      onListo();
    } catch (err) {
      avisar('No se pudo guardar', mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };
  return (
    <Ventana visible titulo={item ? `Editar ${item.nombre}` : 'Nueva forma de pago'} onCerrar={onCerrar} ancho={560}
      pie={<Boton estilo={{ flex: 1 }} titulo="Guardar" cargando={guardando} deshabilitado={!nombre.trim()} onPress={guardar} />}>
      <Campo etiqueta="Nombre" value={nombre} onChangeText={setNombre} placeholder="Bitcoin, Chivo, Transferencia BAC..." maxLength={100} />
      <Seccion titulo="Tipo" />
      <Opciones opciones={TIPOS_METODO} valor={tipo} onCambiar={(t) => { setTipo(t); if (t === 'efectivo') setEfectivo(true); }} />
      <Interruptor titulo="Mueve la gaveta" detalle="Entra o sale efectivo de la caja y cuenta en el cierre" valor={efectivo} onCambiar={setEfectivo} />
      <Interruptor titulo="Pide referencia" detalle="Número de voucher o de transferencia al cobrar" valor={referencia} onCambiar={setReferencia} />
      {item && <Interruptor titulo="Activa" detalle="Debe quedar al menos una forma de pago en efectivo activa" valor={activo} onCambiar={setActivo} />}
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
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderColor: C.borde },
  fila2: { flexDirection: 'row', gap: 10 },
});
