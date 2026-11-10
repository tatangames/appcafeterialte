// Mensajes cortos al usuario. Alert funciona en Android/iOS; en web cae a window.alert.
import { Alert, Platform } from 'react-native';

export const avisar = (titulo: string, mensaje?: string) => {
  if (Platform.OS === 'web') {
    window.alert(mensaje ? `${titulo}\n\n${mensaje}` : titulo);
    return;
  }
  Alert.alert(titulo, mensaje);
};

/** Igual que avisar, pero espera a que lo cierren (para no taparlo con otra pantalla). */
export const avisarYEsperar = (titulo: string, mensaje?: string): Promise<void> => {
  if (Platform.OS === 'web') {
    window.alert(mensaje ? `${titulo}\n\n${mensaje}` : titulo);
    return Promise.resolve();
  }
  return new Promise((resolver) =>
    Alert.alert(titulo, mensaje, [{ text: 'Aceptar', onPress: () => resolver() }], { cancelable: true, onDismiss: () => resolver() }));
};

export const confirmar = (titulo: string, mensaje: string, textoSi = 'Sí'): Promise<boolean> => {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${titulo}\n\n${mensaje}`));
  return new Promise((resolver) =>
    Alert.alert(titulo, mensaje, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolver(false) },
      { text: textoSi, onPress: () => resolver(true) },
    ], { cancelable: true, onDismiss: () => resolver(false) }));
};
