import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import {
  createNoteProposal,
  type GeminiNoteProposal,
  GeminiServiceError,
} from '@/services/gemini';
import { releaseTemporaryRecording } from '@/services/temporary-audio';

export type VoiceRecordingPhase =
  | 'idle'
  | 'requesting'
  | 'recording'
  | 'processing'
  | 'ready'
  | 'reviewing';

const recordingOptions: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  directory: 'cache',
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && /NotAllowedError|Permission|denied/i.test(error.message)) {
    return 'Der Mikrofonzugriff wurde verweigert. Erlaube den Zugriff in den Geräteeinstellungen oder im Browser.';
  }

  if (Platform.OS === 'web') {
    return 'Die Aufnahme ist fehlgeschlagen. Prüfe die Mikrofonberechtigung und verwende im Browser eine sichere Verbindung (HTTPS oder localhost).';
  }

  return 'Die Aufnahme ist fehlgeschlagen. Prüfe die Mikrofonberechtigung und versuche es erneut.';
}

export function useVoiceRecording() {
  const recorder = useAudioRecorder(recordingOptions);
  const recorderState = useAudioRecorderState(recorder);
  const [phase, setPhase] = useState<VoiceRecordingPhase>('idle');
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const phaseRef = useRef<VoiceRecordingPhase>('idle');
  const pendingUriRef = useRef<string | null>(null);
  const stopPromiseRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(true);

  const updatePhase = useCallback((nextPhase: VoiceRecordingPhase) => {
    phaseRef.current = nextPhase;
    setPhase(nextPhase);
  }, []);

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
      console.error('Unable to reset the audio mode after recording.', resetError);
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

  const startRecording = useCallback(async () => {
    if (phaseRef.current !== 'idle') {
      return;
    }

    updatePhase('requesting');
    setError(null);
    setNotice(null);

    try {
      if (
        Platform.OS === 'web' &&
        (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia)
      ) {
        throw new Error('Microphone is not available in this browser context.');
      }

      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Microphone permission denied.');
      }

      await releasePendingRecording();
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      updatePhase('recording');
    } catch (recordingError) {
      console.error('Unable to start audio recording.', recordingError);
      await resetAudioMode();
      updatePhase(
        recorder.isRecording ? 'recording' : pendingUriRef.current === null ? 'idle' : 'ready',
      );
      setError(getErrorMessage(recordingError));
    }
  }, [recorder, releasePendingRecording, resetAudioMode, updatePhase]);

  const finishRecording = useCallback(
    async (signal?: AbortSignal): Promise<GeminiNoteProposal | null> => {
      if (phaseRef.current !== 'recording') {
        return null;
      }

      updatePhase('processing');
      setError(null);
      setNotice(null);

      try {
        await stopRecorder();
        const uri = recorder.uri;
        const status = recorder.getStatus();

        if (uri === null || status.fileSize <= 0) {
          if (uri !== null) {
            pendingUriRef.current = uri;
            setRecordingUri(uri);
            await releasePendingRecording();
          }
          setError('Die Aufnahme war leer. Bitte nimm deine Anfrage erneut auf.');
          updatePhase('idle');
          return null;
        }

        pendingUriRef.current = uri;
        setRecordingUri(uri);
        const proposal = await createNoteProposal(
          {
            uri,
            mimeType: Platform.OS === 'web' ? 'audio/webm' : 'audio/mp4',
          },
          signal,
        );
        await releasePendingRecording();
        updatePhase('reviewing');
        setNotice('Prüfe den vollständigen Notizvorschlag, bevor du ihn speicherst.');
        return proposal;
      } catch (recordingError) {
        let cleanupFailed = false;
        try {
          await releasePendingRecording();
        } catch {
          cleanupFailed = true;
        }

        await resetAudioMode();
        updatePhase(recorder.isRecording ? 'recording' : 'idle');
        if (cleanupFailed) {
          setError(
            'Die Anfrage ist fehlgeschlagen und die temporäre Aufnahme konnte nicht freigegeben werden.',
          );
        } else if (recordingError instanceof GeminiServiceError) {
          setError(recordingError.message);
        } else {
          setError(getErrorMessage(recordingError));
        }
        return null;
      }
    },
    [recorder, releasePendingRecording, resetAudioMode, stopRecorder, updatePhase],
  );

  const rejectProposal = useCallback(() => {
    if (phaseRef.current !== 'reviewing') {
      return;
    }

    updatePhase('idle');
    setNotice('Vorschlag abgelehnt. Es wurde keine Notiz gespeichert.');
  }, [updatePhase]);

  const completeProposal = useCallback(() => {
    if (phaseRef.current !== 'reviewing') {
      return;
    }

    updatePhase('idle');
    setNotice('Notiz gespeichert.');
  }, [updatePhase]);

  const cancelRecording = useCallback(async () => {
    if (phaseRef.current !== 'recording') {
      return;
    }

    updatePhase('processing');
    setError(null);
    try {
      await stopRecorder();
      const uri = recorder.uri;
      if (uri !== null) {
        pendingUriRef.current = uri;
        setRecordingUri(uri);
        await releasePendingRecording();
      }
      updatePhase(recorder.isRecording ? 'recording' : 'idle');
      setNotice('Aufnahme verworfen. Du kannst direkt eine neue starten.');
    } catch (recordingError) {
      console.error('Unable to cancel audio recording.', recordingError);
      updatePhase(
        recorder.isRecording ? 'recording' : pendingUriRef.current === null ? 'idle' : 'ready',
      );
      setError('Die Aufnahme konnte nicht sauber abgebrochen werden. Bitte versuche es erneut.');
    }
  }, [recorder, releasePendingRecording, stopRecorder, updatePhase]);

  const discardRecording = useCallback(async () => {
    if (phaseRef.current !== 'ready') {
      return;
    }

    updatePhase('processing');
    setError(null);
    try {
      await releasePendingRecording();
      updatePhase('idle');
      setNotice('Aufnahme verworfen. Du kannst direkt eine neue starten.');
    } catch (recordingError) {
      console.error('Unable to discard temporary audio recording.', recordingError);
      updatePhase('ready');
      setError('Die temporäre Aufnahme konnte nicht freigegeben werden. Bitte versuche es erneut.');
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
        console.error('Unable to release temporary audio on unmount.', cleanupError);
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
  };
}
