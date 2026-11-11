// Avisos cortos que se van solos («Producto guardado»), sin ventana que haya que cerrar.
// Los errores siguen con avisar(), que sí espera a que lo lean.
type Aviso = { id: number; texto: string };
type Oyente = (avisos: Aviso[]) => void;

let avisos: Aviso[] = [];
let siguiente = 0;
const oyentes = new Set<Oyente>();
const contar = () => oyentes.forEach((o) => o(avisos));

export const notificar = (texto: string) => {
  const id = ++siguiente;
  avisos = [...avisos, { id, texto }].slice(-3);
  contar();
  setTimeout(() => { avisos = avisos.filter((a) => a.id !== id); contar(); }, 2600);
};

export const escucharNotificaciones = (oyente: Oyente) => {
  oyentes.add(oyente);
  oyente(avisos);
  return () => { oyentes.delete(oyente); };
};
