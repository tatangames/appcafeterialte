// «¿Para qué sirven?» de la pantalla de clientes (la misma explicación que la web)
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { C } from '@/constants/colores';

const USOS: { titulo: string; texto: string; ejemplos: string[] }[] = [
  {
    titulo: '1. Vender fiado (a crédito)',
    texto: 'Al revés que con los proveedores: aquí el cliente te debe a ti. Con límite y días de crédito se cobra con la forma de pago Crédito, el ticket sale para la firma, la deuda queda en Cuentas por cobrar y el sistema no le deja pasar su límite.',
    ejemplos: ['Un restaurante que se lleva 200 panes diarios y paga cada viernes', 'Una oficina o escuela que pide pan y café para reuniones y paga a fin de mes', 'Un vecino de confianza que paga cada quincena'],
  },
  {
    titulo: '2. Pedidos especiales (encargos)',
    texto: 'En Pedidos especiales queda su teléfono para avisarle o confirmar, el anticipo y la fecha de entrega. En su ficha se ven todos los encargos que ha hecho.',
    ejemplos: ['Pastel de cumpleaños para el sábado con $10 de anticipo', '500 panes para una boda o un velorio'],
  },
  {
    titulo: '3. Ticket a su nombre',
    texto: 'Si una empresa pide el comprobante a su nombre, se elige al cobrar y en «Datos del receptor» sale su nombre en lugar de «Consumidor Final».',
    ejemplos: ['Refrigerio de una empresa que justifica el gasto'],
  },
  {
    titulo: '4. Saber quién compra y cuánto',
    texto: 'Su ficha muestra todas sus compras, abonos y encargos, y se puede sacar su estado de cuenta en PDF para cobrarle.',
    ejemplos: ['Cuánto compró este mes el restaurante', 'A quién darle crédito o un descuento por ser cliente fiel'],
  },
];

export function AyudaClientes() {
  return (
    <ScrollView style={e.contenedor} contentContainerStyle={e.caja}>
      <Text style={e.texto}>
        Los clientes son <Text style={{ fontWeight: '700' }}>opcionales</Text>. Al que entra, compra 5 panes y se va, se le vende normal en Venta rápida sin elegir a nadie (el ticket sale como «Consumidor Final»). Registra solo a quien te sirve tenerlo guardado:
      </Text>
      {USOS.map((u) => (
        <View key={u.titulo} style={e.tarjeta}>
          <Text style={[e.texto, { fontWeight: '700', color: C.texto }]}>{u.titulo}</Text>
          <Text style={e.texto}>{u.texto}</Text>
          {u.ejemplos.map((x) => <Text key={x} style={[e.texto, { color: C.suave }]}>• {x}</Text>)}
        </View>
      ))}
      <Text style={e.texto}>
        <Text style={{ fontWeight: '700' }}>En resumen:</Text> registra a quien compra fiado, a quien hace encargos y a quien pide el ticket a su nombre. A los demás no hace falta.
      </Text>
    </ScrollView>
  );
}

const e = StyleSheet.create({
  // Mismo ancho que la barra de búsqueda de la pantalla
  contenedor: { maxHeight: 420, width: '100%', maxWidth: 900, alignSelf: 'center', paddingHorizontal: 12, marginTop: 10, flexGrow: 0 },
  caja: { gap: 8, backgroundColor: '#EFF6FF', borderRadius: 10, padding: 12 },
  texto: { fontSize: 13, lineHeight: 19, color: '#1E3A8A' },
  tarjeta: { gap: 3, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#DBEAFE', padding: 10 },
});
