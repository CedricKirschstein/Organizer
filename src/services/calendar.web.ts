import type {
  CalendarEventInfo,
  CalendarInfo,
  CalendarPermissionStatus,
  CalendarServiceResult,
} from "@/services/calendar.types";

export type {
  CalendarEventInfo,
  CalendarInfo,
  CalendarPermissionStatus,
  CalendarServiceErrorCode,
  CalendarServiceResult,
} from "@/services/calendar.types";

const unavailableMessage =
  "Der native Geräte-Kalender ist im Web nicht verfügbar. Verwende Organizer auf iOS oder Android.";

function unavailable<T>(): CalendarServiceResult<T> {
  return {
    success: false,
    error: {
      code: "NATIVE_CALENDAR_UNAVAILABLE",
      message: unavailableMessage,
    },
  };
}

export async function getCalendarPermissionStatus(): Promise<
  CalendarServiceResult<CalendarPermissionStatus>
> {
  return unavailable();
}

export async function requestCalendarPermission(): Promise<
  CalendarServiceResult<CalendarPermissionStatus>
> {
  return unavailable();
}

export async function getCalendars(): Promise<
  CalendarServiceResult<CalendarInfo[]>
> {
  return unavailable();
}

export async function getCalendarEvents(
  _startDate: Date,
  _endDate: Date,
): Promise<CalendarServiceResult<CalendarEventInfo[]>> {
  return unavailable();
}
