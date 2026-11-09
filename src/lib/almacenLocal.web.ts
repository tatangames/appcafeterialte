// Vista previa en el navegador: expo-file-system no existe en web, se usa localStorage.
const disponible = () => {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
};

export const leerJson = async <T>(nombre: string): Promise<T | null> => {
  try {
    const texto = disponible() ? localStorage.getItem(`json_${nombre}`) : null;
    return texto ? (JSON.parse(texto) as T) : null;
  } catch {
    return null;
  }
};

export const guardarJson = async (nombre: string, valor: unknown): Promise<void> => {
  if (disponible()) localStorage.setItem(`json_${nombre}`, JSON.stringify(valor));
};

export const borrarJson = async (nombre: string): Promise<void> => {
  if (disponible()) localStorage.removeItem(`json_${nombre}`);
};
