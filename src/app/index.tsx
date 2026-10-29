import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useVoiceRecording, type VoiceRecordingPhase } from '@/hooks/use-voice-recording';
import { useTheme } from '@/hooks/use-theme';
import type { GeminiNoteProposal } from '@/services/gemini';
import { createNote, type Note } from '@/services/notes';

function formatDuration(durationMillis: number): string {
  const seconds = Math.floor(durationMillis / 1000);
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

export default function HomeScreen() {
  const theme = useTheme();
  const [proposal, setProposal] = useState<GeminiNoteProposal | null>(null);
  const [savedNote, setSavedNote] = useState<Note | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const requestControllerRef = useRef<AbortController | null>(null);
  const saveInProgressRef = useRef(false);
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
    dismissProposal,
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

  useEffect(
    () => () => {
      requestControllerRef.current?.abort();
    },
    [],
  );

  async function startNewRequest() {
    setProposal(null);
    setSavedNote(null);
    setSaveError(null);
    await startRecording();
  }

  async function stopAndRequestProposal() {
    if (requestControllerRef.current !== null) {
      return;
    }

    const controller = new AbortController();
    requestControllerRef.current = controller;
    try {
      const noteProposal = await finishRecording(controller.signal);
      if (noteProposal !== null) {
        setProposal(noteProposal);
      }
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
      }
    }
  }

  function cancelGeminiRequest() {
    requestControllerRef.current?.abort();
  }

  function rejectProposal() {
    setProposal(null);
    setSaveError(null);
    dismissProposal();
  }

  async function confirmProposal() {
    if (proposal === null || saveInProgressRef.current) {
      return;
    }

    saveInProgressRef.current = true;
    setIsSaving(true);
    setSaveError(null);
    try {
      const note = await createNote(proposal.title, proposal.content);
      setSavedNote(note);
      setProposal(null);
      dismissProposal();
    } catch {
      setSaveError('Die Notiz konnte nicht gespeichert werden. Prüfe den Speicherplatz und versuche es erneut.');
    } finally {
      saveInProgressRef.current = false;
      setIsSaving(false);
    }
  }

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

          {proposal !== null && phase === 'reviewing' ? (
            <ThemedView type="backgroundElement" style={styles.proposalCard}>
              <ThemedText type="smallBold" themeColor="accent">
                VORSCHLAG FÜR EINE NEUE NOTIZ
              </ThemedText>
              <ScrollView
                style={styles.proposalScroll}
                contentContainerStyle={styles.proposalContent}
                nestedScrollEnabled>
                <ThemedText type="subtitle" style={styles.proposalTitle}>
                  {proposal.title}
                </ThemedText>
                <ThemedText>{proposal.content}</ThemedText>
              </ScrollView>
              {saveError !== null && (
                <ThemedText type="small" themeColor="danger" accessibilityLiveRegion="assertive">
                  {saveError}
                </ThemedText>
              )}
              <View style={styles.proposalActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Notizvorschlag ablehnen"
                  disabled={isSaving}
                  onPress={rejectProposal}
                  style={({ pressed }) => [
                    styles.proposalButton,
                    { backgroundColor: theme.danger },
                    pressed && styles.pressed,
                    isSaving && styles.disabled,
                  ]}>
                  <ThemedText
                    type="smallBold"
                    style={[styles.proposalButtonText, { color: theme.background }]}>
                    Ablehnen
                  </ThemedText>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Notizvorschlag bestätigen und speichern"
                  disabled={isSaving}
                  onPress={confirmProposal}
                  style={({ pressed }) => [
                    styles.proposalButton,
                    { backgroundColor: theme.accent },
                    pressed && styles.pressed,
                    isSaving && styles.disabled,
                  ]}>
                  {isSaving ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <ThemedText
                      type="smallBold"
                      style={[styles.proposalButtonText, { color: theme.background }]}>
                      Bestätigen
                    </ThemedText>
                  )}
                </Pressable>
              </View>
            </ThemedView>
          ) : (
            <View style={styles.voiceSection}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  phase === 'recording' ? 'Aufnahme stoppen' : 'Aufnahme starten'
                }
                accessibilityState={{
                  disabled: phase === 'requesting' || phase === 'processing',
                }}
                disabled={phase === 'requesting' || phase === 'processing'}
                onPress={phase === 'recording' ? stopAndRequestProposal : startNewRequest}
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

              {phase === 'processing' && (
                <Pressable
                  accessibilityRole="button"
                  onPress={cancelGeminiRequest}
                  style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Anfrage abbrechen
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
          )}

          {savedNote !== null && (
            <ThemedView type="backgroundElement" style={styles.savedNoteBanner}>
              <View style={styles.savedNoteText}>
                <ThemedText type="smallBold">Notiz gespeichert</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {savedNote.title}
                </ThemedText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Gespeicherte Notiz öffnen: ${savedNote.title}`}
                onPress={() =>
                  router.push({ pathname: '/explore', params: { noteId: savedNote.id } })
                }
                style={({ pressed }) => [styles.viewNoteButton, pressed && styles.pressed]}>
                <ThemedText type="smallBold" themeColor="accent">
                  Ansehen
                </ThemedText>
              </Pressable>
            </ThemedView>
          )}

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
      return 'Anfrage wird verarbeitet ...';
    case 'ready':
      return 'Aufnahme abgeschlossen';
    case 'reviewing':
      return 'Notizvorschlag prüfen';
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
  proposalCard: {
    alignSelf: 'stretch',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: 20,
  },
  proposalScroll: {
    maxHeight: 320,
  },
  proposalContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.two,
  },
  proposalTitle: {
    fontSize: 24,
    lineHeight: 32,
  },
  proposalActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  proposalButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
  proposalButtonText: {
    color: '#ffffff',
  },
  disabled: {
    opacity: 0.5,
  },
  savedNoteBanner: {
    alignSelf: 'stretch',
    minHeight: 64,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  savedNoteText: {
    flex: 1,
    gap: Spacing.one,
  },
  viewNoteButton: {
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#ffffff22',
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
