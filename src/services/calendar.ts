import * as Calendar from "expo-calendar";
import type { ExpoCalendar } from "expo-calendar";

import type {
  CalendarEventInfo,
  CalendarInfo,
  CalendarPermissionStatus,
  CalendarServiceErrorCode,
  CalendarServiceResult,
  CreateCalendarEventInput,
  RestoreCalendarEventResult,
} from "@/services/calendar.types";

export type {
  CalendarEventInfo,
  CalendarInfo,
  CalendarPermissionStatus,
  CalendarServiceErrorCode,
  CalendarServiceResult,
  CreateCalendarEventInput,
  RestoreCalendarEventResult,
} from "@/services/calendar.types";

function success<T>(data: T): CalendarServiceResult<T> {
  return { success: true, data };
}

function failure<T>(
  code: CalendarServiceErrorCode,
  message: string,
): CalendarServiceResult<T> {
  return { success: false, error: { code, message } };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "Der Kalenderzugriff ist fehlgeschlagen. Bitte versuche es erneut.";
}

function mapPermissionStatus(permission: {
  status: string;
  granted: boolean;
  canAskAgain: boolean;
}): CalendarPermissionStatus {
  return {
    status: permission.granted
      ? "granted"
      : permission.status === "undetermined"
        ? "undetermined"
        : "denied",
    canAskAgain: permission.canAskAgain,
  };
}

