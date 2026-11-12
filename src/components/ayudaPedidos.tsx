// «¿Cómo funciona?» de los pedidos especiales (encargos)
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { C } from '@/constants/colores';

const PASOS: { titulo: string; puntos: string[] }[] = [
  {
    titulo: '1. Tomar el pedido',
    puntos: [
      'Toca «+ Nuevo pedido»: a nombre de quién (o elige un cliente registrado), su teléfono, el día y la hora de entrega y lo que encargó.',
      'Si deja un anticipo, escríbelo con su forma de pago: entra a la caja del turno abierto en ese momento.',
      'En observaciones va lo que necesita el pastelero: «Feliz cumpleaños Ana», sabor, colores.',
    ],
  },
  {
    titulo: '2. Mientras se prepara',
    puntos: [
      'Queda en «Pendientes» con su fecha de entrega. Los de hoy se marcan en amarillo y los atrasados en rojo.',
      'Si el cliente da otro abono antes de recoger, ábrelo y toca «Agregar anticipo».',
    ],
  },
  {
    titulo: '3. Entregar y cobrar',
    puntos: [
      'Cuando lo recoge, ábrelo y toca «Entregar y cobrar»: pasa a la venta con sus productos y solo se cobra lo que falta (total menos anticipos).',
      'Al cobrar se descuenta el inventario y el pedido pasa a «Entregados».',
    ],
  },
  {
    titulo: 'Si lo cancela',
    puntos: [
      'Toca «Cancelar pedido» y escribe el motivo. Si dejó anticipo, eliges si se le devuelve: el dinero sale de la caja del turno abierto.',
    ],
  },
];

export function AyudaPedidos() {
  return (
    <ScrollView style={e.contenedor} contentContainerStyle={e.caja}>
      <Text style={e.texto}>
        Un pedido especial es un <Text style={{ fontWeight: '700' }}>encargo para otro día</Text>: un pastel de cumpleaños, 200 panes para una reunión. Guarda quién lo pidió, cuándo se entrega y cuánto dejó de anticipo.
      </Text>
      {PASOS.map((p) => (
        <View key={p.titulo} style={e.tarjeta}>
          <Text style={[e.texto, { fontWeight: '700', color: C.texto }]}>{p.titulo}</Text>
          {p.puntos.map((x) => <Text key={x} style={[e.texto, { color: C.texto }]}>• {x}</Text>)}
        </View>
      ))}
      <Text style={e.texto}>
        <Text style={{ fontWeight: '700' }}>Lo que se vende y se lleva al momento</Text> no es pedido especial: va por Venta rápida o, si se espera a que salga de cocina, con «Enviar comanda».
      </Text>
    </ScrollView>
  );
}

const e = StyleSheet.create({
  contenedor: { maxHeight: 440, width: '100%', maxWidth: 900, alignSelf: 'center', paddingHorizontal: 12, marginTop: 10, flexGrow: 0 },
  caja: { gap: 8, backgroundColor: '#EFF6FF', borderRadius: 10, padding: 12 },
  texto: { fontSize: 13, lineHeight: 19, color: '#1E3A8A' },
  tarjeta: { gap: 3, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#DBEAFE', padding: 10 },
});
