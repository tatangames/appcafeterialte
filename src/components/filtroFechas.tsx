// Filtro de fechas de las listas (compras, gastos, ventas, cierres, kárdex): atajos
// (Hoy, 7 días, Este mes…) y «Elegir fechas» con un calendario para un rango libre.
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Boton, Ventana } from '@/components/ui';
import { C, radio } from '@/constants/colores';
import { fecha, hoy } from '@/lib/formato';

export type Rango = { clave: string; desde: string; hasta: string };

const aTexto = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const inicioMes = (desplazarMeses = 0) => {
  const d = new Date();
  return aTexto(new Date(d.getFullYear(), d.getMonth() + desplazarMeses, 1));
};
const finMes = (desplazarMeses = 0) => {
  const d = new Date();
  return aTexto(new Date(d.getFullYear(), d.getMonth() + desplazarMeses + 1, 0));
};

export const ATAJOS: { clave: string; texto: string; rango: () => [string, string] }[] = [
  { clave: 'hoy', texto: 'Hoy', rango: () => [hoy(), hoy()] },
  { clave: 'ayer', texto: 'Ayer', rango: () => [hoy(-1), hoy(-1)] },
  { clave: '7', texto: '7 días', rango: () => [hoy(-6), hoy()] },
  { clave: 'mes', texto: 'Este mes', rango: () => [inicioMes(), hoy()] },
  { clave: 'mes_pasado', texto: 'Mes pasado', rango: () => [inicioMes(-1), finMes(-1)] },
  { clave: '30', texto: '30 días', rango: () => [hoy(-29), hoy()] },
  { clave: '90', texto: '90 días', rango: () => [hoy(-89), hoy()] },
];

export const rangoDe = (clave: string): Rango => {
  const a = ATAJOS.find((x) => x.clave === clave) ?? ATAJOS[0];
  const [desde, hasta] = a.rango();
  return { clave: a.clave, desde, hasta };
};

/** «Este mes», o «01/10/2026 al 15/10/2026» para un rango elegido a mano */
export const textoRango = (r: Rango) => {
  const atajo = ATAJOS.find((x) => x.clave === r.clave);
  if (atajo) return atajo.texto;
  return r.desde === r.hasta ? fecha(r.desde) : `${fecha(r.desde)} al ${fecha(r.hasta)}`;
};

