// «¿Cómo funciona el crédito?» de la ficha del cliente (la misma explicación que la web)
import { StyleSheet, Text, View } from 'react-native';

import { C } from '@/constants/colores';

const PASOS: { titulo: string; puntos: string[] }[] = [
  {
    titulo: '1. Darle crédito',
    puntos: [
      'Edita el cliente y ponle un límite de crédito (ej. $50) y los días para pagar (ej. 15).',
      'Con límite $0 no se le puede vender al crédito: solo de contado.',
      'Solo asigna crédito quien tiene permiso de cuentas por cobrar (el administrador).',
    ],
  },
  {
    titulo: '2. Venderle al crédito',
    puntos: [
      'Al cobrar la venta o la mesa, elige al cliente y la forma de pago Crédito.',
      'Esa venta no entra a la caja: queda como cuenta por cobrar, con vencimiento según sus días de crédito.',
      'Su saldo sube y el sistema no deja pasar su límite: avisa cuánto crédito le queda.',
    ],
  },
  {
    titulo: '3. Recibir el abono',
    puntos: [
      'Cuando viene a pagar, toca «Recibir abono». Solo se habilita si debe algo.',
      'Escribe cuánto paga (todo o una parte) y con qué: efectivo, tarjeta, transferencia.',
      'El dinero entra a la caja del turno abierto y se aplica primero a las cuentas más viejas.',
      'Si te equivocas, el abono se anula: el dinero sale de la caja y la deuda vuelve.',
    ],
  },
];

const NOTAS = [
  'Debe: lo que tiene pendiente. Vencido: lo que pasó de su fecha de pago.',
  'Crédito disponible: el límite menos lo que debe.',
];

export function AyudaCredito() {
  return (
    <View style={e.caja}>
      <Text style={e.texto}>
        «Recibir abono» es para cobrarle a un cliente <Text style={{ fontWeight: '700' }}>lo que te debe por ventas al crédito</Text> (fiado). Si nunca le vendiste al crédito, debe $0.00 y el botón no se activa.
      </Text>
      {PASOS.map((p) => (
        <View key={p.titulo} style={e.tarjeta}>
          <Text style={[e.texto, { fontWeight: '700', color: C.texto }]}>{p.titulo}</Text>
          {p.puntos.map((x) => <Text key={x} style={[e.texto, { color: C.texto }]}>• {x}</Text>)}
        </View>
      ))}
      {NOTAS.map((x) => <Text key={x} style={e.texto}>• {x}</Text>)}
      <Text style={e.texto}>
        <Text style={{ fontWeight: '700' }}>Si solo le vendes de contado</Text>, déjalo con límite $0: sirve igual para su nombre en el ticket y su historial de compras.
      </Text>
    </View>
  );
}

const e = StyleSheet.create({
  caja: { gap: 8, backgroundColor: '#EFF6FF', borderRadius: 10, padding: 12 },
  texto: { fontSize: 13, lineHeight: 19, color: '#1E3A8A' },
  tarjeta: { gap: 3, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#DBEAFE', padding: 10 },
});
