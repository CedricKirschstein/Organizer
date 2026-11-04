export type CalendarPermissionStatus = {
  status: "granted" | "denied" | "undetermined";
  canAskAgain: boolean;
};

export type CalendarInfo = {
  id: string;
  title: string;
  color: string | null;
  allowsModifications: boolean;
  isPrimary: boolean | null;
};

export type CalendarEventInfo = {
  id: string;
  calendarId: string;
  title: string;
  isRecurring: boolean;
  startDate: string;
  endDate: string;
  allDay: boolean;
  location: string | null;
  notes: string | null;
  timeZone: string | null;
};

export type CreateCalendarEventInput = {
  calendarId: string;
  title: string;
  startDate: string;
  endDate: string;
  notes: string;
  timeZone: string;
  allDay?: boolean;
  location?: string | null;
};

export type UpdateCalendarEventInput = {
  expectedEvent: CalendarEventInfo;
  startDate: string;
  endDate: string;
};

export type RestoreCalendarEventResult = {
  event: CalendarEventInfo;
  restoredToOriginalCalendar: boolean;
};

export type CalendarServiceErrorCode =
  | "NATIVE_CALENDAR_UNAVAILABLE"
  | "PERMISSION_REQUIRED"
  | "INVALID_DATE_RANGE"
  | "NO_WRITABLE_CALENDAR"
  | "CALENDAR_NOT_FOUND"
  | "EVENT_NOT_FOUND"
  | "EVENT_CHANGED"
  | "RECURRING_EVENT"
  | "ACCESS_FAILED";

export type CalendarServiceResult<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: {
        code: CalendarServiceErrorCode;
        message: string;
      };
    };