export function FiltroFechas({ valor, onCambio }: { valor: Rango; onCambio: (r: Rango) => void }) {
  const [eligiendo, setEligiendo] = useState(false);
  const propio = valor.clave === 'otro';
  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={e.fila}>
        {ATAJOS.map((a) => (
          <Pressable key={a.clave} onPress={() => onCambio(rangoDe(a.clave))} style={[e.chip, valor.clave === a.clave && e.chipActivo]}>
            <Text style={[e.chipTexto, valor.clave === a.clave && { color: '#fff' }]}>{a.texto}</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => setEligiendo(true)} style={[e.chip, propio && e.chipActivo]}>
          <Text style={[e.chipTexto, propio && { color: '#fff' }]}>📅 {propio ? textoRango(valor) : 'Elegir fechas'}</Text>
        </Pressable>
      </ScrollView>
      {eligiendo && (
        <Calendario inicial={valor} onCerrar={() => setEligiendo(false)}
          onAplicar={(desde, hasta) => { setEligiendo(false); onCambio({ clave: 'otro', desde, hasta }); }} />
      )}
    </>
  );
}

/** Una sola fecha (hoy o un día pasado): «Hoy», «Ayer» o «📅 Otro día» con el calendario */
export function SelectorFecha({ valor, onCambio }: { valor: string; onCambio: (f: string) => void }) {
  const [eligiendo, setEligiendo] = useState(false);
  const otro = valor !== hoy() && valor !== hoy(-1);
  return (
    <>
      <View style={[e.fila, { paddingHorizontal: 0 }]}>
        {([['Hoy', hoy()], ['Ayer', hoy(-1)]] as const).map(([t, f]) => (
          <Pressable key={t} onPress={() => onCambio(f)} style={[e.chip, valor === f && e.chipActivo]}>
            <Text style={[e.chipTexto, valor === f && { color: '#fff' }]}>{t}</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => setEligiendo(true)} style={[e.chip, otro && e.chipActivo]}>
          <Text style={[e.chipTexto, otro && { color: '#fff' }]}>📅 {otro ? fecha(valor) : 'Otro día'}</Text>
        </Pressable>
      </View>
      {eligiendo && (
        <Calendario inicial={{ clave: 'otro', desde: valor, hasta: valor }} unDia onCerrar={() => setEligiendo(false)}
          onAplicar={(d) => { setEligiendo(false); onCambio(d); }} />
      )}
    </>
  );
}

/** Fecha de entrega (hoy o un día futuro): «Hoy», «Mañana», «Pasado mañana» o «📅 Otro día» con el calendario */
export function SelectorFechaFutura({ valor, onCambio }: { valor: string; onCambio: (f: string) => void }) {
  const [eligiendo, setEligiendo] = useState(false);
  const rapidas = [['Hoy', hoy()], ['Mañana', hoy(1)], ['Pasado mañana', hoy(2)]] as const;
  const otro = !rapidas.some(([, f]) => f === valor);
  return (
    <>
      <View style={e.envuelta}>
        {rapidas.map(([t, f]) => (
          <Pressable key={t} onPress={() => onCambio(f)} style={[e.chip, valor === f && e.chipActivo]}>
            <Text style={[e.chipTexto, valor === f && { color: '#fff' }]}>{t}</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => setEligiendo(true)} style={[e.chip, otro && e.chipActivo]}>
          <Text style={[e.chipTexto, otro && { color: '#fff' }]}>📅 {otro ? fecha(valor) : 'Otro día'}</Text>
        </Pressable>
      </View>
      {eligiendo && (
        <Calendario inicial={{ clave: 'otro', desde: valor, hasta: valor }} unDia futuro onCerrar={() => setEligiendo(false)}
          onAplicar={(d) => { setEligiendo(false); onCambio(d); }} />
      )}
    </>
  );
}

const HORAS = Array.from({ length: 16 }, (_, i) => i + 6); // 6 a. m. a 9 p. m.
const MINUTOS = ['00', '15', '30', '45'];
/** «3:30 p. m.» a partir de «15:30» */
export const hora12 = (h: string) => {
  const [hh, mm] = h.split(':').map(Number);
  return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'a. m.' : 'p. m.'}`;
};

/** Hora (HH:MM, 24 h): se toca la hora y luego los minutos */
export function SelectorHora({ valor, onCambio }: { valor: string; onCambio: (h: string) => void }) {
  const [hh, mm] = valor.split(':');
  const hora = Number(hh);
  return (
    <View style={{ gap: 8 }}>
      <View style={e.envuelta}>
        {HORAS.map((h) => (
          <Pressable key={h} onPress={() => onCambio(`${String(h).padStart(2, '0')}:${mm ?? '00'}`)} style={[e.chipHora, hora === h && e.chipActivo]}>
            <Text style={[e.chipTexto, hora === h && { color: '#fff' }]}>{h % 12 || 12} {h < 12 ? 'am' : 'pm'}</Text>
          </Pressable>
        ))}
      </View>
      <View style={[e.envuelta, { alignItems: 'center' }]}>
        {MINUTOS.map((m) => (
          <Pressable key={m} onPress={() => onCambio(`${hh}:${m}`)} style={[e.chipHora, mm === m && e.chipActivo]}>
            <Text style={[e.chipTexto, mm === m && { color: '#fff' }]}>:{m}</Text>
          </Pressable>
        ))}
        <Text style={[e.chipTexto, { marginLeft: 8 }]}>Entrega a las {hora12(valor)}</Text>
      </View>
    </View>
  );
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

// Primer toque: desde; segundo: hasta (si es anterior, se invierten). Las fechas futuras no se eligen
// (con «futuro», al revés: solo hoy en adelante, para fechas de entrega).
function Calendario({ inicial, onCerrar, onAplicar, unDia, futuro: haciaAdelante }: { inicial: Rango; onCerrar: () => void; onAplicar: (desde: string, hasta: string) => void; unDia?: boolean; futuro?: boolean }) {
  const [desde, setDesde] = useState<string | null>(inicial.desde);
  const [hasta, setHasta] = useState<string | null>(inicial.hasta);
  const [mes, setMes] = useState(() => {
    const [a, m] = inicial.hasta.split('-').map(Number);
    return new Date(a, m - 1, 1);
  });
  const limite = hoy();

  const tocar = (dia: string) => {
    if (unDia) { setDesde(dia); setHasta(dia); return; }
    if (!desde || hasta) { setDesde(dia); setHasta(null); return; }
    if (dia < desde) { setHasta(desde); setDesde(dia); } else setHasta(dia);
  };

  const primero = new Date(mes.getFullYear(), mes.getMonth(), 1);
  const huecos = (primero.getDay() + 6) % 7; // la semana empieza en lunes
  const diasMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  const celdas: (string | null)[] = [
    ...Array<null>(huecos).fill(null),
    ...Array.from({ length: diasMes }, (_, i) => aTexto(new Date(mes.getFullYear(), mes.getMonth(), i + 1))),
  ];
  const fin = hasta ?? desde;
  const siguienteBloqueado = !haciaAdelante && aTexto(new Date(mes.getFullYear(), mes.getMonth() + 1, 1)) > limite;
  const anteriorBloqueado = !!haciaAdelante && aTexto(new Date(mes.getFullYear(), mes.getMonth(), 0)) < limite;

  return (
    <Ventana visible titulo={unDia ? 'Elegir fecha' : 'Elegir fechas'}
      subtitulo={unDia ? (desde ? fecha(desde) : 'Toca el día') : desde ? (hasta ? `${fecha(desde)} al ${fecha(hasta)}` : `Desde ${fecha(desde)}: toca el último día`) : 'Toca el primer día'}
      onCerrar={onCerrar} ancho={460}
      pie={<Boton estilo={{ flex: 1 }} titulo="Aplicar" deshabilitado={!desde} onPress={() => desde && onAplicar(desde, hasta ?? desde)} />}>
      <View style={e.cabeceraMes}>
        <Pressable onPress={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))} style={[e.flecha, anteriorBloqueado && { opacity: 0.3 }]}
          disabled={anteriorBloqueado} hitSlop={8}>
          <Text style={e.flechaTexto}>‹</Text>
        </Pressable>
        <Text style={e.mes}>{MESES[mes.getMonth()]} {mes.getFullYear()}</Text>
        <Pressable onPress={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))} style={[e.flecha, siguienteBloqueado && { opacity: 0.3 }]}
          disabled={siguienteBloqueado} hitSlop={8}>
          <Text style={e.flechaTexto}>›</Text>
        </Pressable>
      </View>
      <View style={e.semana}>
        {DIAS.map((d) => <Text key={d} style={e.diaSemana}>{d}</Text>)}
      </View>
      <View style={e.grilla}>
        {celdas.map((dia, i) => {
          if (!dia) return <View key={`h${i}`} style={e.celda} />;
          const futuro = haciaAdelante ? dia < limite : dia > limite; // el día que no se puede elegir
          const extremo = dia === desde || dia === fin;
          const dentro = !!desde && !!fin && dia > desde && dia < fin;
          return (
            <Pressable key={dia} onPress={() => tocar(dia)} disabled={futuro} style={e.celda}>
              <View style={[e.dia, dentro && e.diaDentro, extremo && e.diaExtremo]}>
                <Text style={[e.diaTexto, futuro && { color: C.tenue }, extremo && { color: '#fff' }]}>{Number(dia.slice(8))}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={e.fila}>
        <Pressable onPress={() => { setDesde(limite); setHasta(limite); setMes(new Date()); }} style={e.chip}>
          <Text style={e.chipTexto}>Hoy</Text>
        </Pressable>
      </View>
    </Ventana>
  );
}

/** Botón «Ver más» al pie de una lista paginada */
export function VerMas({ hayMas, cargando, onPress }: { hayMas: boolean; cargando: boolean; onPress: () => void }) {
  if (!hayMas) return null;
  return <Boton titulo={cargando ? 'Cargando...' : 'Ver más'} variante="contorno" cargando={cargando} onPress={onPress} />;
}

const e = StyleSheet.create({
  envuelta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipHora: { minWidth: 58, minHeight: 44, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  fila: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  chip: { paddingHorizontal: 16, height: 42, justifyContent: 'center', borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: C.borde },
  chipActivo: { backgroundColor: C.texto, borderColor: C.texto },
  chipTexto: { fontWeight: '600', color: C.texto },
  cabeceraMes: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  flecha: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radio, backgroundColor: C.fondo },
  flechaTexto: { fontSize: 26, fontWeight: '700', color: C.texto },
  mes: { fontSize: 18, fontWeight: '700', color: C.texto },
  semana: { flexDirection: 'row' },
  diaSemana: { width: `${100 / 7}%`, textAlign: 'center', color: C.suave, fontWeight: '600' },
  grilla: { flexDirection: 'row', flexWrap: 'wrap' },
  celda: { width: `${100 / 7}%`, height: 48, alignItems: 'center', justifyContent: 'center' },
  dia: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  diaDentro: { backgroundColor: '#DBEAFE' },
  diaExtremo: { backgroundColor: C.primario },
  diaTexto: { fontSize: 16, fontWeight: '600', color: C.texto },
});
