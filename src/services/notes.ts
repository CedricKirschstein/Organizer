import AsyncStorage from '@react-native-async-storage/async-storage';

export type Note = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

const STORAGE_KEY = 'organizer.notes.v1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseNotes(value: unknown): Note[] {
  if (!Array.isArray(value)) {
    throw new Error('Die gespeicherten Notizen haben ein ungültiges Format.');
  }

  return value.map((item: unknown) => {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      item.id.length === 0 ||
      typeof item.title !== 'string' ||
      item.title.trim().length === 0 ||
      typeof item.body !== 'string' ||
      typeof item.createdAt !== 'string' ||
      Number.isNaN(Date.parse(item.createdAt)) ||
      typeof item.updatedAt !== 'string' ||
      Number.isNaN(Date.parse(item.updatedAt))
    ) {
      throw new Error('Eine gespeicherte Notiz ist beschädigt und konnte nicht geladen werden.');
    }

    return {
      id: item.id,
      title: item.title,
      body: item.body,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  });
}

async function readNotes(): Promise<Note[]> {
  const storedNotes = await AsyncStorage.getItem(STORAGE_KEY);
  if (storedNotes === null) {
    return [];
  }

  let parsedNotes: unknown;
  try {
    parsedNotes = JSON.parse(storedNotes);
  } catch {
    throw new Error('Die gespeicherten Notizen konnten nicht gelesen werden.');
  }

  return parseNotes(parsedNotes);
}

async function writeNotes(notes: Note[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

function normalizeTitle(title: string): string {
  const normalizedTitle = title.trim();
  if (normalizedTitle.length === 0) {
    throw new Error('Bitte gib einen Titel für die Notiz ein.');
  }
  return normalizedTitle;
}

function createId(existingNotes: Note[]): string {
  let id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  while (existingNotes.some((note) => note.id === id)) {
    id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
  return id;
}

export async function getNotes(): Promise<Note[]> {
  return readNotes();
}

export async function createNote(title: string, body: string): Promise<Note> {
  const notes = await readNotes();
  const timestamp = new Date().toISOString();
  const note: Note = {
    id: createId(notes),
    title: normalizeTitle(title),
    body,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await writeNotes([note, ...notes]);
  return note;
}

export async function updateNote(id: string, title: string, body: string): Promise<Note> {
  const notes = await readNotes();
  const existingNote = notes.find((note) => note.id === id);
  if (!existingNote) {
    throw new Error('Diese Notiz wurde nicht gefunden.');
  }

  const updatedNote: Note = {
    ...existingNote,
    title: normalizeTitle(title),
    body,
    updatedAt: new Date().toISOString(),
  };
  await writeNotes(notes.map((note) => (note.id === id ? updatedNote : note)));
  return updatedNote;
}

export async function deleteNote(id: string): Promise<void> {
  const notes = await readNotes();
  if (!notes.some((note) => note.id === id)) {
    throw new Error('Diese Notiz wurde nicht gefunden.');
  }

  await writeNotes(notes.filter((note) => note.id !== id));
}
