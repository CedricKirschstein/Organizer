import {
    AudioModule,
    RecordingPresets,
    setAudioModeAsync,
    useAudioRecorder,
    useAudioRecorderState,
    type RecordingOptions,
} from "expo-audio";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import {
    GeminiServiceError,
    interpretVoiceRequest,
    type GeminiVoiceResult,
    type GeminiProposalDraft,
    type VoiceRequestTimingStage,
    type VoiceRequestTimings,
} from "@/services/gemini";
import { getNotes, type Note } from "@/services/notes";
import { releaseTemporaryRecording } from "@/services/temporary-audio";

export type VoiceRecordingPhase =
  | "idle"
  | "requesting"
  | "recording"
  | "processing"
  | "ready"
  | "reviewing";

const recordingOptions: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  directory: "cache",
};

function getErrorMessage(error: unknown): string {
  if (
    error instanceof Error &&
    /NotAllowedError|Permission|denied/i.test(error.message)
  ) {
    return "Der Mikrofonzugriff wurde verweigert. Erlaube den Zugriff in den Geräteeinstellungen oder im Browser.";
  }

  if (Platform.OS === "web") {
    return "Die Aufnahme ist fehlgeschlagen. Prüfe die Mikrofonberechtigung und verwende im Browser eine sichere Verbindung (HTTPS oder localhost).";
  }

  return "Die Aufnahme ist fehlgeschlagen. Prüfe die Mikrofonberechtigung und versuche es erneut.";
}

