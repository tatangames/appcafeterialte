// Cobro de una cuenta: una forma de pago o varias (parte con tarjeta y el resto en efectivo)
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Boton, Campo, Teclado, Ventana } from '@/components/ui';
import { C, radio } from '@/constants/colores';
import { dinero } from '@/lib/formato';
import { getTurnoActual } from '@/lib/servicios';
import { useSesion } from '@/lib/sesion';
import { MetodoPago } from '@/lib/tipos';

export interface Pago { metodo_pago_id: number; monto: number; referencia?: string }

type Props = {
  titulo: string; total: number; metodos: MetodoPago[]; cobrando: boolean;
  onCerrar: () => void; onCobrar: (pagos: Pago[]) => void;
  // Con un cliente con límite de crédito asignado se puede cobrar (todo o una parte) a su cuenta
  credito?: { cliente: string; disponible: number } | null;
  // Sin cambio en la gaveta: descartar la venta (venta rápida vacía la venta). Sin esto, solo cierra sin cobrar
  onAnular?: () => void;
};

const redondear = (v: number) => Math.round(v * 100) / 100;

// Se monta de cero en cada cobro: empieza en efectivo y sin monto recibido
export function CobroModal({ visible, ...props }: Props & { visible: boolean }) {
  return visible ? <Contenido {...props} /> : null;
}