function toIsoDate(value: Date | string, field: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Der Kalender lieferte ein ungültiges Feld: ${field}.`);
  }
  return date.toISOString();
}

async function getGrantedCalendars(): Promise<
  CalendarServiceResult<ExpoCalendar[]>
> {
  const permission = await Calendar.getCalendarPermissions();
  if (!permission.granted) {
    return failure(
      "PERMISSION_REQUIRED",
      "Für den Kalenderzugriff ist eine Kalenderberechtigung erforderlich.",
    );
  }

  return success(await Calendar.getCalendars(Calendar.EntityTypes.EVENT));
}

function mapCalendar(calendar: ExpoCalendar): CalendarInfo {
  return {
    id: calendar.id,
    title: calendar.title,
    color: calendar.color ?? null,
    allowsModifications: calendar.allowsModifications,
    isPrimary: calendar.isPrimary ?? null,
  };
}

function mapCalendarEvent(event: Calendar.ExpoCalendarEvent): CalendarEventInfo {
  return {
    id: event.id,
    calendarId: event.calendarId,
    title: event.title,
    startDate: toIsoDate(event.startDate, "startDate"),
    endDate: toIsoDate(event.endDate, "endDate"),
    allDay: event.allDay,
    location: event.location ?? null,
    notes: event.notes ?? null,
    timeZone: event.timeZone ?? null,
  };
}

function isSameEvent(
  first: CalendarEventInfo,
  second: CalendarEventInfo,
): boolean {
  return (
    first.id === second.id &&
    first.calendarId === second.calendarId &&
    first.title === second.title &&
    first.startDate === second.startDate &&
    first.endDate === second.endDate
  );
}

export async function getCalendarPermissionStatus(): Promise<
  CalendarServiceResult<CalendarPermissionStatus>
> {
  try {
    return success(
      mapPermissionStatus(await Calendar.getCalendarPermissions()),
    );
  } catch (error) {
    return failure("ACCESS_FAILED", getErrorMessage(error));
  }
}

export async function requestCalendarPermission(): Promise<
  CalendarServiceResult<CalendarPermissionStatus>
> {
  try {
    return success(
      mapPermissionStatus(await Calendar.requestCalendarPermissions()),
    );
  } catch (error) {
    return failure("ACCESS_FAILED", getErrorMessage(error));
  }
}

export async function getCalendars(): Promise<
  CalendarServiceResult<CalendarInfo[]>
> {
  try {
    const calendarsResult = await getGrantedCalendars();
    return calendarsResult.success
      ? success(calendarsResult.data.map(mapCalendar))
      : calendarsResult;
  } catch (error) {
    return failure("ACCESS_FAILED", getErrorMessage(error));
  }
}

export async function getCalendarEvents(
  startDate: Date,
  endDate: Date,
): Promise<CalendarServiceResult<CalendarEventInfo[]>> {
  if (
    !(startDate instanceof Date) ||
    !(endDate instanceof Date) ||
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime()) ||
    startDate >= endDate
  ) {
    return failure(
      "INVALID_DATE_RANGE",
      "Bitte gib einen gültigen Zeitraum mit Start vor Ende an.",
    );
  }

  try {
    const calendarsResult = await getGrantedCalendars();
    if (!calendarsResult.success) {
      return calendarsResult;
    }

    if (calendarsResult.data.length === 0) {
      return success([]);
    }

    const eventLists = await Promise.all(
      calendarsResult.data.map((calendar) =>
        calendar.listEvents(startDate, endDate),
      ),
    );
    const events = eventLists.flat();

    return success(events.map(mapCalendarEvent));
  } catch (error) {
    return failure("ACCESS_FAILED", getErrorMessage(error));
  }
}

export async function createCalendarEvent(
  input: CreateCalendarEventInput,
): Promise<CalendarServiceResult<CalendarEventInfo>> {
  const startDate = new Date(input.startDate);
  const endDate = new Date(input.endDate);
  if (
    input.title.trim().length === 0 ||
    input.calendarId.trim().length === 0 ||
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime()) ||
    startDate >= endDate
  ) {
    return failure(
      "INVALID_DATE_RANGE",
      "Der Terminvorschlag enthält ungültige Angaben. Bitte stelle die Anfrage erneut.",
    );
  }

  try {
    const calendarsResult = await getGrantedCalendars();
    if (!calendarsResult.success) {
      return calendarsResult;
    }

    const calendar = calendarsResult.data.find(
      (item) => item.id === input.calendarId,
    );
    if (calendar === undefined) {
      return failure(
        "CALENDAR_NOT_FOUND",
        "Der ausgewählte Kalender ist nicht mehr verfügbar. Bitte lade die Kalender neu.",
      );
    }
    if (!calendar.allowsModifications) {
      return failure(
        "NO_WRITABLE_CALENDAR",
        "Der ausgewählte Kalender ist nicht beschreibbar. Bitte wähle einen beschreibbaren Kalender.",
      );
    }

    const createdEvent = await calendar.createEvent({
      title: input.title.trim(),
      startDate,
      endDate,
      notes: input.notes,
      timeZone: input.timeZone,
      allDay: input.allDay,
      location: input.location ?? undefined,
    });
    const event = mapCalendarEvent(createdEvent);
    if (
      event.calendarId !== input.calendarId ||
      event.title !== input.title.trim() ||
      event.startDate !== startDate.toISOString() ||
      event.endDate !== endDate.toISOString()
    ) {
      return failure(
        "ACCESS_FAILED",
        "Der Kalender hat den Termin nicht mit den bestätigten Angaben gespeichert. Bitte prüfe den Kalender.",
      );
    }
    return success(event);
  } catch (error) {
    return failure("ACCESS_FAILED", getErrorMessage(error));
  }
}

export async function deleteCalendarEvent(
  expectedEvent: CalendarEventInfo,
): Promise<CalendarServiceResult<null>> {
  try {
    const calendarsResult = await getGrantedCalendars();
    if (!calendarsResult.success) {
      return calendarsResult;
    }

    const calendar = calendarsResult.data.find(
      (item) => item.id === expectedEvent.calendarId,
    );
    if (calendar === undefined) {
      return failure(
        "CALENDAR_NOT_FOUND",
        "Der Kalender des Termins ist nicht mehr verfügbar. Es wurde nichts gelöscht.",
      );
    }
    if (!calendar.allowsModifications) {
      return failure(
        "NO_WRITABLE_CALENDAR",
        "Der Kalender dieses Termins ist nicht beschreibbar. Es wurde nichts gelöscht.",
      );
    }

    const expectedStart = new Date(expectedEvent.startDate);
    const expectedEnd = new Date(expectedEvent.endDate);
    if (
      Number.isNaN(expectedStart.getTime()) ||
      Number.isNaN(expectedEnd.getTime()) ||
      expectedStart >= expectedEnd
    ) {
      return failure(
        "INVALID_DATE_RANGE",
        "Die Terminvorschau ist ungültig. Es wurde nichts gelöscht.",
      );
    }

    const currentEvents = await calendar.listEvents(
      new Date(expectedStart.getTime() - 24 * 60 * 60 * 1000),
      new Date(expectedEnd.getTime() + 24 * 60 * 60 * 1000),
    );
    const currentEvent = currentEvents.find(
      (event) => event.id === expectedEvent.id,
    );
    if (currentEvent === undefined) {
      return failure(
        "EVENT_NOT_FOUND",
        "Der Termin wurde nicht mehr gefunden. Es wurde nichts gelöscht.",
      );
    }

    if (!isSameEvent(mapCalendarEvent(currentEvent), expectedEvent)) {
      return failure(
        "EVENT_CHANGED",
        "Der Termin wurde seit der Vorschau geändert. Es wurde nichts gelöscht. Bitte starte eine neue Anfrage.",
      );
    }

    await currentEvent.delete();
    return success(null);
  } catch (error) {
    return failure("ACCESS_FAILED", getErrorMessage(error));
  }
}

export async function restoreCalendarEvent(
  deletedEvent: CalendarEventInfo,
): Promise<CalendarServiceResult<RestoreCalendarEventResult>> {
  try {
    const calendarsResult = await getGrantedCalendars();
    if (!calendarsResult.success) {
      return calendarsResult;
    }

    const originalCalendar = calendarsResult.data.find(
      (calendar) =>
        calendar.id === deletedEvent.calendarId &&
        calendar.allowsModifications,
    );
    const writableCalendars = calendarsResult.data.filter(
      (calendar) => calendar.allowsModifications,
    );
    const targetCalendar =
      originalCalendar ??
      writableCalendars.find((calendar) => calendar.isPrimary) ??
      writableCalendars[0];
    if (targetCalendar === undefined) {
      return failure(
        "NO_WRITABLE_CALENDAR",
        "Es ist kein beschreibbarer Kalender verfügbar. Der Termin wurde nicht wiederhergestellt.",
      );
    }

    const restored = await createCalendarEvent({
      calendarId: targetCalendar.id,
      title: deletedEvent.title,
      startDate: deletedEvent.startDate,
      endDate: deletedEvent.endDate,
      notes: deletedEvent.notes ?? "",
      timeZone:
        deletedEvent.timeZone ??
        Intl.DateTimeFormat().resolvedOptions().timeZone ??
        "UTC",
      allDay: deletedEvent.allDay,
      location: deletedEvent.location,
    });
    if (!restored.success) {
      return restored;
    }

    return success({
      event: restored.data,
      restoredToOriginalCalendar: originalCalendar !== undefined,
    });
  } catch (error) {
    return failure("ACCESS_FAILED", getErrorMessage(error));
  }
}
