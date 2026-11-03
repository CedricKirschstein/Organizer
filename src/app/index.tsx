import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  useVoiceRecording,
  type VoiceRecordingPhase,
} from "@/hooks/use-voice-recording";
import type {
  GeminiCalendarCreateProposal,
  GeminiCalendarDeleteCandidate,
  GeminiNoteProposal,
  GeminiProposalDraft,
  GeminiVoiceResult,
} from "@/services/gemini";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  restoreCalendarEvent,
} from "@/services/calendar";
import { applyNotePatches, type NoteTextPatch } from "@/services/note-edits";
import {
  createNote,
  deleteNoteWithUndo,
  restoreDeletedNote,
  updateNoteBodyIfUnchanged,
  type Note,
} from "@/services/notes";

function formatDuration(durationMillis: number): string {
  const seconds = Math.floor(durationMillis / 1000);
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

function formatCalendarDate(value: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function formatCalendarTime(value: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function HomeScreen() {
  const theme = useTheme();
  const [proposal, setProposal] = useState<GeminiNoteProposal | null>(null);
  const [proposalRevisionHistory, setProposalRevisionHistory] = useState<
    GeminiProposalDraft[]
  >([]);
  const [proposalRevisionCount, setProposalRevisionCount] = useState(0);
  const [proposalRevisionMessage, setProposalRevisionMessage] = useState<
    string | null
  >(null);
  const [openNoteProposal, setOpenNoteProposal] = useState<Note | null>(null);
  const [openNoteCandidates, setOpenNoteCandidates] = useState<Note[] | null>(
    null,
  );
  const [candidateAction, setCandidateAction] = useState<
    "open_note" | "edit_note" | "delete_note"
  >("open_note");
  const [deleteNoteProposal, setDeleteNoteProposal] = useState<Note | null>(
    null,
  );
  const [calendarCreateProposal, setCalendarCreateProposal] =
    useState<GeminiCalendarCreateProposal | null>(null);
  const [calendarDeleteProposal, setCalendarDeleteProposal] =
    useState<GeminiCalendarDeleteCandidate | null>(null);
  const [calendarDeleteCandidates, setCalendarDeleteCandidates] =
    useState<GeminiCalendarDeleteCandidate[] | null>(null);
  const [calendarActionError, setCalendarActionError] = useState<string | null>(
    null,
  );
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editNote, setEditNote] = useState<Note | null>(null);
  const [editPatches, setEditPatches] = useState<NoteTextPatch[] | null>(null);
  const [editPatchIndex, setEditPatchIndex] = useState(0);
  const [editReviewError, setEditReviewError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<Note | null>(null);
  const [deletedNote, setDeletedNote] = useState<Note | null>(null);
  const [deletedCalendarEvent, setDeletedCalendarEvent] =
    useState<GeminiCalendarDeleteCandidate | null>(null);
  const [calendarRestoreError, setCalendarRestoreError] = useState<
    string | null
  >(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const requestControllerRef = useRef<AbortController | null>(null);
  const proposalRevisionRef = useRef<GeminiProposalDraft | null>(null);
  const saveInProgressRef = useRef(false);
  const decidedPatchIndexRef = useRef<number | null>(null);
  const acceptedPatchIndexesRef = useRef(new Set<number>());
  const pendingEditResultsRef = useRef<Extract<
    GeminiVoiceResult,
    { action: "edit_note" }
  > | null>(null);
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
    rejectProposal: rejectVoiceProposal,
    completeProposal,
    completeOpenNote,
    completeEditReview,
    completeDeleteNote,
    completeCalendarAction,
    completeNoteRestore,
    cancelOpenNote,
  } = useVoiceRecording();
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          gesture.dx > 24 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4,
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dx > 72) {
            router.push("/explore");
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
    setOpenNoteProposal(null);
    setOpenNoteCandidates(null);
    setDeleteNoteProposal(null);
    setDeleteError(null);
    setCalendarCreateProposal(null);
    setCalendarDeleteProposal(null);
    setCalendarDeleteCandidates(null);
    setCalendarActionError(null);
    pendingEditResultsRef.current = null;
    setEditNote(null);
    setEditPatches(null);
    decidedPatchIndexRef.current = null;
    acceptedPatchIndexesRef.current.clear();
    setEditReviewError(null);
    setSavedNote(null);
    setDeletedNote(null);
    setDeletedCalendarEvent(null);
    setCalendarRestoreError(null);
    setRestoreError(null);
    setSaveError(null);
    proposalRevisionRef.current = null;
    setProposalRevisionHistory([]);
    setProposalRevisionCount(0);
    setProposalRevisionMessage(null);
    await startRecording();
  }

  async function stopAndRequestProposal() {
    if (requestControllerRef.current !== null) {
      return;
    }

    const controller = new AbortController();
    requestControllerRef.current = controller;
    const revisionDraft = proposalRevisionRef.current ?? undefined;
    try {
      const result = await finishRecording(controller.signal, revisionDraft);
      if (result !== null) {
        if (revisionDraft !== undefined) {
          setProposalRevisionHistory((history) => [...history, revisionDraft]);
          setProposalRevisionCount((count) => count + 1);
          setProposalRevisionMessage(
            `Überarbeiteter Vorschlag (${proposalRevisionCount + 1} von 5). Bitte prüfe ihn erneut.`,
          );
          if (revisionDraft.action === "create_note" && result.action === "create_note") {
            setProposal(result);
          } else if (
            revisionDraft.action === "create_calendar_event" &&
            result.action === "create_calendar_event"
          ) {
            setCalendarCreateProposal(result);
          } else {
            handleVoiceResult(result);
          }
        } else {
          handleVoiceResult(result);
        }
      }
    } finally {
      proposalRevisionRef.current = null;
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
      }
    }
  }

  function handleVoiceResult(result: GeminiVoiceResult) {
    if (result.action === "create_calendar_event") {
      setCalendarCreateProposal(result);
      setCalendarActionError(null);
      setOpenNoteCandidates(null);
      pendingEditResultsRef.current = null;
      return;
    }

    if (result.action === "delete_calendar_event") {
      setCalendarActionError(null);
      setOpenNoteCandidates(null);
      if (result.candidates.length === 0) {
        completeCalendarAction("not_found");
      } else if (result.candidates.length === 1) {
        setCalendarDeleteProposal(result.candidates[0]);
      } else {
        setCalendarDeleteCandidates(result.candidates);
      }
      return;
    }

    if (result.action === "create_note") {
      setProposal(result);
      setOpenNoteCandidates(null);
      pendingEditResultsRef.current = null;
      return;
    }

    if (result.notes.length === 0) {
      if (result.action === "delete_note") {
        completeDeleteNote("not_found");
      } else {
        completeOpenNote(false);
      }
    } else if (result.action === "open_note") {
      if (result.notes.length === 1) {
        setOpenNoteProposal(result.notes[0]);
      } else {
        setCandidateAction("open_note");
        setOpenNoteCandidates(result.notes);
        pendingEditResultsRef.current = null;
      }
    } else if (result.action === "edit_note" && result.notes.length === 1) {
      beginEditReview(
        result.notes[0],
        result.patchesByNoteId[result.notes[0].id] ?? [],
      );
    } else if (result.action === "edit_note") {
      setCandidateAction("edit_note");
      setOpenNoteCandidates(result.notes);
      pendingEditResultsRef.current = result;
    } else if (result.notes.length === 1) {
      setDeleteNoteProposal(result.notes[0]);
      setDeleteError(null);
    } else {
      setCandidateAction("delete_note");
      setOpenNoteCandidates(result.notes);
    }
  }

  function beginEditReview(note: Note, patches: NoteTextPatch[]) {
    setOpenNoteCandidates(null);
    setEditNote(note);
    setEditPatches(patches);
    setEditPatchIndex(0);
    decidedPatchIndexRef.current = null;
    acceptedPatchIndexesRef.current.clear();
    setEditReviewError(null);
  }

  function selectCandidate(note: Note) {
    if (candidateAction === "open_note") {
      setOpenNoteCandidates(null);
      setOpenNoteProposal(note);
      return;
    }

    if (candidateAction === "delete_note") {
      setOpenNoteCandidates(null);
      setDeleteNoteProposal(note);
      setDeleteError(null);
      return;
    }

    const result = pendingEditResultsRef.current;
    if (result === null) {
      return;
    }
    beginEditReview(note, result.patchesByNoteId[note.id] ?? []);
    pendingEditResultsRef.current = null;
  }

  function confirmOpenNote() {
    if (openNoteProposal === null) {
      return;
    }

    const note = openNoteProposal;
    setOpenNoteProposal(null);
    setOpenNoteCandidates(null);
    completeOpenNote(true);
    router.push({ pathname: "/explore", params: { noteId: note.id } });
  }

  function cancelOpenNoteReview() {
    setOpenNoteProposal(null);
    cancelOpenNote();
  }

  function cancelOpenNoteSelection() {
    setOpenNoteCandidates(null);
    pendingEditResultsRef.current = null;
    if (candidateAction === "delete_note") {
      completeDeleteNote("cancelled");
    } else {
      cancelOpenNote();
    }
  }

  function cancelDeleteReview() {
    setDeleteNoteProposal(null);
    setDeleteError(null);
    completeDeleteNote("cancelled");
  }

  function cancelCalendarReview() {
    setCalendarCreateProposal(null);
    setCalendarDeleteProposal(null);
    setCalendarDeleteCandidates(null);
    setCalendarActionError(null);
    clearProposalRevision();
    completeCalendarAction("cancelled");
  }

  function selectCalendarDeleteCandidate(
    candidate: GeminiCalendarDeleteCandidate,
  ) {
    setCalendarDeleteCandidates(null);
    setCalendarDeleteProposal(candidate);
    setCalendarActionError(null);
  }

  async function confirmCalendarCreate() {
    if (calendarCreateProposal === null || saveInProgressRef.current) {
      return;
    }

    saveInProgressRef.current = true;
    setIsSaving(true);
    setCalendarActionError(null);
    try {
      const result = await createCalendarEvent(calendarCreateProposal.event);
      if (!result.success) {
        setCalendarActionError(result.error.message);
        return;
      }
      setCalendarCreateProposal(null);
      clearProposalRevision();
      completeCalendarAction("created");
    } catch (calendarError) {
      setCalendarActionError(
        calendarError instanceof Error
          ? calendarError.message
          : "Der Kalendertermin konnte nicht erstellt werden.",
      );
    } finally {
      saveInProgressRef.current = false;
      setIsSaving(false);
    }
  }

  async function confirmCalendarDelete() {
    if (calendarDeleteProposal === null || saveInProgressRef.current) {
      return;
    }

    saveInProgressRef.current = true;
    setIsSaving(true);
    setCalendarActionError(null);
    try {
      const result = await deleteCalendarEvent(calendarDeleteProposal.event);
      if (!result.success) {
        setCalendarActionError(result.error.message);
        return;
      }
      setDeletedCalendarEvent(calendarDeleteProposal);
      setCalendarRestoreError(null);
      setCalendarDeleteProposal(null);
      completeCalendarAction("deleted");
    } catch (calendarError) {
      setCalendarActionError(
        calendarError instanceof Error
          ? calendarError.message
          : "Der Kalendertermin konnte nicht gelöscht werden.",
      );
    } finally {
      saveInProgressRef.current = false;
      setIsSaving(false);
    }
  }

  async function confirmDeleteNote() {
    if (deleteNoteProposal === null || saveInProgressRef.current) {
      return;
    }

    saveInProgressRef.current = true;
    setIsSaving(true);
    setDeleteError(null);
    try {
      await deleteNoteWithUndo(deleteNoteProposal);
      setDeletedNote(deleteNoteProposal);
      setSavedNote(null);
      setDeleteNoteProposal(null);
      completeDeleteNote("deleted");
    } catch (deleteFailure) {
      setDeleteError(
        deleteFailure instanceof Error
          ? deleteFailure.message
          : "Die Notiz konnte nicht gelöscht werden. Bitte versuche es erneut.",
      );
    } finally {
      saveInProgressRef.current = false;
      setIsSaving(false);
    }
  }

  async function restoreNote() {
    if (deletedNote === null || saveInProgressRef.current) {
      return;
    }

    saveInProgressRef.current = true;
    setIsSaving(true);
    setRestoreError(null);
    try {
      await restoreDeletedNote(deletedNote.id);
      setDeletedNote(null);
      completeNoteRestore();
    } catch (restoreFailure) {
      setRestoreError(
        restoreFailure instanceof Error
          ? restoreFailure.message
          : "Die Notiz konnte nicht wiederhergestellt werden. Bitte versuche es erneut.",
      );
    } finally {
      saveInProgressRef.current = false;
      setIsSaving(false);
    }
  }

  async function restoreCalendar() {
    if (deletedCalendarEvent === null || saveInProgressRef.current) {
      return;
    }

    saveInProgressRef.current = true;
    setIsSaving(true);
    setCalendarRestoreError(null);
    try {
      const result = await restoreCalendarEvent(deletedCalendarEvent.event);
      if (!result.success) {
        setCalendarRestoreError(result.error.message);
        return;
      }

      setDeletedCalendarEvent(null);
      completeCalendarAction(
        result.data.restoredToOriginalCalendar
          ? "restored"
          : "restored_elsewhere",
      );
    } catch (restoreFailure) {
      setCalendarRestoreError(
        restoreFailure instanceof Error
          ? restoreFailure.message
          : "Der Kalendertermin konnte nicht wiederhergestellt werden.",
      );
    } finally {
      saveInProgressRef.current = false;
      setIsSaving(false);
    }
  }

  function decideEditPatch(accepted: boolean) {
    if (
      editNote === null ||
      editPatches === null ||
      editPatchIndex >= editPatches.length ||
      editReviewError !== null ||
      decidedPatchIndexRef.current === editPatchIndex
    ) {
      return;
    }

    if (accepted) {
      acceptedPatchIndexesRef.current.add(editPatchIndex);
    }
    decidedPatchIndexRef.current = editPatchIndex;
    const nextIndex = editPatchIndex + 1;
    setEditPatchIndex(nextIndex);
    if (nextIndex === editPatches.length) {
      void saveAcceptedEdit(new Set(acceptedPatchIndexesRef.current));
    }
  }

  function cancelEditReview() {
    setEditNote(null);
    setEditPatches(null);
    setEditPatchIndex(0);
    decidedPatchIndexRef.current = null;
    acceptedPatchIndexesRef.current.clear();
    setEditReviewError(null);
    cancelOpenNote();
  }

  async function saveAcceptedEdit(
    acceptedIndexes: Set<number> = acceptedPatchIndexesRef.current,
  ) {
    if (
      editNote === null ||
      editPatches === null ||
      saveInProgressRef.current
    ) {
      return;
    }

    const acceptedPatches = editPatches.filter((_patch, index) =>
      acceptedIndexes.has(index),
    );
    if (acceptedPatches.length === 0) {
      setEditNote(null);
      setEditPatches(null);
      setEditPatchIndex(0);
      acceptedPatchIndexesRef.current.clear();
      completeEditReview(false);
      return;
    }

    const updatedBody = applyNotePatches(editNote.body, acceptedPatches);
    if (updatedBody === null) {
      setEditReviewError(
        "Eine angenommene Änderung passt nicht mehr eindeutig zur Originalnotiz. Bitte brich ab und fordere einen neuen Vorschlag an.",
      );
      return;
    }

    saveInProgressRef.current = true;
    setIsSaving(true);
    setEditReviewError(null);
    try {
      const updatedNote = await updateNoteBodyIfUnchanged(
        editNote,
        updatedBody,
      );
      setSavedNote(updatedNote);
      setEditNote(null);
      setEditPatches(null);
      setEditPatchIndex(0);
      acceptedPatchIndexesRef.current.clear();
      completeEditReview(true);
    } catch (saveError) {
      setEditReviewError(
        saveError instanceof Error
          ? saveError.message
          : "Die Notiz konnte nicht gespeichert werden. Bitte versuche es erneut.",
      );
    } finally {
      saveInProgressRef.current = false;
      setIsSaving(false);
    }
  }

  function cancelGeminiRequest() {
    requestControllerRef.current?.abort();
  }

  function rejectProposal() {
    setProposal(null);
    clearProposalRevision();
    setSaveError(null);
    rejectVoiceProposal();
  }

  function clearProposalRevision() {
    proposalRevisionRef.current = null;
    setProposalRevisionHistory([]);
    setProposalRevisionCount(0);
    setProposalRevisionMessage(null);
  }

  async function startProposalRevision() {
    if (
      proposalRevisionCount >= 5 ||
      (phase !== "reviewing" && phase !== "idle")
    ) {
      return;
    }

    const draft = proposal ?? calendarCreateProposal;
    if (draft === null) {
      return;
    }

    proposalRevisionRef.current = draft;
    setProposalRevisionMessage(null);
    await startRecording(true);
  }

  function undoProposalRevision() {
    const previous = proposalRevisionHistory.at(-1);
    if (previous === undefined || phase !== "reviewing") {
      return;
    }

    setProposalRevisionHistory((history) => history.slice(0, -1));
    setProposalRevisionMessage(
      "Letzte Überarbeitung zurückgenommen. Du kannst erneut ändern oder den Entwurf bestätigen.",
    );
    if (previous.action === "create_note") {
      setProposal(previous);
    } else {
      setCalendarCreateProposal(previous);
    }
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
      clearProposalRevision();
      completeProposal();
    } catch {
      setSaveError(
        "Die Notiz konnte nicht gespeichert werden. Prüfe den Speicherplatz und versuche es erneut.",
      );
    } finally {
      saveInProgressRef.current = false;
      setIsSaving(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView {...panResponder.panHandlers} style={styles.safeArea}>
        <ScrollView
          style={styles.homeScroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator
        >
          <View style={styles.heading}>
            <ThemedText type="smallBold" themeColor="accent">
              ORGANIZER
            </ThemedText>
            <ThemedText type="title" style={styles.title}>
              Alles an{"\n"}einem Ort.
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.subtitle}>
              Halte deine Gedanken und Notizen fest.
            </ThemedText>
          </View>

          {proposal !== null &&
          (phase === "reviewing" || phase === "idle") ? (
            <ThemedView type="backgroundElement" style={styles.proposalCard}>
              <ThemedText type="smallBold" themeColor="accent">
                VORSCHLAG FÜR EINE NEUE NOTIZ
              </ThemedText>
              {proposalRevisionMessage !== null && (
                <ThemedText type="small" themeColor="textSecondary">
                  {proposalRevisionMessage}
                </ThemedText>
              )}
              {error !== null && (
                <ThemedText
                  type="small"
                  themeColor="danger"
                  accessibilityLiveRegion="assertive"
                >
                  {error}
                </ThemedText>
              )}
              <View style={styles.proposalContent}>
                <ThemedText type="subtitle" style={styles.proposalTitle}>
                  {proposal.title}
                </ThemedText>
                <ThemedText>{proposal.content}</ThemedText>
              </View>
              {saveError !== null && (
                <ThemedText
                  type="small"
                  themeColor="danger"
                  accessibilityLiveRegion="assertive"
                >
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
                  ]}
                >
                  <ThemedText
                    type="smallBold"
                    style={[
                      styles.proposalButtonText,
                      { color: theme.background },
                    ]}
                  >
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
                  ]}
                >
                  {isSaving ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <ThemedText
                      type="smallBold"
                      style={[
                        styles.proposalButtonText,
                        { color: theme.background },
                      ]}
                    >
                      Bestätigen
                    </ThemedText>
                  )}
                </Pressable>
              </View>
              <ProposalRevisionControls
                count={proposalRevisionCount}
                canUndo={proposalRevisionHistory.length > 0}
                onRevise={() => void startProposalRevision()}
                onUndo={undoProposalRevision}
              />
            </ThemedView>
          ) : calendarCreateProposal !== null &&
            (phase === "reviewing" || phase === "idle") ? (
            <ThemedView type="backgroundElement" style={styles.proposalCard}>
              <ThemedText type="smallBold" themeColor="accent">
                KALENDERTERMIN ERSTELLEN?
              </ThemedText>
              {proposalRevisionMessage !== null && (
                <ThemedText type="small" themeColor="textSecondary">
                  {proposalRevisionMessage}
                </ThemedText>
              )}
              {error !== null && (
                <ThemedText
                  type="small"
                  themeColor="danger"
                  accessibilityLiveRegion="assertive"
                >
                  {error}
                </ThemedText>
              )}
              <View style={styles.proposalContent}>
                <ThemedText type="subtitle" style={styles.proposalTitle}>
                  {calendarCreateProposal.event.title}
                </ThemedText>
                <CalendarDetail
                  label="Datum"
                  value={formatCalendarDate(
                    calendarCreateProposal.event.startDate,
                  )}
                />
                <CalendarDetail
                  label="Zeit"
                  value={`${formatCalendarTime(calendarCreateProposal.event.startDate)} – ${formatCalendarTime(calendarCreateProposal.event.endDate)}`}
                />
                {(calendarCreateProposal.usedDefaultTitle ||
                  calendarCreateProposal.usedDefaultDateTime) && (
                  <ThemedText type="small" themeColor="textSecondary">
                    {calendarCreateProposal.usedDefaultTitle
                      ? "Kein Titel erkannt; Organizer verwendet „Neuer Termin“."
                      : ""}
                    {calendarCreateProposal.usedDefaultTitle &&
                    calendarCreateProposal.usedDefaultDateTime
                      ? " "
                      : ""}
                    {calendarCreateProposal.usedDefaultDateTime
                      ? "Kein eindeutiges Datum oder keine Startzeit erkannt; Organizer schlägt die nächste volle Stunde vor."
                      : ""}
                  </ThemedText>
                )}
                {calendarCreateProposal.usedDefaultDuration && (
                  <ThemedText type="small" themeColor="textSecondary">
                    Keine gültige Endzeit erkannt; Organizer setzt eine Stunde Dauer
                    an.
                  </ThemedText>
                )}
                {calendarCreateProposal.event.notes.length > 0 && (
                  <CalendarDetail
                    label="Beschreibung"
                    value={calendarCreateProposal.event.notes}
                  />
                )}
              </View>
              {calendarActionError !== null && (
                <ThemedText
                  type="small"
                  themeColor="danger"
                  accessibilityLiveRegion="assertive"
                >
                  {calendarActionError}
                </ThemedText>
              )}
              <View style={styles.proposalActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Erstellung des Kalendertermins abbrechen"
                  disabled={isSaving}
                  onPress={cancelCalendarReview}
                  style={({ pressed }) => [
                    styles.proposalButton,
                    { backgroundColor: theme.background },
                    pressed && styles.pressed,
                    isSaving && styles.disabled,
                  ]}
                >
                  <ThemedText type="smallBold">Abbrechen</ThemedText>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Kalendertermin ${calendarCreateProposal.event.title} erstellen`}
                  disabled={isSaving}
                  onPress={() => void confirmCalendarCreate()}
                  style={({ pressed }) => [
                    styles.proposalButton,
                    { backgroundColor: theme.accent },
                    pressed && styles.pressed,
                    isSaving && styles.disabled,
                  ]}
                >
                  {isSaving ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <ThemedText
                      type="smallBold"
                      style={[
                        styles.proposalButtonText,
                        { color: theme.background },
                      ]}
                    >
                      Erstellen
                    </ThemedText>
                  )}
                </Pressable>
              </View>
              <ProposalRevisionControls
                count={proposalRevisionCount}
                canUndo={proposalRevisionHistory.length > 0}
                onRevise={() => void startProposalRevision()}
                onUndo={undoProposalRevision}
              />
            </ThemedView>
          ) : openNoteProposal !== null && phase === "reviewing" ? (
            <ThemedView type="backgroundElement" style={styles.proposalCard}>
              <ThemedText type="smallBold" themeColor="accent">
                DIESE NOTIZ ÖFFNEN?
              </ThemedText>
              <View style={styles.proposalContent}>
                <ThemedText type="subtitle" style={styles.proposalTitle}>
                  {openNoteProposal.title}
                </ThemedText>
                <ThemedText>
                  {openNoteProposal.body.length > 0
                    ? openNoteProposal.body
                    : "Diese Notiz hat keinen Inhalt."}
                </ThemedText>
              </View>
              <View style={styles.proposalActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Öffnen der Notiz abbrechen"
                  onPress={cancelOpenNoteReview}
                  style={({ pressed }) => [
                    styles.proposalButton,
                    { backgroundColor: theme.background },
                    pressed && styles.pressed,
                  ]}
                >
                  <ThemedText type="smallBold">Abbrechen</ThemedText>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Notiz öffnen: ${openNoteProposal.title}`}
                  onPress={confirmOpenNote}
                  style={({ pressed }) => [
                    styles.proposalButton,
                    { backgroundColor: theme.accent },
                    pressed && styles.pressed,
                  ]}
                >
                  <ThemedText
                    type="smallBold"
                    style={[
                      styles.proposalButtonText,
                      { color: theme.background },
                    ]}
                  >
                    Notiz öffnen
                  </ThemedText>
                </Pressable>
              </View>
            </ThemedView>
          ) : editNote !== null &&
            editPatches !== null &&
            phase === "reviewing" ? (
            <ThemedView type="backgroundElement" style={styles.proposalCard}>
              <ThemedText type="smallBold" themeColor="accent">
                ÄNDERUNG AN „{editNote.title}“
              </ThemedText>
              {editPatchIndex < editPatches.length ? (
                <>
                  <ThemedText type="small" themeColor="textSecondary">
                    Abschnitt {editPatchIndex + 1} von {editPatches.length}.
                    Entscheide für jede Änderung einzeln.
                  </ThemedText>
                  <View style={styles.proposalContent}>
                    <ThemedText type="small" themeColor="textSecondary">
                      {editPatches[editPatchIndex].beforeContext}
                    </ThemedText>
                    <ThemedView
                      type="backgroundSelected"
                      style={styles.patchText}
                    >
                      <ThemedText themeColor="danger">
                        {editPatches[editPatchIndex].originalText}
                      </ThemedText>
                    </ThemedView>
                    <ThemedText type="smallBold" themeColor="accent">
                      Vorgeschlagener Text
                    </ThemedText>
                    <ThemedView
                      type="backgroundSelected"
                      style={styles.patchText}
                    >
                      <ThemedText themeColor="accent">
                        {editPatches[editPatchIndex].replacementText ||
                          "Text entfernen"}
                      </ThemedText>
                    </ThemedView>
                    <ThemedText type="small" themeColor="textSecondary">
                      {editPatches[editPatchIndex].afterContext}
                    </ThemedText>
                  </View>
                  {editReviewError !== null && (
                    <ThemedText
                      type="small"
                      themeColor="danger"
                      accessibilityLiveRegion="assertive"
                    >
                      {editReviewError}
                    </ThemedText>
                  )}
                  <View style={styles.proposalActions}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={editReviewError !== null}
                      onPress={() => decideEditPatch(false)}
                      style={({ pressed }) => [
                        styles.proposalButton,
                        { backgroundColor: theme.danger },
                        pressed && styles.pressed,
                        editReviewError !== null && styles.disabled,
                      ]}
                    >
                      <ThemedText
                        type="smallBold"
                        style={[
                          styles.proposalButtonText,
                          { color: theme.background },
                        ]}
                      >
                        Ablehnen
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      disabled={editReviewError !== null}
                      onPress={() => decideEditPatch(true)}
                      style={({ pressed }) => [
                        styles.proposalButton,
                        { backgroundColor: theme.accent },
                        pressed && styles.pressed,
                        editReviewError !== null && styles.disabled,
                      ]}
                    >
                      <ThemedText
                        type="smallBold"
                        style={[
                          styles.proposalButtonText,
                          { color: theme.background },
                        ]}
                      >
                        Annehmen
                      </ThemedText>
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <ThemedText type="small" themeColor="textSecondary">
                    {isSaving
                      ? "Deine angenommenen Änderungen werden gespeichert ..."
                      : "Alle Abschnitte wurden entschieden."}
                  </ThemedText>
                  {editReviewError !== null && (
                    <ThemedText
                      type="small"
                      themeColor="danger"
                      accessibilityLiveRegion="assertive"
                    >
                      {editReviewError}
                    </ThemedText>
                  )}
                  <View style={styles.proposalActions}>
                    {editReviewError !== null && (
                      <Pressable
                        accessibilityRole="button"
                        disabled={isSaving}
                        onPress={() => void saveAcceptedEdit()}
                        style={({ pressed }) => [
                          styles.proposalButton,
                          { backgroundColor: theme.accent },
                          pressed && styles.pressed,
                          isSaving && styles.disabled,
                        ]}
                      >
                        <ThemedText
                          type="smallBold"
                          style={[
                            styles.proposalButtonText,
                            { color: theme.background },
                          ]}
                        >
                          Erneut versuchen
                        </ThemedText>
                      </Pressable>
                    )}
                  </View>
                </>
              )}
              {(editPatchIndex < editPatches.length ||
                editReviewError !== null) && (
                <Pressable
                  accessibilityRole="button"
                  disabled={isSaving}
                  onPress={cancelEditReview}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <ThemedText type="small" themeColor="textSecondary">
                    Prüfung abbrechen
                  </ThemedText>
                </Pressable>
              )}
            </ThemedView>
          ) : calendarDeleteProposal !== null && phase === "reviewing" ? (
            <ThemedView type="backgroundElement" style={styles.proposalCard}>
              <ThemedText type="smallBold" themeColor="danger">
                DIESEN KALENDERTERMIN LÖSCHEN?
              </ThemedText>
              <View style={styles.proposalContent}>
                <ThemedText type="subtitle" style={styles.proposalTitle}>
                  {calendarDeleteProposal.event.title}
                </ThemedText>
                <CalendarDetail
                  label="Datum"
                  value={formatCalendarDate(
                    calendarDeleteProposal.event.startDate,
                  )}
                />
                <CalendarDetail
                  label="Zeit"
                  value={
                    calendarDeleteProposal.event.allDay
                      ? "Ganztägig"
                      : `${formatCalendarTime(calendarDeleteProposal.event.startDate)} – ${formatCalendarTime(calendarDeleteProposal.event.endDate)}`
                  }
                />
                <CalendarDetail
                  label="Kalender"
                  value={calendarDeleteProposal.calendarTitle}
                />
              </View>
              {calendarActionError !== null && (
                <ThemedText
                  type="small"
                  themeColor="danger"
                  accessibilityLiveRegion="assertive"
                >
                  {calendarActionError}
                </ThemedText>
              )}
              <View style={styles.proposalActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Löschen des Kalendertermins abbrechen"
                  disabled={isSaving}
                  onPress={cancelCalendarReview}
                  style={({ pressed }) => [
                    styles.proposalButton,
                    { backgroundColor: theme.background },
                    pressed && styles.pressed,
                    isSaving && styles.disabled,
                  ]}
                >
                  <ThemedText type="smallBold">Abbrechen</ThemedText>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Kalendertermin ${calendarDeleteProposal.event.title} löschen`}
                  disabled={isSaving}
                  onPress={() => void confirmCalendarDelete()}
                  style={({ pressed }) => [
                    styles.proposalButton,
                    { backgroundColor: theme.danger },
                    pressed && styles.pressed,
                    isSaving && styles.disabled,
                  ]}
                >
                  {isSaving ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <ThemedText
                      type="smallBold"
                      style={[
                        styles.proposalButtonText,
                        { color: theme.background },
                      ]}
                    >
                      Termin löschen
                    </ThemedText>
                  )}
                </Pressable>
              </View>
            </ThemedView>
          ) : deleteNoteProposal !== null && phase === "reviewing" ? (
            <ThemedView type="backgroundElement" style={styles.proposalCard}>
              <ThemedText type="smallBold" themeColor="danger">
                DIESE NOTIZ LÖSCHEN?
              </ThemedText>
              <View style={styles.proposalContent}>
                <ThemedText type="subtitle" style={styles.proposalTitle}>
                  {deleteNoteProposal.title}
                </ThemedText>
                <ThemedText>
                  {deleteNoteProposal.body.length > 0
                    ? deleteNoteProposal.body
                    : "Diese Notiz hat keinen Inhalt."}
                </ThemedText>
              </View>
              {deleteError !== null && (
                <ThemedText
                  type="small"
                  themeColor="danger"
                  accessibilityLiveRegion="assertive"
                >
                  {deleteError}
                </ThemedText>
              )}
              <View style={styles.proposalActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Löschen der Notiz abbrechen"
                  disabled={isSaving}
                  onPress={cancelDeleteReview}
                  style={({ pressed }) => [
                    styles.proposalButton,
                    { backgroundColor: theme.background },
                    pressed && styles.pressed,
                    isSaving && styles.disabled,
                  ]}
                >
                  <ThemedText type="smallBold">Abbrechen</ThemedText>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Notiz löschen: ${deleteNoteProposal.title}`}
                  disabled={isSaving}
                  onPress={() => void confirmDeleteNote()}
                  style={({ pressed }) => [
                    styles.proposalButton,
                    { backgroundColor: theme.danger },
                    pressed && styles.pressed,
                    isSaving && styles.disabled,
                  ]}
                >
                  {isSaving ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <ThemedText
                      type="smallBold"
                      style={[
                        styles.proposalButtonText,
                        { color: theme.background },
                      ]}
                    >
                      Notiz löschen
                    </ThemedText>
                  )}
                </Pressable>
              </View>
            </ThemedView>
          ) : calendarDeleteCandidates !== null && phase === "reviewing" ? (
            <ThemedView type="backgroundElement" style={styles.proposalCard}>
              <ThemedText type="smallBold" themeColor="accent">
                WELCHEN TERMIN MÖCHTEST DU LÖSCHEN?
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Mehrere Termine passen. Wähle den richtigen aus; vor dem
                Löschen erhältst du noch eine Bestätigung.
              </ThemedText>
              <View style={styles.noteChoices}>
                {calendarDeleteCandidates.map((candidate) => (
                  <Pressable
                    key={`${candidate.event.calendarId}:${candidate.event.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Kalendertermin zum Löschen auswählen: ${candidate.event.title}, ${formatCalendarDate(candidate.event.startDate)}`}
                    onPress={() => selectCalendarDeleteCandidate(candidate)}
                    style={({ pressed }) => [
                      styles.noteChoice,
                      { backgroundColor: theme.background },
                      pressed && styles.pressed,
                    ]}
                  >
                    <ThemedText type="smallBold">
                      {candidate.event.title}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatCalendarDate(candidate.event.startDate)}
                      {" · "}
                      {candidate.event.allDay
                        ? "Ganztägig"
                        : `${formatCalendarTime(candidate.event.startDate)} – ${formatCalendarTime(candidate.event.endDate)}`}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {candidate.calendarTitle}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={cancelCalendarReview}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.pressed,
                ]}
              >
                <ThemedText type="small" themeColor="textSecondary">
                  Abbrechen
                </ThemedText>
              </Pressable>
            </ThemedView>
          ) : openNoteCandidates !== null && phase === "reviewing" ? (
            <ThemedView type="backgroundElement" style={styles.proposalCard}>
              <ThemedText type="smallBold" themeColor="accent">
                {candidateAction === "open_note"
                  ? "WELCHE NOTIZ MÖCHTEST DU ÖFFNEN?"
                  : candidateAction === "delete_note"
                    ? "WELCHE NOTIZ SOLL GELÖSCHT WERDEN?"
                    : "WELCHE NOTIZ MÖCHTEST DU ÄNDERN?"}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Mehrere Notizen passen zu deiner Anfrage. Wähle die richtige
                aus.
              </ThemedText>
              <View style={styles.noteChoices}>
                {openNoteCandidates.map((note) => (
                  <Pressable
                    key={note.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Notiz ${
                      candidateAction === "open_note"
                        ? "öffnen"
                        : candidateAction === "delete_note"
                          ? "zum Löschen auswählen"
                          : "bearbeiten"
                    }: ${note.title}`}
                    onPress={() => selectCandidate(note)}
                    style={({ pressed }) => [
                      styles.noteChoice,
                      { backgroundColor: theme.background },
                      pressed && styles.pressed,
                    ]}
                  >
                    <ThemedText type="smallBold">{note.title}</ThemedText>
                    {note.body.length > 0 && (
                      <ThemedText
                        type="small"
                        themeColor="textSecondary"
                        numberOfLines={2}
                      >
                        {note.body}
                      </ThemedText>
                    )}
                  </Pressable>
                ))}
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={cancelOpenNoteSelection}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.pressed,
                ]}
              >
                <ThemedText type="small" themeColor="textSecondary">
                  Abbrechen
                </ThemedText>
              </Pressable>
            </ThemedView>
          ) : (
            <View style={styles.voiceSection}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  phase === "recording"
                    ? "Aufnahme stoppen"
                    : "Aufnahme starten"
                }
                accessibilityState={{
                  disabled: phase === "requesting" || phase === "processing",
                }}
                disabled={phase === "requesting" || phase === "processing"}
                onPress={
                  phase === "recording"
                    ? stopAndRequestProposal
                    : startNewRequest
                }
                style={({ pressed }) => [
                  styles.microphoneButton,
                  {
                    backgroundColor:
                      phase === "recording" ? theme.danger : theme.accent,
                  },
                  pressed && styles.pressed,
                ]}
              >
                {phase === "requesting" || phase === "processing" ? (
                  <ActivityIndicator color="#ffffff" size="large" />
                ) : phase === "recording" ? (
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
                themeColor={phase === "recording" ? "danger" : "text"}
              >
                {getRecordingStatus(phase, durationMillis)}
              </ThemedText>

              {phase === "recording" && (
                <Pressable
                  accessibilityRole="button"
                  onPress={cancelRecording}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <ThemedText type="small" themeColor="textSecondary">
                    Aufnahme abbrechen
                  </ThemedText>
                </Pressable>
              )}

              {phase === "processing" && (
                <Pressable
                  accessibilityRole="button"
                  onPress={cancelGeminiRequest}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <ThemedText type="small" themeColor="textSecondary">
                    Anfrage abbrechen
                  </ThemedText>
                </Pressable>
              )}

              {phase === "ready" && recordingUri !== null && (
                <Pressable
                  accessibilityRole="button"
                  onPress={discardRecording}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed && styles.pressed,
                  ]}
                >
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
                  style={styles.statusMessage}
                >
                  {error}
                </ThemedText>
              )}

              {notice !== null && error === null && (
                <ThemedText
                  accessibilityLiveRegion="polite"
                  type="small"
                  themeColor="textSecondary"
                  style={styles.statusMessage}
                >
                  {notice}
                </ThemedText>
              )}

              {phase === "idle" && error === null && notice === null && (
                <ThemedText
                  type="small"
                  themeColor="textSecondary"
                  style={styles.voiceHint}
                >
                  Tippe auf das Mikrofon, um deine Anfrage aufzunehmen.
                </ThemedText>
              )}
            </View>
          )}

          {deletedNote !== null ? (
            <ThemedView type="backgroundElement" style={styles.savedNoteBanner}>
              <View style={styles.savedNoteText}>
                <ThemedText type="smallBold">Notiz gelöscht</ThemedText>
                <ThemedText
                  type="small"
                  themeColor="textSecondary"
                  numberOfLines={1}
                >
                  {deletedNote.title}
                </ThemedText>
                {restoreError !== null && (
                  <ThemedText
                    type="small"
                    themeColor="danger"
                    accessibilityLiveRegion="assertive"
                  >
                    {restoreError}
                  </ThemedText>
                )}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Gelöschte Notiz wiederherstellen: ${deletedNote.title}`}
                disabled={isSaving}
                onPress={() => void restoreNote()}
                style={({ pressed }) => [
                  styles.viewNoteButton,
                  pressed && styles.pressed,
                  isSaving && styles.disabled,
                ]}
              >
                {isSaving ? (
                  <ActivityIndicator color={theme.accent} />
                ) : (
                  <ThemedText type="smallBold" themeColor="accent">
                    Wiederherstellen
                  </ThemedText>
                )}
              </Pressable>
            </ThemedView>
          ) : deletedCalendarEvent !== null ? (
            <ThemedView type="backgroundElement" style={styles.savedNoteBanner}>
              <View style={styles.savedNoteText}>
                <ThemedText type="smallBold">
                  Kalendertermin gelöscht
                </ThemedText>
                <ThemedText
                  type="small"
                  themeColor="textSecondary"
                  numberOfLines={1}
                >
                  {deletedCalendarEvent.event.title}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatCalendarDate(deletedCalendarEvent.event.startDate)}
                  {" · "}
                  {deletedCalendarEvent.event.allDay
                    ? "Ganztägig"
                    : `${formatCalendarTime(deletedCalendarEvent.event.startDate)} – ${formatCalendarTime(deletedCalendarEvent.event.endDate)}`}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Wiederherstellen legt den Termin neu an; seine ursprüngliche
                  Kalender-ID kann sich ändern.
                </ThemedText>
                {calendarRestoreError !== null && (
                  <ThemedText
                    type="small"
                    themeColor="danger"
                    accessibilityLiveRegion="assertive"
                  >
                    {calendarRestoreError}
                  </ThemedText>
                )}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Gelöschten Kalendertermin wiederherstellen: ${deletedCalendarEvent.event.title}`}
                disabled={isSaving}
                onPress={() => void restoreCalendar()}
                style={({ pressed }) => [
                  styles.viewNoteButton,
                  pressed && styles.pressed,
                  isSaving && styles.disabled,
                ]}
              >
                {isSaving ? (
                  <ActivityIndicator color={theme.accent} />
                ) : (
                  <ThemedText type="smallBold" themeColor="accent">
                    Wiederherstellen
                  </ThemedText>
                )}
              </Pressable>
            </ThemedView>
          ) : (
            savedNote !== null && (
              <ThemedView
                type="backgroundElement"
                style={styles.savedNoteBanner}
              >
                <View style={styles.savedNoteText}>
                  <ThemedText type="smallBold">Notiz gespeichert</ThemedText>
                  <ThemedText
                    type="small"
                    themeColor="textSecondary"
                    numberOfLines={1}
                  >
                    {savedNote.title}
                  </ThemedText>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Gespeicherte Notiz öffnen: ${savedNote.title}`}
                  onPress={() =>
                    router.push({
                      pathname: "/explore",
                      params: { noteId: savedNote.id },
                    })
                  }
                  style={({ pressed }) => [
                    styles.viewNoteButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <ThemedText type="smallBold" themeColor="accent">
                    Ansehen
                  </ThemedText>
                </Pressable>
              </ThemedView>
            )
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Meine Notizen öffnen"
            onPress={() => router.push("/explore")}
            style={({ pressed }) => [
              styles.notesButton,
              pressed && styles.pressed,
            ]}
          >
            <ThemedText type="smallBold" style={{ color: theme.accent }}>
              Meine Notizen ansehen
            </ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function CalendarDetail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.calendarDetail}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <ThemedText>{value}</ThemedText>
    </View>
  );
}

function ProposalRevisionControls({
  count,
  canUndo,
  onRevise,
  onUndo,
}: {
  count: number;
  canUndo: boolean;
  onRevise: () => void;
  onUndo: () => void;
}) {
  return (
    <View style={styles.proposalRevisionActions}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Vorschlag sprachlich ändern, ${count} von 5 Änderungen verwendet`}
        disabled={count >= 5}
        onPress={onRevise}
        style={({ pressed }) => [
          styles.proposalRevisionButton,
          pressed && styles.pressed,
          count >= 5 && styles.disabled,
        ]}
      >
        <ThemedText type="smallBold">
          {count >= 5 ? "Limit erreicht" : `Ändern (${count}/5)`}
        </ThemedText>
      </Pressable>
      {canUndo && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Letzte Änderung am Vorschlag rückgängig machen"
          onPress={onUndo}
          style={({ pressed }) => [
            styles.proposalRevisionButton,
            pressed && styles.pressed,
          ]}
        >
          <ThemedText type="smallBold">Rückgängig</ThemedText>
        </Pressable>
      )}
    </View>
  );
}

function getRecordingStatus(
  phase: VoiceRecordingPhase,
  durationMillis: number,
): string {
  switch (phase) {
    case "requesting":
      return "Mikrofon wird vorbereitet ...";
    case "recording":
      return `Aufnahme läuft · ${formatDuration(durationMillis)}`;
    case "processing":
      return "Anfrage wird verarbeitet ...";
    case "ready":
      return "Aufnahme abgeschlossen";
    case "reviewing":
      return "Aktion prüfen";
    case "idle":
      return "Bereit für deine Anfrage";
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
  },
  safeArea: {
    flex: 1,
    width: "100%",
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
  },
  homeScroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.five,
    paddingBottom: Platform.OS === "web" ? 96 : Spacing.five,
  },
  heading: {
    alignItems: "center",
    gap: Spacing.two,
  },
  title: {
    textAlign: "center",
    marginTop: Spacing.two,
  },
  subtitle: {
    textAlign: "center",
  },
  voiceSection: {
    alignItems: "center",
    gap: Spacing.three,
  },
  microphoneButton: {
    width: 216,
    height: 216,
    borderRadius: 108,
    justifyContent: "center",
    alignItems: "center",
  },
  microphoneIcon: {
    alignItems: "center",
  },
  microphoneCapsule: {
    width: 36,
    height: 64,
    borderWidth: 4,
    borderColor: "#ffffff",
    borderRadius: 20,
  },
  microphoneCradle: {
    width: 64,
    height: 36,
    marginTop: -25,
    borderColor: "#ffffff",
    borderWidth: 4,
    borderTopWidth: 0,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  microphoneStem: {
    width: 4,
    height: 16,
    backgroundColor: "#ffffff",
  },
  microphoneBase: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#ffffff",
  },
  stopIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: "#ffffff",
  },
  voiceHint: {
    textAlign: "center",
  },
  proposalCard: {
    alignSelf: "stretch",
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: 20,
  },
  proposalContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.two,
  },
  patchText: {
    padding: Spacing.two,
    borderRadius: 12,
  },
  proposalTitle: {
    fontSize: 24,
    lineHeight: 32,
  },
  calendarDetail: {
    gap: Spacing.one,
  },
  proposalActions: {
    flexDirection: "row",
    gap: Spacing.two,
  },
  proposalRevisionActions: {
    flexDirection: "row",
    gap: Spacing.two,
  },
  proposalRevisionButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.two,
  },
  noteChoices: {
    gap: Spacing.two,
  },
  noteChoice: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: 14,
    minHeight: 56,
  },
  proposalButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.two,
  },
  proposalButtonText: {
    color: "#ffffff",
  },
  disabled: {
    opacity: 0.5,
  },
  savedNoteBanner: {
    alignSelf: "stretch",
    minHeight: 64,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  savedNoteText: {
    flex: 1,
    gap: Spacing.one,
  },
  viewNoteButton: {
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: "#ffffff22",
  },
  statusMessage: {
    maxWidth: 340,
    textAlign: "center",
  },
  secondaryButton: {
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.three,
  },
  notesButton: {
    minHeight: 56,
    alignSelf: "stretch",
    borderRadius: 18,
    paddingHorizontal: Spacing.four,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#80808055",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pressed: {
    opacity: 0.7,
  },
});
