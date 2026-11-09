import { Href, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BotonBloquear, VentanaMiPin } from '@/components/bloqueo';
import { Boton, Ventana } from '@/components/ui';
import { C, radio } from '@/constants/colores';
import { getResumenNotificaciones } from '@/lib/operaciones';
import { getTurnoActual } from '@/lib/servicios';
import { confirmar } from '@/lib/aviso';
import { useConexion } from '@/lib/conexion';
import { useSesion } from '@/lib/sesion';

interface Modulo { titulo: string; detalle: string; ruta: Href; color: string; permisos: string[]; sinTurno?: boolean }

// Cada módulo aparece solo si el usuario tiene alguno de sus permisos
const MODULOS: Modulo[] = [
  { titulo: 'Mesas', detalle: 'Tomar órdenes, enviar comandas y cobrar', ruta: '/mesas', color: C.ocupada, permisos: ['pos.vender'] },
  { titulo: 'Venta rápida', detalle: 'Mostrador: cobrar sin mesa', ruta: '/venta', color: C.primario, permisos: ['pos.vender'] },
  { titulo: 'Caja y turno', detalle: 'Ingresos, egresos, cierre y cambio de turno', ruta: '/turno', color: C.exito, permisos: ['caja.abrir', 'caja.cerrar', 'caja.movimientos'], sinTurno: true },
  { titulo: 'Ventas', detalle: 'Historial, reimprimir y anular', ruta: '/ventas', color: '#7C3AED', permisos: ['pos.historial', 'pos.vender'] },
  { titulo: 'Clientes', detalle: 'Crédito, lo que deben y abonos', ruta: '/clientes' as Href, color: '#1D4ED8', permisos: ['clientes.ver', 'clientes.gestionar', 'cuentas_cobrar.gestionar'] },
  { titulo: 'Pedidos especiales', detalle: 'Encargos con fecha de entrega y anticipo', ruta: '/pedidos' as Href, color: '#7C3AED', permisos: ['pedidos.gestionar'] },
  { titulo: 'Compras', detalle: 'Compras, proveedores y pagos', ruta: '/compras', color: C.marca, permisos: ['compras.gestionar', 'compras.ver', 'proveedores.gestionar', 'cuentas_pagar.gestionar'] },
  { titulo: 'Gastos', detalle: 'Luz, gas, planilla y otros', ruta: '/gastos', color: C.aviso, permisos: ['gastos.registrar', 'gastos.ver', 'gastos.categorias'] },
  { titulo: 'Inventario', detalle: 'Existencias, entradas, conteo físico y kárdex', ruta: '/inventario', color: C.libre, permisos: ['inventario.ver'], sinTurno: true },
  { titulo: 'Producción', detalle: 'Lo horneado, las mermas y el resumen', ruta: '/produccion', color: '#B45309', permisos: ['produccion.registrar', 'produccion.ver', 'mermas.registrar'] },
  { titulo: 'Catálogo', detalle: 'Productos, recetas, extras y categorías', ruta: '/catalogo' as Href, color: '#4338CA', permisos: ['productos.gestionar', 'productos.ver', 'recetas.gestionar', 'mesas.configurar', 'catalogos.gestionar'], sinTurno: true },
  { titulo: 'Ajustes', detalle: 'Mesas y cocina, negocio, impresoras, usuarios y permisos', ruta: '/ajustes' as Href, color: '#4B5563', permisos: ['mesas.configurar', 'configuracion.gestionar', 'impresoras.gestionar', 'usuarios.gestionar', 'roles.gestionar'], sinTurno: true },
  { titulo: 'Resumen del día', detalle: 'Ventas, lo más vendido y alertas', ruta: '/resumen', color: '#0F766E', permisos: ['dashboard.ver', 'reportes.ver'], sinTurno: true },
];