function Contenido({ titulo, total, metodos, cobrando, onCerrar, onCobrar, credito, onAnular }: Props) {
  // El crédito solo aparece con un cliente que tenga límite de crédito
  const disponibles = metodos.filter((m) => m.tipo !== 'credito' || !!credito);
  const efectivoId = disponibles.find((m) => m.afecta_efectivo)?.id ?? disponibles[0]?.id ?? null;
  const [pagos, setPagos] = useState<(Pago & { nombre: string })[]>([]);
  const [metodoId, setMetodoId] = useState<number | null>(efectivoId);
  const [texto, setTexto] = useState('');
  const [referencia, setReferencia] = useState('');
  // Efectivo que debería haber en la gaveta, para avisar si no alcanza el cambio.
  // null: sin turno, sin conexión o cierre ciego (el cajero no debe ver cuánto hay)
  const { cajaId } = useSesion();
  const [enGaveta, setEnGaveta] = useState<number | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  useEffect(() => {
    if (!cajaId) return;
    let vigente = true;
    getTurnoActual(cajaId)
      .then((r) => { if (vigente) setEnGaveta(r.aviso_cambio !== false && r.turno && r.resumen?.efectivo_esperado != null ? Number(r.resumen.efectivo_esperado) : null); })
      .catch(() => null);
    return () => { vigente = false; };
  }, [cajaId]);

  const metodo = disponibles.find((m) => m.id === metodoId);
  const efectivo = !!metodo?.afecta_efectivo;
  const pagado = redondear(pagos.reduce((t, p) => t + p.monto, 0));
  const restante = redondear(Math.max(total - pagado, 0));
  // Lo que se pagaría con el método elegido: en efectivo lo recibido; en tarjeta, lo que falta (o lo escrito)
  const monto = texto ? Number(texto) : efectivo ? 0 : restante;
  const excede = !efectivo && monto > restante + 0.001;
  const cubierto = redondear(pagado + monto);
  const cambio = efectivo ? Math.max(0, redondear(cubierto - total)) : 0;
  const falta = cubierto + 0.001 < total;
  const noAlcanza = enGaveta !== null && cambio > enGaveta + 0.001;
  const sinReferencia = !!metodo?.requiere_referencia && !referencia.trim() && monto > 0;
  // Agregar esta parte y seguir con otra forma de pago. En efectivo solo si no cubre todo
  // (si cubre o sobra, es el último pago: se cobra y se da cambio)
  const motivoNoAgregar = !metodo ? 'Elige la forma de pago'
    : restante <= 0 ? 'Ya está cubierto el total: toca «Cobrar»'
    : monto <= 0 ? 'Escribe el monto de esta parte'
    : excede ? `No puede ser más de lo que falta (${dinero(restante)})`
    : sinReferencia ? `Escribe la referencia de ${metodo.nombre}`
    : efectivo && monto + 0.001 >= restante ? 'Con este efectivo ya se cubre: toca «Cobrar»'
    : null;

  const tecla = (t: string) => { setConfirmando(false); setTexto((v) => {
    if (t === '⌫') return v.slice(0, -1);
    if (t === '.' && v.includes('.')) return v;
    if (v.includes('.') && v.split('.')[1].length >= 2) return v;
    return v + t;
  }); };

  const cambiarMetodo = (id: number) => { setMetodoId(id); setTexto(''); setReferencia(''); };

  // Guarda esta parte y deja lo que falta para otra forma de pago
  const agregarParcial = () => {
    if (!metodo || motivoNoAgregar) return;
    setPagos((ps) => [...ps, { metodo_pago_id: metodo.id, nombre: metodo.nombre, monto: redondear(monto), referencia: referencia.trim() || undefined }]);
    setTexto('');
    setReferencia('');
    if (!efectivo && efectivoId) setMetodoId(efectivoId);
  };

  // forzar: el cajero ya vio el aviso de que no alcanza el cambio y cobra igual
  const cobrar = (forzar = false) => {
    if (!forzar && noAlcanza) { setConfirmando(true); return; }
    const lista: Pago[] = pagos.map(({ metodo_pago_id, monto: m, referencia: r }) => ({ metodo_pago_id, monto: m, referencia: r }));
    if (metodo && monto > 0) {
      lista.push({ metodo_pago_id: metodo.id, monto: efectivo ? redondear(monto) : Math.min(redondear(monto), restante), referencia: referencia.trim() || undefined });
    }
    onCobrar(lista);
  };

  const billetes = [restante, 5, 10, 20, 50].filter((b, i) => i === 0 || b > restante);

  return (
    <Ventana visible titulo={titulo} onCerrar={onCerrar} ancho={580}
      pie={
        total <= 0 ? (
          // Consumo interno: no lleva pago
          <Boton estilo={{ flex: 1 }} variante="exito" cargando={cobrando} titulo="Registrar sin cobro ($0.00)" onPress={() => onCobrar([])} />
        ) : confirmando && noAlcanza ? (
          // Aviso junto al botón: no alcanza el cambio en la gaveta
          <View style={[e.confirmar, { flex: 1 }]}>
            <Text style={[e.avisoTexto, { fontWeight: '800' }]}>No alcanza el cambio en la gaveta</Text>
            <Text style={e.avisoTexto}>Hay que dar {dinero(cambio)} de cambio y en la gaveta hay {dinero(enGaveta ?? 0)}. Pide un billete más chico, cobra con otra forma de pago o, si alguien pone el cambio, regístralo como ingreso de caja.</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Boton estilo={{ flex: 1 }} titulo="Cobrar igual" cargando={cobrando} onPress={() => cobrar(true)} />
              <Boton estilo={{ flex: 1 }} titulo="Cambiar el pago" variante="contorno" onPress={() => { setConfirmando(false); setTexto(''); }} />
            </View>
            <Boton titulo={onAnular ? 'Cancelar la venta' : 'No cobrar por ahora'} variante="peligro"
              onPress={() => { setConfirmando(false); (onAnular ?? onCerrar)(); }} />
          </View>
        ) : (
          <>
            <Boton estilo={{ flex: 1 }} variante="exito" cargando={cobrando} deshabilitado={!metodo || falta || excede || sinReferencia}
              titulo={falta ? `Faltan ${dinero(total - cubierto)}` : `Cobrar ${dinero(total)}`} onPress={() => cobrar()} />
          </>
        )
      }>
      <View style={e.total}>
        <Text style={e.suave}>Total a cobrar</Text>
        <Text style={e.totalMonto}>{dinero(total)}</Text>
        {pagos.length > 0 && <Text style={e.restante}>Falta {dinero(restante)}</Text>}
      </View>

      {pagos.map((p, i) => (
        <View key={i} style={e.pagoHecho}>
          <Text style={e.pagoTexto}>{p.nombre}{p.referencia ? ` · ${p.referencia}` : ''}</Text>
          <Text style={e.pagoTexto}>{dinero(p.monto)}</Text>
          <Pressable onPress={() => setPagos((ps) => ps.filter((_, j) => j !== i))} hitSlop={8}><Text style={e.quitar}>Quitar</Text></Pressable>
        </View>
      ))}

      <View style={e.metodos}>
        {disponibles.map((m) => (
          <Pressable key={m.id} onPress={() => cambiarMetodo(m.id)} style={[e.metodo, metodoId === m.id && e.metodoActivo]}>
            <Text style={[e.metodoTexto, metodoId === m.id && { color: '#fff' }]}>{m.nombre}</Text>
          </Pressable>
        ))}
      </View>

      <View style={e.fila}>
        <Text style={e.etiqueta}>{efectivo ? 'Recibido' : `Monto con ${metodo?.nombre ?? ''}`}</Text>
        <Text style={[e.recibido, excede && { color: C.peligro }]}>{dinero(monto)}</Text>
      </View>
      {excede && <Text style={e.error}>{metodo?.nombre} no puede ser más de lo que falta ({dinero(restante)})</Text>}
      {metodo?.tipo === 'credito' && credito && (
        <Text style={monto > credito.disponible + 0.001 ? e.error : e.suave}>
          A la cuenta de {credito.cliente}: tiene {dinero(credito.disponible)} disponibles.
          {monto > credito.disponible + 0.001 ? ' Pasa su límite: se pedirá el PIN de un encargado.' : ''}
        </Text>
      )}
      {metodo?.requiere_referencia && (
        <Campo etiqueta={`Referencia de ${metodo.nombre} (voucher, número de transferencia)`} value={referencia} onChangeText={setReferencia} />
      )}
      {efectivo && (
        <View style={e.billetes}>
          {billetes.map((b, i) => (
            <Pressable key={i} onPress={() => { setConfirmando(false); setTexto(b.toFixed(2)); }} style={e.billete}>
              <Text style={e.billeteTexto}>{i === 0 ? 'Exacto' : dinero(b)}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <Teclado onTecla={tecla} conPunto />

      {/* Varias formas de pago: cada parte se agrega aquí y lo que falta se cobra al final */}
      <View style={e.mixto}>
        <Text style={e.mixtoTitulo}>¿Paga con varias formas?</Text>
        <Text style={e.suave}>Elige la forma, escribe el monto de esa parte y toca «Agregar pago». Repite con la siguiente; la última se cobra con «Cobrar».</Text>
        <Boton titulo={metodo && monto > 0 ? `Agregar pago: ${metodo.nombre} ${dinero(monto)}` : 'Agregar pago'} variante="contorno"
          deshabilitado={!!motivoNoAgregar} onPress={agregarParcial} />
        {motivoNoAgregar && pagos.length + (texto ? 1 : 0) > 0 && <Text style={e.suave}>{motivoNoAgregar}</Text>}
      </View>
      {efectivo && (
        <View style={e.fila}>
          <Text style={e.etiqueta}>Cambio</Text>
          <Text style={[e.recibido, { color: noAlcanza ? '#D97706' : C.exito }]}>{dinero(cambio)}</Text>
        </View>
      )}
      {efectivo && noAlcanza && (
        <Text style={e.aviso}>El cambio ({dinero(cambio)}) es mayor que el efectivo en la gaveta ({dinero(enGaveta ?? 0)}).</Text>
      )}
    </Ventana>
  );
}

const e = StyleSheet.create({
  total: { alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: radio, padding: 12 },
  totalMonto: { fontSize: 36, fontWeight: '800', color: C.texto },
  restante: { fontSize: 16, fontWeight: '700', color: C.peligro },
  suave: { color: C.suave },
  error: { color: C.peligro, fontWeight: '600' },
  pagoHecho: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radio, backgroundColor: '#ECFDF5' },
  pagoTexto: { flex: 1, fontSize: 15, fontWeight: '700', color: '#166534' },
  quitar: { color: C.peligro, fontWeight: '600' },
  metodos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metodo: { flexGrow: 1, minHeight: 52, paddingHorizontal: 14, borderRadius: radio, borderWidth: 1, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center' },
  metodoActivo: { backgroundColor: C.primario, borderColor: C.primario },
  metodoTexto: { fontSize: 16, fontWeight: '700', color: C.texto },
  fila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  etiqueta: { fontSize: 16, color: C.suave },
  recibido: { fontSize: 28, fontWeight: '800', color: C.texto },
  billetes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  billete: { minHeight: 48, paddingHorizontal: 16, borderRadius: radio, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' },
  mixto: { gap: 8, padding: 12, borderRadius: radio, borderWidth: 1, borderColor: C.borde, backgroundColor: '#F9FAFB' },
  mixtoTitulo: { fontSize: 15, fontWeight: '700', color: C.texto },
  billeteTexto: { fontSize: 16, fontWeight: '700', color: '#166534' },
  aviso: { color: '#92400E', backgroundColor: '#FFFBEB', borderRadius: radio, padding: 10 },
  confirmar: { gap: 8, padding: 12, borderRadius: radio, borderWidth: 1, borderColor: '#FCD34D', backgroundColor: '#FFFBEB' },
  avisoTexto: { color: '#92400E', fontSize: 14, lineHeight: 20 },
});
