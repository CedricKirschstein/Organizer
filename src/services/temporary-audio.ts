import { Platform } from 'react-native';

export async function releaseTemporaryRecording(uri: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (!uri.startsWith('blob:')) {
      throw new Error('Die temporäre Browseraufnahme hat ein ungültiges Format.');
    }

    URL.revokeObjectURL(uri);
    return;
  }

  if (!uri.startsWith('file:')) {
    throw new Error('Die temporäre Aufnahme hat einen ungültigen Dateipfad.');
  }

  const { File } = await import('expo-file-system');
  const file = new File(uri);
  if (file.exists) {
    file.delete();
  }
}
