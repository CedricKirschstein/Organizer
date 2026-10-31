export type NoteTextPatch = {
  beforeContext: string;
  originalText: string;
  afterContext: string;
  replacementText: string;
};

export type ResolvedNotePatch = {
  start: number;
  end: number;
};

export function resolveNotePatch(
  body: string,
  patch: NoteTextPatch,
): ResolvedNotePatch | null {
  if (patch.originalText.length === 0) {
    return null;
  }

  const matches: ResolvedNotePatch[] = [];
  let searchFrom = 0;
  while (searchFrom <= body.length) {
    const start = body.indexOf(patch.originalText, searchFrom);
    if (start === -1) {
      break;
    }

    const end = start + patch.originalText.length;
    const beforeStart = start - patch.beforeContext.length;
    const afterEnd = end + patch.afterContext.length;
    if (
      beforeStart >= 0 &&
      afterEnd <= body.length &&
      body.slice(beforeStart, start) === patch.beforeContext &&
      body.slice(end, afterEnd) === patch.afterContext
    ) {
      matches.push({ start, end });
    }

    searchFrom = start + 1;
  }

  return matches.length === 1 ? matches[0] : null;
}

export function applyNotePatches(
  body: string,
  patches: NoteTextPatch[],
): string | null {
  if (patches.length === 0) {
    return body;
  }

  if (!validateNotePatches(body, patches)) {
    return null;
  }

  const resolvedPatches = patches.map((patch) => ({
    patch,
    range: resolveNotePatch(body, patch),
  }));
  if (resolvedPatches.some(({ range }) => range === null)) {
    return null;
  }

  return resolvedPatches
    .filter(
      (item): item is { patch: NoteTextPatch; range: ResolvedNotePatch } =>
        item.range !== null,
    )
    .sort((first, second) => second.range.start - first.range.start)
    .reduce(
      (currentBody, { patch, range }) =>
        `${currentBody.slice(0, range.start)}${patch.replacementText}${currentBody.slice(range.end)}`,
      body,
    );
}

export function validateNotePatches(
  body: string,
  patches: NoteTextPatch[],
): boolean {
  if (patches.length === 0) {
    return false;
  }

  const ranges = patches.map((patch) => resolveNotePatch(body, patch));
  if (ranges.some((range) => range === null)) {
    return false;
  }

  if (
    patches.some((patch, index) => {
      const range = ranges[index];
      return (
        range === null ||
        (range.start > 0 && patch.beforeContext.length === 0) ||
        (range.end < body.length && patch.afterContext.length === 0)
      );
    })
  ) {
    return false;
  }

  const sortedRanges = ranges
    .filter((range): range is ResolvedNotePatch => range !== null)
    .sort((first, second) => first.start - second.start);
  return sortedRanges.every(
    (range, index) => index === 0 || sortedRanges[index - 1].end <= range.start,
  );
}
