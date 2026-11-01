import * as Calendar from "expo-calendar";
import type { ExpoCalendar } from "expo-calendar";

import type {
  CalendarEventInfo,
  CalendarInfo,
  CalendarPermissionStatus,
  CalendarServiceErrorCode,
  CalendarServiceResult,
} from "@/services/calendar.types";

export type {
  CalendarEventInfo,
  CalendarInfo,
  CalendarPermissionStatus,
  CalendarServiceErrorCode,
  CalendarServiceResult,
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

    return success(
      events.map((event) => ({
        id: event.id,
        calendarId: event.calendarId,
        title: event.title,
        startDate: toIsoDate(event.startDate, "startDate"),
        endDate: toIsoDate(event.endDate, "endDate"),
        allDay: event.allDay,
        location: event.location ?? null,
        notes: event.notes ?? null,
        timeZone: event.timeZone ?? null,
      })),
    );
  } catch (error) {
    return failure("ACCESS_FAILED", getErrorMessage(error));
  }
}
