import { Redirect } from 'expo-router';

import { useSesion } from '@/lib/sesion';

// Lleva al primer paso que falte: servidor → inicio de sesión → caja → menú
export default function Inicio() {
  const { servidor, usuario, cajaId } = useSesion();

  if (!servidor) return <Redirect href="/servidor" />;
  if (!usuario) return <Redirect href="/login" />;
  if (!cajaId) return <Redirect href="/caja" />;
  return <Redirect href="/inicio" />;
}