export default function Inicio() {
  const { usuario, cajaId, puede, salir, refrescarUsuario } = useSesion();
  const { cola } = useConexion();
  const { width } = useWindowDimensions();
  // null = todavía no se sabe; sin turno abierto solo se consulta (caja, inventario, resumen).
  // ajeno: alguien se fue sin cerrar su turno; solo se puede cerrar para abrir el propio
  const [turno, setTurno] = useState<{ caja: string; de: string | null; mio: boolean; ajeno: boolean } | null>(null);
  const [saliendo, setSaliendo] = useState(false);
  const [miPin, setMiPin] = useState(false);

  useFocusEffect(useCallback(() => {
    if (!cajaId) return;
    getTurnoActual(cajaId)
      .then((r) => setTurno({
        caja: r.caja.nombre,
        de: r.turno?.usuario_apertura ?? null,
        mio: !!r.turno && r.turno.usuario_apertura_id === usuario?.id,
        ajeno: !!r.turno_ajeno,
      }))
      .catch(() => setTurno(null));
  }, [cajaId, usuario?.id]));

  // Notificaciones sin ver y permisos (el admin pudo cambiarlos): al volver a esta pantalla y cada minuto
  const [avisos, setAvisos] = useState(0);
  const cargarAvisos = useCallback(() => {
    getResumenNotificaciones().then((r) => setAvisos(r.no_leidas)).catch(() => null);
    refrescarUsuario();
  }, [refrescarUsuario]);
  useFocusEffect(cargarAvisos);
  useEffect(() => {
    const t = setInterval(cargarAvisos, 60 * 1000);
    return () => clearInterval(t);
  }, [cargarAvisos]);

  const sinTurno = turno !== null && turno.de === null;
  const turnoAjeno = !!turno?.ajeno;

  const visibles = MODULOS.filter((m) => m.permisos.some(puede));
  const columnas = width >= 1000 ? 3 : 2;
  const ancho = (Math.min(width, 1100) - 40 - 14 * (columnas - 1)) / columnas;

  const salirYa = async () => {
    setSaliendo(false);
    if (cola.length && !(await confirmar('Ventas sin enviar', `Hay ${cola.length} venta(s) hechas sin conexión que aún no llegan al servidor. Siguen guardadas en esta tablet y se envían cuando alguien vuelva a entrar con conexión.`, 'Salir igual'))) return;
    await salir();
    router.replace('/login');
  };

  return (
    <SafeAreaView style={e.pantalla}>
      <ScrollView contentContainerStyle={e.contenido}>
        <View style={e.cabecera}>
          <View style={{ flex: 1 }}>
            <Text style={e.marca}>Panadería Eduardo</Text>
            <Text style={e.hola}>Hola, {usuario?.nombre}</Text>
            {turno ? <Text style={e.suave}>{turno.caja} · {turno.de ? `turno de ${turno.de}` : 'sin turno abierto'}</Text> : null}
          </View>
          <Pressable onPress={() => router.push('/notificaciones')} accessibilityRole="button"
            accessibilityLabel={`Notificaciones sin ver: ${avisos}`}
            style={({ pressed }) => [e.campana, pressed && { opacity: 0.8 }]}>
            <Text style={e.campanaTexto}>Avisos</Text>
            {avisos > 0 && (
              <View style={e.globo}><Text style={e.globoTexto}>{avisos > 99 ? '99+' : avisos}</Text></View>
            )}
          </Pressable>
          {puede('manuales.ver') && <Boton titulo="Manuales" variante="contorno" chico onPress={() => router.push('/manuales' as Href)} />}
          <Boton titulo="Caja" variante="contorno" chico onPress={() => router.push('/caja')} />
          <Boton titulo={usuario?.tiene_pin ? 'Mi PIN' : 'Crear PIN'} variante="contorno" chico onPress={() => setMiPin(true)} />
          <BotonBloquear />
          <Boton titulo="Salir" variante="neutro" chico onPress={() => setSaliendo(true)} />
        </View>

        {sinTurno && (
          <View style={e.aviso}>
            <View style={{ flex: 1 }}>
              <Text style={e.avisoTitulo}>Abre tu turno para empezar</Text>
              <Text style={e.avisoTexto}>Todo lo que se venda, cobre o registre queda a nombre de quien abre el turno.</Text>
            </View>
            {puede('caja.abrir') && <Boton titulo="Abrir turno" variante="exito" onPress={() => router.push('/caja')} />}
          </View>
        )}

        {turnoAjeno && (
          <View style={[e.aviso, e.avisoAjeno]}>
            <View style={{ flex: 1 }}>
              <Text style={[e.avisoTitulo, { color: '#991B1B' }]}>La caja tiene abierto el turno de {turno?.de}</Text>
              <Text style={[e.avisoTexto, { color: '#7F1D1D' }]}>
                Se fue sin cerrarlo. Para vender, primero ciérralo contando el efectivo y luego abre tu turno.
              </Text>
            </View>
            {puede('caja.cerrar') && <Boton titulo="Cerrar ese turno" variante="peligro" onPress={() => router.push('/turno')} />}
          </View>
        )}

        <View style={e.rejilla}>
          {visibles.map((m) => {
            const bloqueado = (sinTurno || turnoAjeno) && !m.sinTurno;
            return (
            <Pressable key={m.titulo} onPress={() => router.push(m.ruta)} disabled={bloqueado}
              style={({ pressed }) => [e.modulo, { width: ancho, borderTopColor: m.color, opacity: bloqueado ? 0.4 : pressed ? 0.85 : 1 }]}>
              <Text style={[e.moduloTitulo, { color: m.color }]}>{m.titulo}</Text>
              <Text style={e.suave}>{bloqueado ? (turnoAjeno ? 'Necesita tu propio turno' : 'Necesita un turno abierto') : m.detalle}</Text>
            </Pressable>
            );
          })}
        </View>

        <Text style={e.pie}>Para reportes con Excel o PDF y la auditoría, abre el sistema en el navegador de la tablet.</Text>
      </ScrollView>

      {/* Salir: si su turno sigue abierto se le recuerda cerrarlo, para no dejárselo al siguiente */}
      <Ventana visible={saliendo} onCerrar={() => setSaliendo(false)} ancho={520}
        titulo={turno?.mio ? 'Tu turno sigue abierto' : 'Cerrar sesión'}
        subtitulo={turno?.mio ? undefined : `¿Salir como ${usuario?.nombre}?`}
        pie={turno?.mio ? (
          <View style={{ flex: 1, gap: 10 }}>
            <Boton titulo="Cerrar mi turno" onPress={() => { setSaliendo(false); router.push('/turno'); }} />
            <Boton titulo="Salir sin cerrar" variante="contorno" onPress={salirYa} />
          </View>
        ) : (
          <Boton estilo={{ flex: 1 }} titulo="Salir" onPress={salirYa} />
        )}>
        {turno?.mio && (
          <Text style={e.avisoTexto}>
            Si sales sin cerrarlo, quien entre después tendrá que cerrarlo y contar tu efectivo antes de poder vender.
            Sal sin cerrar solo si vas a volver a entrar enseguida.
          </Text>
        )}
      </Ventana>
      <VentanaMiPin visible={miPin} onCerrar={() => setMiPin(false)} />
    </SafeAreaView>
  );
}

