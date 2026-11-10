// Usuarios (alta, rol, estado, borrar PIN), roles y permisos, y qué manuales ve cada rol
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { Interruptor, Opciones, Seccion } from '@/components/formulario';
import { Boton, Campo, Etiqueta, Ventana } from '@/components/ui';
import { C, radio } from '@/constants/colores';
import { mensajeError } from '@/lib/api';
import { avisar, confirmar } from '@/lib/aviso';
import { fecha } from '@/lib/formato';
import * as op from '@/lib/operaciones';

// ── Usuarios ──────────────────────────────────────────────────
export function Usuarios() {
  const [lista, setLista] = useState<op.UsuarioLista[] | null>(null);
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [editando, setEditando] = useState<{ item: op.UsuarioLista | null } | null>(null);

  const cargar = useCallback(() => {
    op.getUsuarios().then(setLista).catch((err) => avisar('No se pudieron cargar', mensajeError(err)));
    op.getRoles().then(setRoles).catch(() => null);
  }, []);
  useEffect(cargar, [cargar]);

  return (
    <ScrollView contentContainerStyle={e.contenido}>
      <View style={e.cabecera}>
        <Text style={[e.suave, { flex: 1 }]}>Cada persona entra con su correo y contraseña. El PIN lo crea cada quien en «Mi PIN» (Inicio).</Text>
        <Boton titulo="+ Usuario" onPress={() => setEditando({ item: null })} />
      </View>
      {(lista ?? []).map((u) => (
        <Pressable key={u.id} onPress={() => setEditando({ item: u })} style={({ pressed }) => [e.tarjeta, !u.estado && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={e.titulo}>{u.nombre}</Text>
            <Text style={e.suave}>{u.correo} · último acceso {u.ultimo_acceso ? fecha(u.ultimo_acceso) : 'nunca'}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Etiqueta texto={u.rol} fondo="#E0E7FF" color="#3730A3" />
            <Text style={e.suave}>{u.pin_actualizado_at ? 'Tiene PIN' : 'Sin PIN'}</Text>
            {!u.estado && <Etiqueta texto="Desactivado" fondo="#FEE2E2" color="#B91C1C" />}
          </View>
        </Pressable>
      ))}
      {editando && <FormUsuario item={editando.item} roles={roles} onCerrar={() => setEditando(null)} onListo={() => { setEditando(null); cargar(); }} />}
    </ScrollView>
  );
}

function FormUsuario({ item, roles, onCerrar, onListo }: { item: op.UsuarioLista | null; roles: Record<string, string>; onCerrar: () => void; onListo: () => void }) {
  const [nombre, setNombre] = useState(item?.nombre ?? '');
  const [email, setEmail] = useState(item?.correo ?? '');
  const [password, setPassword] = useState('');
  const idDelRol = Object.entries(roles).find(([, n]) => n === item?.rol)?.[0];
  const [rolId, setRolId] = useState<number | null>(idDelRol ? Number(idDelRol) : Number(Object.entries(roles).find(([, n]) => n === 'mesero')?.[0] ?? 0) || null);
  const [activo, setActivo] = useState(item?.estado ?? true);
  const [guardando, setGuardando] = useState(false);

  const error = !nombre.trim() ? 'Escribe el nombre' : !/^\S+@\S+\.\S+$/.test(email.trim()) ? 'Escribe un correo válido'
    : !item && password.length < 8 ? 'La contraseña debe tener al menos 8 caracteres'
      : item && password && password.length < 8 ? 'La contraseña nueva debe tener al menos 8 caracteres'
        : !rolId ? 'Elige el rol' : null;

  const guardar = async () => {
    setGuardando(true);
    try {
      const r = item
        ? await op.actualizarUsuario(item.id, { nombre: nombre.trim(), email: email.trim(), password: password || undefined, rol: rolId!, estado: activo })
        : await op.crearUsuario({ nombre: nombre.trim(), email: email.trim(), password, rol: roles[String(rolId)] });
      avisar(r.message ?? 'Usuario guardado');
      onListo();
    } catch (err) {
      avisar('No se pudo guardar', mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };

  const borrarPin = async () => {
    if (!item || !(await confirmar('Borrar PIN', `${item.nombre} tendrá que entrar con su contraseña y crear un PIN nuevo.`, 'Borrar'))) return;
    try {
      const r = await op.borrarPinUsuario(item.id);
      avisar(r.message);
      onListo();
    } catch (err) {
      avisar('No se pudo borrar', mensajeError(err));
    }
  };

  return (
    <Ventana visible titulo={item ? `Editar ${item.nombre}` : 'Nuevo usuario'} onCerrar={onCerrar} ancho={560}
      pie={
        <View style={{ flex: 1, gap: 6 }}>
          {error && <Text style={{ color: C.peligro }}>{error}</Text>}
          <Boton titulo="Guardar" cargando={guardando} deshabilitado={!!error} onPress={guardar} />
        </View>
      }>
      <Campo etiqueta="Nombre" value={nombre} onChangeText={setNombre} maxLength={50} />
      <Campo etiqueta="Correo (para entrar)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" maxLength={100} />
      <Campo etiqueta={item ? 'Contraseña nueva (déjala vacía para no cambiarla)' : 'Contraseña (mínimo 8)'} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
      {item && password ? <Text style={e.suave}>Al cambiar la contraseña se cierran sus sesiones abiertas.</Text> : null}
      <Seccion titulo="Rol" />
      <Opciones opciones={Object.entries(roles).map(([id, n]) => ({ valor: Number(id), texto: n }))} valor={rolId} onCambiar={setRolId} />
      {item && <Interruptor titulo="Activo" detalle="Desactivado no puede entrar y pierde sus sesiones abiertas" valor={activo} onCambiar={setActivo} />}
      {item?.pin_actualizado_at && <Boton titulo="Borrar su PIN (si lo olvidó)" variante="contorno" onPress={borrarPin} />}
    </Ventana>
  );
}

// ── Roles y permisos ──────────────────────────────────────────
export function RolesPermisos() {
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [rolId, setRolId] = useState<number | null>(null);
  const [matriz, setMatriz] = useState<op.MatrizRol | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState(false);
  // Permisos con la explicación desplegada (botón «?»)
  const [conAyuda, setConAyuda] = useState<Set<string>>(new Set());
  const verAyuda = (n: string) => setConAyuda((s) => { const x = new Set(s); if (x.has(n)) x.delete(n); else x.add(n); return x; });
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    op.getRoles().then((r) => {
      setRoles(r);
      const mesero = Object.entries(r).find(([, n]) => n === 'mesero')?.[0] ?? Object.keys(r).find((id) => r[id] !== 'admin');
      if (mesero) setRolId(Number(mesero));
    }).catch((err) => avisar('No se pudieron cargar', mensajeError(err)));
  }, []);
  const cargar = useCallback(() => {
    if (!rolId) return;
    op.getMatrizRol(rolId).then((m) => {
      setMatriz(m);
      setMarcados(new Set(m.modulos.flatMap((g) => g.permisos.filter((p) => p.asignado).map((p) => p.nombre))));
    }).catch((err) => avisar('No se pudo cargar el rol', mensajeError(err)));
  }, [rolId]);
  useEffect(cargar, [cargar]);

  const original = useMemo(() => new Set(matriz?.modulos.flatMap((g) => g.permisos.filter((p) => p.asignado).map((p) => p.nombre)) ?? []), [matriz]);
  const cambios = [...marcados].filter((p) => !original.has(p)).length + [...original].filter((p) => !marcados.has(p)).length;
  const soloLectura = !!matriz?.rol.es_admin;
  // Buscador: si el módulo coincide se muestran todos sus permisos; si no, solo los que coinciden
  const modulosVisibles = useMemo(() => {
    const q = normalizar(busqueda.trim());
    const mods = matriz?.modulos ?? [];
    if (!q) return mods;
    return mods
      .map((g) => normalizar(g.modulo).includes(q) ? g
        : { ...g, permisos: g.permisos.filter((p) => [p.descripcion, p.nombre, p.ayuda ?? ''].some((t) => normalizar(t).includes(q))) })
      .filter((g) => g.permisos.length > 0);
  }, [matriz, busqueda]);
  const alternar = (n: string) => setMarcados((m) => { const x = new Set(m); if (x.has(n)) x.delete(n); else x.add(n); return x; });
  const poner = (ns: string[], on: boolean) => setMarcados((m) => { const x = new Set(m); ns.forEach((n) => (on ? x.add(n) : x.delete(n))); return x; });

  const guardar = async () => {
    if (!rolId) return;
    setGuardando(true);
    try {
      const r = await op.guardarMatrizRol(rolId, [...marcados]);
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
      <Opciones opciones={Object.entries(roles).map(([id, n]) => ({ valor: Number(id), texto: n }))} valor={rolId}
        onCambiar={async (id) => { if (!cambios || (await confirmar('Cambios sin guardar', '¿Descartarlos?', 'Descartar'))) setRolId(id); }} />
      {soloLectura && <Text style={e.aviso}>El administrador tiene acceso a todo, también a lo que se agregue en el futuro: no se edita.</Text>}
      {matriz && <Text style={e.suave}>{matriz.rol.usuarios} usuario(s) con este rol. Los cambios aplican al momento; en la tablet se ven al volver a Inicio.</Text>}
      {matriz && (
        <Campo etiqueta="Buscar permiso" value={busqueda} onChangeText={setBusqueda} placeholder="Ej. cobrar, inventario, PIN…"
          autoCapitalize="none" autoCorrect={false} clearButtonMode="while-editing" />
      )}
      {matriz && busqueda.trim() !== '' && modulosVisibles.length === 0 && <Text style={e.suave}>Ningún permiso coincide con «{busqueda.trim()}».</Text>}
      {modulosVisibles.map((g) => {
        const nombres = g.permisos.map((p) => p.nombre);
        const on = nombres.filter((n) => marcados.has(n)).length;
        return (
          <View key={g.modulo} style={e.bloque}>
            <View style={e.cabecera}>
              <View style={{ flex: 1 }}>
                <Text style={e.titulo}>{g.modulo}</Text>
                <Text style={e.suave}>{on === nombres.length ? 'Acceso completo' : on ? `${on} de ${nombres.length}` : 'Sin acceso'}</Text>
              </View>
              <Switch value={on === nombres.length} disabled={soloLectura} onValueChange={(v) => poner(nombres, v)}
                trackColor={{ true: on === nombres.length ? C.exito : '#FBBF24', false: on ? '#FBBF24' : '#D1D5DB' }} thumbColor="#fff" />
            </View>
            {g.permisos.map((p) => (
              <View key={p.nombre} style={e.permisoBloque}>
                <View style={e.permisoFila}>
                  <Text style={[e.texto, { flex: 1 }]}>{p.descripcion}</Text>
                  {p.ayuda ? (
                    <Pressable onPress={() => verAyuda(p.nombre)} hitSlop={10} accessibilityLabel={`Qué hace: ${p.descripcion}`}
                      style={[e.ayudaBoton, conAyuda.has(p.nombre) && e.ayudaBotonActivo]}>
                      <Text style={[e.ayudaSigno, conAyuda.has(p.nombre) && { color: '#fff' }]}>?</Text>
                    </Pressable>
                  ) : null}
                  <Switch value={marcados.has(p.nombre)} disabled={soloLectura} onValueChange={() => alternar(p.nombre)} trackColor={{ true: C.exito, false: '#D1D5DB' }} thumbColor="#fff" />
                </View>
                {p.ayuda && conAyuda.has(p.nombre) ? <Text style={e.ayudaTexto}>{p.ayuda}</Text> : null}
              </View>
            ))}
          </View>
        );
      })}
      {cambios > 0 && <Boton titulo={`Guardar ${cambios} cambio(s)`} variante="exito" cargando={guardando} onPress={guardar} />}
    </ScrollView>
  );
}

// ── Manuales por rol ──────────────────────────────────────────
export function ManualesPorRol() {
  const [datos, setDatos] = useState<op.PermisosManuales | null>(null);
  const [rolId, setRolId] = useState<number | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback((elegir?: number) => {
    op.getPermisosManuales().then((d) => {
      setDatos(d);
      const rol = d.roles.find((r) => r.id === elegir) ?? d.roles.find((r) => r.nombre === 'mesero') ?? d.roles[0];
      if (rol) { setRolId(rol.id); setMarcados(new Set(rol.manuales)); }
    }).catch((err) => avisar('No se pudo cargar', mensajeError(err)));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const rol = datos?.roles.find((r) => r.id === rolId);
  const original = useMemo(() => new Set(rol?.manuales ?? []), [rol]);
  const cambios = [...marcados].filter((m) => !original.has(m)).length + [...original].filter((m) => !marcados.has(m)).length;
  const usa = (permisos: string[]) => !permisos.length || permisos.some((p) => rol?.permisos.includes(p));
  const todos = (datos?.modulos ?? []).flatMap((m) => m.manuales);
  const poner = (ids: string[], on: boolean) => setMarcados((m) => { const x = new Set(m); ids.forEach((i) => (on ? x.add(i) : x.delete(i))); return x; });

  const guardar = async () => {
    if (!rol) return;
    setGuardando(true);
    try {
      const r = await op.guardarPermisosManuales(rol.id, [...marcados]);
      avisar(r.message);
      cargar(rol.id);
    } catch (err) {
      avisar('No se pudo guardar', mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={e.contenido}>
      <Text style={e.suave}>Qué manuales ve cada rol en Manuales (web y tablet). El administrador los ve todos.</Text>
      <Opciones opciones={(datos?.roles ?? []).map((r) => ({ valor: r.id, texto: r.nombre }))} valor={rolId}
        onCambiar={(id) => { const r = datos?.roles.find((x) => x.id === id); setRolId(id); setMarcados(new Set(r?.manuales ?? [])); }} />
      {rol && !rol.ver_seccion && <Text style={e.aviso}>Este rol tiene apagado «Ver los manuales de uso del sistema» en Roles y permisos: no ve la sección.</Text>}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Text style={e.suave}>{marcados.size} de {todos.length}</Text>
        <Boton titulo="Según sus permisos" chico variante="contorno" onPress={() => setMarcados(new Set(todos.filter((m) => usa(m.permisos)).map((m) => m.id)))} />
        <Boton titulo="Todos" chico variante="contorno" onPress={() => setMarcados(new Set(todos.map((m) => m.id)))} />
        <Boton titulo="Ninguno" chico variante="contorno" onPress={() => setMarcados(new Set())} />
      </View>
      {(datos?.modulos ?? []).map((mo) => {
        const ids = mo.manuales.map((m) => m.id);
        const on = ids.filter((i) => marcados.has(i)).length;
        return (
          <View key={mo.id} style={e.bloque}>
            <View style={e.cabecera}>
              <Text style={[e.titulo, { flex: 1 }]}>{mo.titulo}</Text>
              <Switch value={on === ids.length} onValueChange={(v) => poner(ids, v)} trackColor={{ true: C.exito, false: on ? '#FBBF24' : '#D1D5DB' }} thumbColor="#fff" />
            </View>
            {mo.manuales.map((m) => (
              <View key={m.id} style={e.permiso}>
                <View style={{ flex: 1 }}>
                  <Text style={e.texto}>{m.titulo}</Text>
                  {!usa(m.permisos) && <Text style={{ fontSize: 12, color: C.aviso }}>Su rol no usa este módulo</Text>}
                </View>
                <Switch value={marcados.has(m.id)} onValueChange={(v) => poner([m.id], v)} trackColor={{ true: C.exito, false: '#D1D5DB' }} thumbColor="#fff" />
              </View>
            ))}
          </View>
        );
      })}
      {cambios > 0 && <Boton titulo={`Guardar ${cambios} cambio(s)`} variante="exito" cargando={guardando} onPress={guardar} />}
    </ScrollView>
  );
}

const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const e = StyleSheet.create({
  contenido: { padding: 12, gap: 10, maxWidth: 1000, width: '100%', alignSelf: 'center' },
  cabecera: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  tarjeta: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: radio, borderWidth: 1, borderColor: C.borde, padding: 14 },
  bloque: { backgroundColor: '#fff', borderRadius: radio, borderWidth: 1, borderColor: C.borde, padding: 14, gap: 4 },
  titulo: { fontSize: 16, fontWeight: '800', color: C.texto },
  texto: { fontSize: 15, color: C.texto },
  suave: { fontSize: 13, color: C.suave },
  aviso: { padding: 10, borderRadius: radio, backgroundColor: '#FEF3C7', color: '#92400E', overflow: 'hidden' },
  permiso: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderColor: C.borde },
  permisoBloque: { paddingVertical: 8, borderTopWidth: 1, borderColor: C.borde, gap: 6 },
  permisoFila: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ayudaBoton: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center' },
  ayudaBotonActivo: { backgroundColor: C.primario, borderColor: C.primario },
  ayudaSigno: { fontSize: 13, fontWeight: '800', color: C.suave },
  ayudaTexto: { fontSize: 13, lineHeight: 19, color: '#1E3A8A', backgroundColor: '#EFF6FF', borderRadius: 8, padding: 10 },
});
