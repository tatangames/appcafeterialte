import { Href, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Encabezado } from '@/components/encabezado';
import { FiltroFechas, rangoDe, textoRango, VerMas } from '@/components/filtroFechas';
import { VentanaMotivo } from '@/components/motivo';
import { Boton, Etiqueta } from '@/components/ui';
import { C, radio } from '@/constants/colores';
import { dinero, fecha } from '@/lib/formato';
import * as op from '@/lib/operaciones';
import { useListaPaginada } from '@/lib/paginado';
import { useSesion } from '@/lib/sesion';

const DOCUMENTOS: Record<string, string> = { factura: 'Factura', ccf: 'Crédito fiscal', ticket: 'Ticket', otro: 'Otro' };

// Compras del periodo elegido (por defecto los últimos 30 días) y acceso a registrar una nueva
export default function Compras() {
  const { puede } = useSesion();
  const [rango, setRango] = useState(() => rangoDe('30'));
  const [anulando, setAnulando] = useState<op.CompraLista | null>(null);

  const pedir = useCallback((page: number) => op.getCompras({ desde: rango.desde, hasta: rango.hasta, page, per_page: 50 }), [rango]);
  const { respuesta: datos, items, error, cargar, verMas, hayMas, cargandoMas } = useListaPaginada(pedir, (r) => r.compras);
  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));
  const verProveedores = puede('proveedores.gestionar') || puede('cuentas_pagar.gestionar');

  return (
    <SafeAreaView style={e.pantalla} edges={['top', 'left', 'right']}>
      <Encabezado titulo="Compras" subtitulo={datos ? `${textoRango(rango)} · ${datos.total} compra(s) · ${dinero(datos.totales.total)}` : undefined}
        derecha={
          <>
            {verProveedores && <Boton titulo="Proveedores y pagos" chico variante="contorno" onPress={() => router.push('/proveedores' as Href)} />}
            {puede('compras.gestionar') && <Boton titulo="+ Nueva compra" chico onPress={() => router.push('/compras/nueva')} />}
          </>
        } />
      <FiltroFechas valor={rango} onCambio={setRango} />
      {error ? <Text style={e.error}>{error}</Text> : null}
      <FlatList
        data={items}
        ListFooterComponent={<VerMas hayMas={hayMas} cargando={cargandoMas} onPress={verMas} />}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={e.lista}
        ListEmptyComponent={<Text style={e.vacio}>{datos ? 'No hay compras en este periodo' : 'Cargando...'}</Text>}
        renderItem={({ item: c }) => (
          <Pressable style={({ pressed }) => [e.compra, pressed && { opacity: 0.8 }]} disabled={c.estado === 'anulada' || !puede('compras.gestionar')}
            onPress={() => setAnulando(c)}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={e.titulo}>{c.proveedor} · {c.numero}</Text>
              <Text style={e.suave}>{fecha(c.fecha)} · {DOCUMENTOS[c.tipo_documento] ?? c.tipo_documento}{c.numero_documento ? ` ${c.numero_documento}` : ''} · {c.usuario}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={[e.total, c.estado === 'anulada' && { textDecorationLine: 'line-through', color: C.tenue }]}>{dinero(c.total)}</Text>
              {c.estado === 'anulada'
                ? <Etiqueta texto="Anulada" fondo="#FEE2E2" color="#B91C1C" />
                : c.condicion === 'credito' && c.saldo > 0
                  ? <Etiqueta texto={`Debe ${dinero(c.saldo)}`} fondo="#FEF3C7" color="#92400E" />
                  : <Etiqueta texto={c.condicion === 'credito' ? 'Pagada' : 'Contado'} fondo="#DCFCE7" color="#166534" />}
            </View>
          </Pressable>
        )}
      />
      {puede('compras.gestionar') && (datos?.compras.length ?? 0) > 0 && <Text style={e.pie}>Toca una compra para anularla.</Text>}

      <VentanaMotivo visible={!!anulando} titulo={`Anular compra ${anulando?.numero ?? ''}`}
        subtitulo={anulando ? `${anulando.proveedor} · ${dinero(anulando.total)}` : undefined}
        aviso="Lo que entró sale del inventario. Si fue de contado desde la caja, el dinero vuelve a la gaveta. Si es al crédito y ya tiene pagos, primero anula los pagos en Proveedores y pagos."
        onCerrar={() => setAnulando(null)} onConfirmar={(m) => (anulando ? op.anularCompra(anulando.id, m) : Promise.reject(new Error('Elige qué anular')))}
        onListo={() => { setAnulando(null); cargar(); }} />
    </SafeAreaView>
  );
}

const e = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: C.fondo },
  error: { color: C.peligro, padding: 16 },
  lista: { padding: 12, gap: 8, maxWidth: 900, width: '100%', alignSelf: 'center' },
  vacio: { textAlign: 'center', color: C.suave, padding: 24 },
  compra: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: '#fff', borderRadius: radio, borderWidth: 1, borderColor: C.borde, padding: 14 },
  titulo: { fontSize: 16, fontWeight: '700', color: C.texto },
  suave: { fontSize: 13, color: C.suave },
  total: { fontSize: 18, fontWeight: '800', color: C.texto },
  pie: { textAlign: 'center', color: C.tenue, fontSize: 13, paddingBottom: 12 },
});
