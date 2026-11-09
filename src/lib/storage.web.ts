// SecureStore no existe en web: la vista previa en el navegador usa localStorage.
const disponible = () => {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
};

export const leer = async (clave: string): Promise<string | null> => (disponible() ? localStorage.getItem(clave) : null);

export const guardar = async (clave: string, valor: string): Promise<void> => {
  if (disponible()) localStorage.setItem(clave, valor);
};

export const borrar = async (clave: string): Promise<void> => {
  if (disponible()) localStorage.removeItem(clave);
};
