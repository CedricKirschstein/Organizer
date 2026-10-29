import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createNote, deleteNote, getNotes, updateNote } from '@/services/notes';
import type { Note } from '@/services/notes';

export default function NotesScreen() {
  const theme = useTheme();
  const { noteId } = useLocalSearchParams<{ noteId?: string }>();
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openedNoteIdRef = useRef<string | null>(null);
  const requestedNoteMissing =
    typeof noteId === 'string' &&
    !isLoading &&
    !loadFailed &&
    !notes.some((note) => note.id === noteId);

  useFocusEffect(
    useCallback(() => {
      let isFocused = true;
      getNotes()
        .then((storedNotes) => {
          if (isFocused) {
            setNotes(storedNotes);
            setLoadFailed(false);
            setError(null);
          }
        })
        .catch(() => {
          if (isFocused) {
            setLoadFailed(true);
            setError('Notizen konnten nicht geladen werden. Bitte versuche es erneut.');
          }
        })
        .finally(() => {
          if (isFocused) {
            setIsLoading(false);
          }
        });

      return () => {
        isFocused = false;
      };
    }, []),
  );

  useEffect(() => {
    if (typeof noteId !== 'string') {
      openedNoteIdRef.current = null;
      return;
    }

    if (
      isLoading ||
      loadFailed ||
      noteId === openedNoteIdRef.current
    ) {
      return;
    }

    const note = notes.find((item) => item.id === noteId);
    if (note !== undefined) {
      openedNoteIdRef.current = noteId;
      openExistingNote(note);
      router.setParams({ noteId: undefined });
    }
  }, [isLoading, loadFailed, noteId, notes]);

  async function retryLoading() {
    setIsLoading(true);
    setError(null);
    try {
      setNotes(await getNotes());
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
      setError('Notizen konnten nicht geladen werden. Bitte versuche es erneut.');
    } finally {
      setIsLoading(false);
    }
  }

  function openNewNote() {
    setEditingId(null);
    setTitle('');
    setBody('');
    setConfirmingDelete(false);
    setError(null);
    setEditorOpen(true);
  }

  function openExistingNote(note: Note) {
    setEditingId(note.id);
    setTitle(note.title);
    setBody(note.body);
    setConfirmingDelete(false);
    setError(null);
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setConfirmingDelete(false);
    setError(null);
  }

  async function saveNote() {
    if (title.trim().length === 0) {
      setError('Bitte gib einen Titel für die Notiz ein.');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const savedNote =
        editingId === null
          ? await createNote(title, body)
          : await updateNote(editingId, title, body);
      setNotes((currentNotes) =>
        [savedNote, ...currentNotes.filter((note) => note.id !== savedNote.id)].sort(
          (first, second) => second.updatedAt.localeCompare(first.updatedAt),
        ),
      );
      closeEditor();
    } catch {
      setError('Die Notiz konnte nicht gespeichert werden. Bitte versuche es erneut.');
    } finally {
      setIsSaving(false);
    }
  }

  async function removeNote() {
    if (editingId === null) {
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await deleteNote(editingId);
      setNotes((currentNotes) => currentNotes.filter((note) => note.id !== editingId));
      closeEditor();
    } catch {
      setError('Die Notiz konnte nicht gelöscht werden. Bitte versuche es erneut.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          {editorOpen ? (
            <Pressable
              accessibilityRole="button"
              onPress={closeEditor}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
              <ThemedText type="smallBold" themeColor="accent">
                Zurück zu Notizen
              </ThemedText>
            </Pressable>
          ) : (
            <ThemedText type="smallBold" themeColor="accent">
              ORGANIZER
            </ThemedText>
          )}
          <ThemedText type="subtitle">{editorOpen ? 'Notiz' : 'Notizen'}</ThemedText>
          {!editorOpen && (
            <ThemedText themeColor="textSecondary">
              {notes.length === 1 ? '1 Notiz' : `${notes.length} Notizen`}
            </ThemedText>
          )}
        </View>

        {(error !== null || requestedNoteMissing) && (
          <ThemedView type="backgroundElement" style={styles.errorBanner}>
            <ThemedText type="small">
              {error ?? 'Die angeforderte Notiz wurde nicht gefunden.'}
            </ThemedText>
          </ThemedView>
        )}

        {editorOpen ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.editorContainer}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.editorContent}>
              <ThemedText type="small" themeColor="textSecondary">
                {editingId === null ? 'Neue Notiz' : 'Änderungen werden erst beim Speichern übernommen.'}
              </ThemedText>
              <TextInput
                accessibilityLabel="Titel der Notiz"
                value={title}
                onChangeText={setTitle}
                placeholder="Titel"
                placeholderTextColor={theme.textSecondary}
                returnKeyType="next"
                style={[
                  styles.titleInput,
                  {
                    color: theme.text,
                    backgroundColor: theme.backgroundElement,
                  },
                ]}
              />
              <TextInput
                accessibilityLabel="Inhalt der Notiz"
                value={body}
                onChangeText={setBody}
                placeholder="Schreibe deine Notiz ..."
                placeholderTextColor={theme.textSecondary}
                multiline
                textAlignVertical="top"
                style={[
                  styles.bodyInput,
                  {
                    color: theme.text,
                    backgroundColor: theme.backgroundElement,
                  },
                ]}
              />

              {confirmingDelete && (
                <ThemedView type="backgroundElement" style={styles.confirmBox}>
                  <ThemedText type="smallBold">Diese Notiz löschen?</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Das Löschen kann nicht rückgängig gemacht werden.
                  </ThemedText>
                  <View style={styles.confirmActions}>
                    <ActionButton label="Abbrechen" onPress={() => setConfirmingDelete(false)} />
                    <ActionButton
                      label="Notiz löschen"
                      onPress={removeNote}
                      disabled={isSaving}
                      destructive
                    />
                  </View>
                </ThemedView>
              )}

              <View style={styles.actions}>
                <ActionButton
                  label={isSaving ? 'Speichern ...' : 'Speichern'}
                  onPress={saveNote}
                  disabled={isSaving || title.trim().length === 0}
                  primary
                />
                {editingId !== null && !confirmingDelete && (
                  <ActionButton
                    label="Löschen"
                    onPress={() => setConfirmingDelete(true)}
                    disabled={isSaving}
                    destructive
                  />
                )}
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        ) : (
          <View style={styles.listContainer}>
            <ActionButton label="+  Neue Notiz" onPress={openNewNote} primary />
            {isLoading ? (
              <ActivityIndicator
                accessibilityLabel="Notizen werden geladen"
                color={theme.accent}
                style={styles.loading}
              />
            ) : loadFailed ? (
              <View style={styles.loadError}>
                <ThemedText type="small" themeColor="textSecondary">
                  Die Notizliste ist momentan nicht verfügbar.
                </ThemedText>
                <ActionButton label="Erneut versuchen" onPress={retryLoading} />
              </View>
            ) : notes.length === 0 ? (
              <ThemedView type="backgroundElement" style={styles.emptyState}>
                <ThemedText type="smallBold">Noch keine Notizen</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.emptyHint}>
                  Erstelle deine erste Notiz mit dem Button oben.
                </ThemedText>
              </ThemedView>
            ) : (
              <ScrollView contentContainerStyle={styles.noteList}>
                {notes
                  .slice()
                  .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
                  .map((note) => (
                    <Pressable
                      key={note.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Notiz öffnen: ${note.title}`}
                      onPress={() => openExistingNote(note)}
                      style={({ pressed }) => [styles.noteCard, pressed && styles.pressed]}>
                      <ThemedView type="backgroundElement" style={styles.noteCardContent}>
                        <ThemedText type="smallBold" numberOfLines={1}>
                          {note.title}
                        </ThemedText>
                        {note.body.length > 0 && (
                          <ThemedText
                            type="small"
                            themeColor="textSecondary"
                            numberOfLines={2}
                            style={styles.notePreview}>
                            {note.body}
                          </ThemedText>
                        )}
                      </ThemedView>
                    </Pressable>
                  ))}
              </ScrollView>
            )}
          </View>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  destructive?: boolean;
};

function ActionButton({
  label,
  onPress,
  disabled = false,
  primary = false,
  destructive = false,
}: ActionButtonProps) {
  const theme = useTheme();
  const backgroundColor = primary ? theme.accent : theme.backgroundElement;
  const color = primary ? theme.background : destructive ? theme.danger : theme.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        { backgroundColor },
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}>
      <ThemedText type="smallBold" style={{ color }}>
        {label}
      </ThemedText>
    </Pressable>
  );
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
  header: {
    gap: Spacing.two,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
  },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 40,
    justifyContent: 'center',
  },
  listContainer: {
    flex: 1,
    gap: Spacing.three,
    paddingBottom: Spacing.three,
  },
  noteList: {
    gap: Spacing.two,
    paddingBottom: Platform.OS === 'web' ? 96 : Spacing.four,
  },
  noteCard: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  noteCardContent: {
    minHeight: 64,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  notePreview: {
    marginTop: Spacing.one,
  },
  emptyState: {
    alignItems: 'center',
    padding: Spacing.four,
    borderRadius: 16,
  },
  emptyHint: {
    textAlign: 'center',
    marginTop: Spacing.two,
  },
  loading: {
    marginTop: Spacing.four,
  },
  loadError: {
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  editorContainer: {
    flex: 1,
  },
  editorContent: {
    gap: Spacing.three,
    paddingBottom: Platform.OS === 'web' ? 96 : Spacing.four,
  },
  titleInput: {
    minHeight: 56,
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    fontSize: 18,
    fontWeight: '600',
  },
  bodyInput: {
    minHeight: 220,
    borderRadius: 14,
    padding: Spacing.three,
    fontSize: 16,
    lineHeight: 24,
  },
  actions: {
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  actionButton: {
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.72,
  },
  errorBanner: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 12,
    marginBottom: Spacing.three,
  },
  confirmBox: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: 14,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexWrap: 'wrap',
    marginTop: Spacing.two,
  },
});
