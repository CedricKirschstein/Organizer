import { router } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useVoiceRecording, VoiceRecordingPhase } from '@/hooks/use-voice-recording';
import { useTheme } from '@/hooks/use-theme';

function formatDuration(durationMillis: number): string {
  const seconds = Math.floor(durationMillis / 1000);
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

export default function HomeScreen() {
  const theme = useTheme();
  const {
    phase,
    recordingUri,
    durationMillis,
    error,
    notice,
    startRecording,
    finishRecording,
    cancelRecording,
    discardRecording,
  } = useVoiceRecording();
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          gesture.dx > 24 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4,
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dx > 72) {
            router.push('/explore');
          }
        },
      }),
    [],
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView {...panResponder.panHandlers} style={styles.safeArea}>
        <View style={styles.content}>
          <View style={styles.heading}>
            <ThemedText type="smallBold" themeColor="accent">
              ORGANIZER
            </ThemedText>
            <ThemedText type="title" style={styles.title}>
              Alles an{'\n'}einem Ort.
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.subtitle}>
              Halte deine Gedanken und Notizen fest.
            </ThemedText>
          </View>

          <View style={styles.voiceSection}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                phase === 'recording'
                  ? 'Aufnahme stoppen'
                  : phase === 'ready'
                    ? 'Neue Aufnahme starten'
                    : 'Aufnahme starten'
              }
              accessibilityState={{
                disabled: phase === 'requesting' || phase === 'processing',
              }}
              disabled={phase === 'requesting' || phase === 'processing'}
              onPress={phase === 'recording' ? finishRecording : startRecording}
              style={({ pressed }) => [
                styles.microphoneButton,
                {
                  backgroundColor: phase === 'recording' ? theme.danger : theme.accent,
                },
                pressed && styles.pressed,
              ]}>
              {phase === 'requesting' || phase === 'processing' ? (
                <ActivityIndicator color="#ffffff" size="large" />
              ) : phase === 'recording' ? (
                <View style={styles.stopIcon} />
              ) : (
                <View style={styles.microphoneIcon}>
                  <View style={styles.microphoneCapsule} />
                  <View style={styles.microphoneCradle} />
                  <View style={styles.microphoneStem} />
                  <View style={styles.microphoneBase} />
                </View>
              )}
            </Pressable>

            <ThemedText
              accessibilityLiveRegion="polite"
              type="smallBold"
              themeColor={phase === 'recording' ? 'danger' : 'text'}>
              {getRecordingStatus(phase, durationMillis)}
            </ThemedText>

            {phase === 'recording' && (
              <Pressable
                accessibilityRole="button"
                onPress={cancelRecording}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
                <ThemedText type="small" themeColor="textSecondary">
                  Aufnahme abbrechen
                </ThemedText>
              </Pressable>
            )}

            {phase === 'ready' && recordingUri !== null && (
              <Pressable
                accessibilityRole="button"
                onPress={discardRecording}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
                <ThemedText type="small" themeColor="textSecondary">
                  Aufnahme verwerfen
                </ThemedText>
              </Pressable>
            )}

            {error !== null && (
              <ThemedText
                accessibilityLiveRegion="assertive"
                type="small"
                themeColor="danger"
                style={styles.statusMessage}>
                {error}
              </ThemedText>
            )}

            {notice !== null && error === null && (
              <ThemedText
                accessibilityLiveRegion="polite"
                type="small"
                themeColor="textSecondary"
                style={styles.statusMessage}>
                {notice}
              </ThemedText>
            )}

            {phase === 'idle' && error === null && notice === null && (
              <ThemedText type="small" themeColor="textSecondary" style={styles.voiceHint}>
                Tippe auf das Mikrofon, um deine Anfrage aufzunehmen.
              </ThemedText>
            )}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Meine Notizen öffnen"
            onPress={() => router.push('/explore')}
            style={({ pressed }) => [styles.notesButton, pressed && styles.pressed]}>
            <ThemedText type="smallBold" style={{ color: theme.accent }}>
              Meine Notizen ansehen
            </ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

function getRecordingStatus(phase: VoiceRecordingPhase, durationMillis: number): string {
  switch (phase) {
    case 'requesting':
      return 'Mikrofon wird vorbereitet ...';
    case 'recording':
      return `Aufnahme läuft · ${formatDuration(durationMillis)}`;
    case 'processing':
      return 'Aufnahme wird abgeschlossen ...';
    case 'ready':
      return 'Aufnahme abgeschlossen';
    case 'idle':
      return 'Bereit für deine Anfrage';
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.five,
    paddingBottom: Platform.OS === 'web' ? 96 : Spacing.five,
  },
  heading: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  title: {
    textAlign: 'center',
    marginTop: Spacing.two,
  },
  subtitle: {
    textAlign: 'center',
  },
  voiceSection: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  microphoneButton: {
    width: 216,
    height: 216,
    borderRadius: 108,
    justifyContent: 'center',
    alignItems: 'center',
  },
  microphoneIcon: {
    alignItems: 'center',
  },
  microphoneCapsule: {
    width: 36,
    height: 64,
    borderWidth: 4,
    borderColor: '#ffffff',
    borderRadius: 20,
  },
  microphoneCradle: {
    width: 64,
    height: 36,
    marginTop: -25,
    borderColor: '#ffffff',
    borderWidth: 4,
    borderTopWidth: 0,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  microphoneStem: {
    width: 4,
    height: 16,
    backgroundColor: '#ffffff',
  },
  microphoneBase: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ffffff',
  },
  stopIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  voiceHint: {
    textAlign: 'center',
  },
  statusMessage: {
    maxWidth: 340,
    textAlign: 'center',
  },
  secondaryButton: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
  },
  notesButton: {
    minHeight: 56,
    alignSelf: 'stretch',
    borderRadius: 18,
    paddingHorizontal: Spacing.four,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#80808055',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