export function useVoiceRecording() {
  const recorder = useAudioRecorder(recordingOptions);
  const recorderState = useAudioRecorderState(recorder);
  const [phase, setPhase] = useState<VoiceRecordingPhase>("idle");
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const requestTimingsRef = useRef<VoiceRequestTimings>({});
  const phaseRef = useRef<VoiceRecordingPhase>("idle");
  const pendingUriRef = useRef<string | null>(null);
  const stopPromiseRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(true);

  const updatePhase = useCallback((nextPhase: VoiceRecordingPhase) => {
    phaseRef.current = nextPhase;
    setPhase(nextPhase);
  }, []);

  const recordTiming = useCallback(
    (stage: VoiceRequestTimingStage, durationMs: number) => {
      requestTimingsRef.current[stage] = durationMs;
    },
    [],
  );

  const releasePendingRecording = useCallback(async () => {
    const pendingUri = pendingUriRef.current;
    if (pendingUri === null) {
      return;
    }

    await releaseTemporaryRecording(pendingUri);
    pendingUriRef.current = null;
    if (mountedRef.current) {
      setRecordingUri(null);
    }
  }, []);

  const resetAudioMode = useCallback(async () => {
    try {
      await setAudioModeAsync({ allowsRecording: false });
    } catch (resetError) {
      console.error(
        "Unable to reset the audio mode after recording.",
        resetError,
      );
    }
  }, []);

  const stopRecorder = useCallback(async () => {
    const activeStop = stopPromiseRef.current;
    if (activeStop !== null) {
      await activeStop;
    } else if (recorder.isRecording) {
      const stopPromise = recorder.stop();
      stopPromiseRef.current = stopPromise;
      try {
        await stopPromise;
      } finally {
        if (stopPromiseRef.current === stopPromise) {
          stopPromiseRef.current = null;
        }
      }
    }
    await resetAudioMode();
  }, [recorder, resetAudioMode]);

  const startRecording = useCallback(async (forRevision = false) => {
    if (
      phaseRef.current !== "idle" &&
      !(forRevision && phaseRef.current === "reviewing")
    ) {
      return;
    }

    updatePhase("requesting");
    setError(null);
    setNotice(null);
    requestTimingsRef.current = {};

    try {
      if (
        Platform.OS === "web" &&
        (typeof navigator === "undefined" ||
          !navigator.mediaDevices?.getUserMedia)
      ) {
        throw new Error("Microphone is not available in this browser context.");
      }

      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        throw new Error("Microphone permission denied.");
      }

      await releasePendingRecording();
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      updatePhase("recording");
    } catch (recordingError) {
      console.error("Unable to start audio recording.", recordingError);
      await resetAudioMode();
      updatePhase(
        recorder.isRecording
          ? "recording"
          : pendingUriRef.current === null
            ? "idle"
            : "ready",
      );
      setError(getErrorMessage(recordingError));
    }
  }, [recorder, releasePendingRecording, resetAudioMode, updatePhase]);

  const finishRecording = useCallback(
    async (
      signal?: AbortSignal,
      revisionDraft?: GeminiProposalDraft,
    ): Promise<GeminiVoiceResult | null> => {
      if (phaseRef.current !== "recording") {
        return null;
      }

      const processingStartedAt = Date.now();
      requestTimingsRef.current = {
        recordingDuration: recorderState.durationMillis,
      };
      updatePhase("processing");
      setError(null);
      setNotice(null);

      try {
        const stopStartedAt = Date.now();
        try {
          await stopRecorder();
        } finally {
          recordTiming("stopRecording", Date.now() - stopStartedAt);
        }
        const uri = recorder.uri;
        const status = recorder.getStatus();

        if (uri === null || status.fileSize <= 0) {
          if (uri !== null) {
            pendingUriRef.current = uri;
            setRecordingUri(uri);
            await releasePendingRecording();
          }
          setError(
            "Die Aufnahme war leer. Bitte nimm deine Anfrage erneut auf.",
          );
          updatePhase("idle");
          return null;
        }

        pendingUriRef.current = uri;
        setRecordingUri(uri);
        let notes: Note[];
        const notesLoadStartedAt = Date.now();
        try {
          notes = await getNotes();
        } catch {
          throw new GeminiServiceError(
            "NOTE_STORAGE",
            "Gespeicherte Notizen konnten nicht geladen werden. Bitte versuche es erneut.",
          );
        } finally {
          recordTiming("loadNotes", Date.now() - notesLoadStartedAt);
        }

        const result = await interpretVoiceRequest(
          {
            uri,
            mimeType: Platform.OS === "web" ? "audio/webm" : "audio/mp4",
          },
          notes,
          signal,
          recordTiming,
          revisionDraft,
        );
        await releasePendingRecording();
        updatePhase("reviewing");
        setNotice(
          revisionDraft !== undefined
            ? "Überarbeiteter Vorschlag. Bitte prüfe alle Angaben erneut."
            : result.action === "create_note"
            ? "Prüfe den vollständigen Notizvorschlag, bevor du ihn speicherst."
            : result.action === "create_calendar_event"
              ? "Prüfe alle Termindetails, bevor du den Eintrag bestätigst."
              : result.action === "delete_calendar_event"
                ? "Prüfe die passenden Termine, bevor du einen auswählst."
                  : result.action === "update_calendar_event"
                    ? "Prüfe den Termin und die vorgeschlagene neue Zeit, bevor du ihn verschiebst."
                  : "Prüfe die passende Notiz.",
        );
        return result;
      } catch (recordingError) {
        let cleanupFailed = false;
        try {
          await releasePendingRecording();
        } catch {
          cleanupFailed = true;
        }

        await resetAudioMode();
        updatePhase(
          revisionDraft !== undefined
            ? "reviewing"
            : recorder.isRecording
              ? "recording"
              : "idle",
        );
        if (cleanupFailed) {
          setError(
            "Die Anfrage ist fehlgeschlagen und die temporäre Aufnahme konnte nicht freigegeben werden.",
          );
        } else if (recordingError instanceof GeminiServiceError) {
          setError(recordingError.message);
        } else {
          setError(getErrorMessage(recordingError));
        }
        return null;
      } finally {
        recordTiming("totalProcessing", Date.now() - processingStartedAt);
        console.info(
          `[Voice request timings]\n${JSON.stringify(requestTimingsRef.current, null, 2)}`,
        );
      }
    },
    [
      recorder,
      recorderState.durationMillis,
      releasePendingRecording,
      recordTiming,
      resetAudioMode,
      stopRecorder,
      updatePhase,
    ],
  );

  const rejectProposal = useCallback(() => {
    if (phaseRef.current !== "reviewing") {
      return;
    }

    updatePhase("idle");
    setNotice("Vorschlag abgelehnt. Es wurde keine Notiz gespeichert.");
  }, [updatePhase]);

  const completeProposal = useCallback(() => {
    if (phaseRef.current !== "reviewing") {
      return;
    }

    updatePhase("idle");
    setNotice("Notiz gespeichert.");
  }, [updatePhase]);

  const completeOpenNote = useCallback(
    (opened: boolean) => {
      if (phaseRef.current !== "reviewing") {
        return;
      }

      updatePhase("idle");
      setNotice(
        opened
          ? "Notiz geöffnet."
          : "Keine passende Notiz gefunden. Du kannst es anders formulieren.",
      );
    },
    [updatePhase],
  );

  const completeEditReview = useCallback(
    (saved: boolean) => {
      if (phaseRef.current !== "reviewing") {
        return;
      }

      updatePhase("idle");
      setNotice(
        saved
          ? "Notiz aktualisiert."
          : "Keine Änderungen angenommen. Die Notiz blieb unverändert.",
      );
    },
    [updatePhase],
  );

  const completeDeleteNote = useCallback(
    (outcome: "deleted" | "not_found" | "cancelled") => {
      if (phaseRef.current !== "reviewing") {
        return;
      }

      updatePhase("idle");
      setNotice(
        outcome === "deleted"
          ? "Notiz gelöscht. Du kannst sie auf dem Startbildschirm wiederherstellen."
          : outcome === "not_found"
            ? "Keine passende Notiz gefunden. Es wurde nichts gelöscht."
            : "Löschen abgebrochen. Die Notiz blieb unverändert.",
      );
    },
    [updatePhase],
  );

  const completeCalendarAction = useCallback(
    (
      outcome:
        | "created"
        | "updated"
        | "update_undone"
        | "deleted"
        | "restored"
        | "restored_elsewhere"
        | "cancelled"
        | "not_found",
    ) => {
      const canCompleteWhileIdle =
        outcome === "restored" ||
        outcome === "restored_elsewhere" ||
        outcome === "update_undone";
      if (!canCompleteWhileIdle && phaseRef.current !== "reviewing") {
        return;
      }

      if (phaseRef.current === "reviewing") {
        updatePhase("idle");
      }
      const noticeByOutcome: Record<typeof outcome, string> = {
        created: "Kalendertermin erstellt.",
        updated: "Kalendertermin verschoben.",
        update_undone: "Verschiebung rückgängig gemacht.",
        deleted: "Kalendertermin gelöscht.",
        restored: "Kalendertermin wiederhergestellt.",
        restored_elsewhere:
          "Kalendertermin in einem anderen beschreibbaren Kalender wiederhergestellt. Die ursprüngliche Kalenderzuordnung war nicht verfügbar.",
        cancelled: "Kalenderaktion abgebrochen. Der Kalender blieb unverändert.",
        not_found:
          "Kein passender Kalendertermin gefunden. Es wurde nichts geändert.",
      };
      setNotice(noticeByOutcome[outcome]);
    },
    [updatePhase],
  );

  const completeNoteRestore = useCallback(() => {
    setNotice("Notiz wiederhergestellt.");
  }, []);

  const cancelOpenNote = useCallback(() => {
    if (phaseRef.current !== "reviewing") {
      return;
    }

    updatePhase("idle");
    setNotice("Notiz wurde nicht geöffnet.");
  }, [updatePhase]);

  const cancelRecording = useCallback(async () => {
    if (phaseRef.current !== "recording") {
      return;
    }

    updatePhase("processing");
    setError(null);
    try {
      await stopRecorder();
      const uri = recorder.uri;
      if (uri !== null) {
        pendingUriRef.current = uri;
        setRecordingUri(uri);
        await releasePendingRecording();
      }
      updatePhase(recorder.isRecording ? "recording" : "idle");
      setNotice("Aufnahme verworfen. Du kannst direkt eine neue starten.");
    } catch (recordingError) {
      console.error("Unable to cancel audio recording.", recordingError);
      updatePhase(
        recorder.isRecording
          ? "recording"
          : pendingUriRef.current === null
            ? "idle"
            : "ready",
      );
      setError(
        "Die Aufnahme konnte nicht sauber abgebrochen werden. Bitte versuche es erneut.",
      );
    }
  }, [recorder, releasePendingRecording, stopRecorder, updatePhase]);

  const discardRecording = useCallback(async () => {
    if (phaseRef.current !== "ready") {
      return;
    }

    updatePhase("processing");
    setError(null);
    try {
      await releasePendingRecording();
      updatePhase("idle");
      setNotice("Aufnahme verworfen. Du kannst direkt eine neue starten.");
    } catch (recordingError) {
      console.error(
        "Unable to discard temporary audio recording.",
        recordingError,
      );
      updatePhase("ready");
      setError(
        "Die temporäre Aufnahme konnte nicht freigegeben werden. Bitte versuche es erneut.",
      );
    }
  }, [releasePendingRecording, updatePhase]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void (async () => {
        await stopRecorder();

        const pendingUri = pendingUriRef.current ?? recorder.uri;
        if (pendingUri !== null) {
          await releaseTemporaryRecording(pendingUri);
          pendingUriRef.current = null;
        }
      })().catch((cleanupError: unknown) => {
        console.error(
          "Unable to release temporary audio on unmount.",
          cleanupError,
        );
      });
    };
  }, [recorder, stopRecorder]);

  return {
    phase,
    recordingUri,
    durationMillis: recorderState.durationMillis,
    error,
    notice,
    startRecording,
    finishRecording,
    cancelRecording,
    discardRecording,
    rejectProposal,
    completeProposal,
    completeOpenNote,
    completeEditReview,
    completeDeleteNote,
    completeCalendarAction,
    completeNoteRestore,
    cancelOpenNote,
  };
}