const e = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: C.fondo },
  contenido: { padding: 20, gap: 18, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  marca: { fontSize: 14, fontWeight: '700', color: C.marca },
  hola: { fontSize: 26, fontWeight: '800', color: C.texto },
  suave: { fontSize: 14, color: C.suave },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  modulo: { minHeight: 120, backgroundColor: '#fff', borderRadius: radio, borderTopWidth: 6, borderWidth: 1, borderColor: C.borde, padding: 18, gap: 6, justifyContent: 'center' },
  moduloTitulo: { fontSize: 21, fontWeight: '800' },
  aviso: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: radio, backgroundColor: C.marcaClaro, borderWidth: 1, borderColor: '#FCD34D' },
  avisoAjeno: { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' },
  avisoTitulo: { fontSize: 17, fontWeight: '800', color: C.marca },
  avisoTexto: { fontSize: 14, color: '#78350F' },
  campana: { height: 44, paddingHorizontal: 16, justifyContent: 'center', borderRadius: radio, backgroundColor: '#fff', borderWidth: 1, borderColor: '#D1D5DB' },
  campanaTexto: { fontSize: 15, fontWeight: '700', color: C.texto },
  globo: { position: 'absolute', top: -8, right: -8, minWidth: 24, height: 24, paddingHorizontal: 6, borderRadius: 12, backgroundColor: C.peligro, alignItems: 'center', justifyContent: 'center' },
  globoTexto: { color: '#fff', fontSize: 12, fontWeight: '800' },
  pie: { fontSize: 13, color: C.tenue, textAlign: 'center' },
});
