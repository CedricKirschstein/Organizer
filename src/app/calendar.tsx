import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
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
  getCalendarEvents,
  getCalendarPermissionStatus,
  getCalendars,
  requestCalendarPermission,
  type CalendarEventInfo,
  type CalendarInfo,
  type CalendarPermissionStatus,
} from "@/services/calendar";

function getVisibleDateRange(): { start: Date; end: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 30);
  return { start, end };
}

function formatEventDate(value: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(value));
}

function formatEventTime(value: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function CalendarScreen() {
  const theme = useTheme();
  const [permission, setPermission] =
    useState<CalendarPermissionStatus | null>(null);
  const [calendars, setCalendars] = useState<CalendarInfo[]>([]);
  const [events, setEvents] = useState<CalendarEventInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCalendarData = useCallback(
    async (isActive: () => boolean = () => true) => {
      setIsLoading(true);
      setError(null);
      try {
        const permissionResult = await getCalendarPermissionStatus();
        if (!isActive()) {
          return;
        }
        if (!permissionResult.success) {
          setPermission(null);
          setError(permissionResult.error.message);
          return;
        }

        setPermission(permissionResult.data);
        if (permissionResult.data.status !== "granted") {
          setCalendars([]);
          setEvents([]);
          return;
        }

        const calendarsResult = await getCalendars();
        if (!isActive()) {
          return;
        }
        if (!calendarsResult.success) {
          setError(calendarsResult.error.message);
          return;
        }

        setCalendars(calendarsResult.data);
        if (calendarsResult.data.length === 0) {
          setEvents([]);
          return;
        }

        const { start, end } = getVisibleDateRange();
        const eventsResult = await getCalendarEvents(start, end);
        if (!isActive()) {
          return;
        }
        if (!eventsResult.success) {
          setError(eventsResult.error.message);
          return;
        }

        setEvents(
          eventsResult.data.slice().sort((first, second) =>
            first.startDate.localeCompare(second.startDate),
          ),
        );
      } catch (loadError) {
        if (isActive()) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Kalender und Termine konnten nicht geladen werden.",
          );
        }
      } finally {
        if (isActive()) {
          setIsLoading(false);
        }
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      let isFocused = true;
      void loadCalendarData(() => isFocused);
      return () => {
        isFocused = false;
      };
    }, [loadCalendarData]),
  );

  const handleRequestPermission = useCallback(async () => {
    setIsRequestingPermission(true);
    setError(null);
    try {
      const result = await requestCalendarPermission();
      if (!result.success) {
        setError(result.error.message);
        return;
      }

      setPermission(result.data);
      if (result.data.status === "granted") {
        await loadCalendarData();
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Die Kalenderberechtigung konnte nicht angefordert werden.",
      );
    } finally {
      setIsRequestingPermission(false);
    }
  }, [loadCalendarData]);

  const calendarTitles = new Map(
    calendars.map((calendar) => [calendar.id, calendar.title]),
  );
  const permissionDenied =
    permission !== null && permission.status !== "granted";
  const canRequestPermission = permissionDenied && permission.canAskAgain;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText type="smallBold" themeColor="accent">
            ORGANIZER
          </ThemedText>
          <ThemedText type="subtitle">Kalender</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Termine der nächsten 30 Tage
          </ThemedText>
        </View>

        <View style={styles.actions}>
          <CalendarButton
            label={canRequestPermission ? "Kalenderzugriff erlauben" : "Aktualisieren"}
            onPress={
              canRequestPermission
                ? () => void handleRequestPermission()
                : () => void loadCalendarData()
            }
            disabled={isLoading || isRequestingPermission}
            primary={canRequestPermission}
          />
        </View>

        {isLoading || isRequestingPermission ? (
          <View style={styles.loadingState}>
            <ActivityIndicator
              accessibilityLabel="Kalendertermine werden geladen"
              color={theme.accent}
            />
            <ThemedText type="small" themeColor="textSecondary">
              {isRequestingPermission
                ? "Kalenderberechtigung wird angefragt …"
                : "Kalendertermine werden geladen …"}
            </ThemedText>
          </View>
        ) : error !== null ? (
          <ThemedView type="backgroundElement" style={styles.messageCard}>
            <ThemedText type="smallBold">Kalender nicht verfügbar</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
          </ThemedView>
        ) : permissionDenied ? (
          <ThemedView type="backgroundElement" style={styles.messageCard}>
            <ThemedText type="smallBold">
              Kalenderberechtigung erforderlich
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Organizer benötigt Zugriff, um deine Kalender und Termine
              anzuzeigen.
              {!permission.canAskAgain
                ? " Die Berechtigung wurde dauerhaft abgelehnt. Erlaube den Zugriff in den Systemeinstellungen und lade anschließend erneut."
                : ""}
            </ThemedText>
          </ThemedView>
        ) : calendars.length === 0 ? (
          <ThemedView type="backgroundElement" style={styles.messageCard}>
            <ThemedText type="smallBold">Keine Kalender gefunden</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Auf diesem Gerät sind keine zugänglichen Kalender verfügbar.
            </ThemedText>
          </ThemedView>
        ) : events.length === 0 ? (
          <ThemedView type="backgroundElement" style={styles.messageCard}>
            <ThemedText type="smallBold">Keine anstehenden Termine</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              In den nächsten 30 Tagen wurden keine Termine gefunden.
            </ThemedText>
          </ThemedView>
        ) : (
          <ScrollView
            contentContainerStyle={styles.eventList}
            accessibilityLabel="Termine der nächsten 30 Tage"
          >
            {events.map((event) => (
              <ThemedView
                key={`${event.calendarId}:${event.id}`}
                type="backgroundElement"
                style={styles.eventCard}
                accessibilityLabel={`${event.title}, ${formatEventDate(event.startDate)}`}
              >
                <ThemedText type="smallBold" style={styles.eventTitle}>
                  {event.title || "Ohne Titel"}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatEventDate(event.startDate)}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {event.allDay
                    ? "Ganztägig"
                    : `${formatEventTime(event.startDate)} – ${formatEventTime(event.endDate)}`}
                </ThemedText>
                <View style={styles.calendarLabel}>
                  <View
                    style={[
                      styles.calendarDot,
                      { backgroundColor: theme.accent },
                    ]}
                  />
                  <ThemedText type="small" themeColor="textSecondary">
                    {calendarTitles.get(event.calendarId) ??
                      "Unbekannter Kalender"}
                  </ThemedText>
                </View>
              </ThemedView>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

type CalendarButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
};

function CalendarButton({
  label,
  onPress,
  disabled = false,
  primary = false,
}: CalendarButtonProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: primary ? theme.accent : theme.backgroundElement,
        },
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <ThemedText
        type="smallBold"
        style={{ color: primary ? theme.background : theme.text }}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
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
  header: {
    gap: Spacing.two,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
  },
  actions: {
    flexDirection: "row",
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  button: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.75,
  },
  loadingState: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
    padding: Spacing.four,
  },
  messageCard: {
    gap: Spacing.two,
    alignItems: "center",
    borderRadius: 16,
    padding: Spacing.four,
  },
  eventList: {
    gap: Spacing.two,
    paddingBottom: Spacing.five,
  },
  eventCard: {
    gap: Spacing.one,
    borderRadius: 16,
    padding: Spacing.three,
  },
  eventTitle: {
    marginBottom: Spacing.one,
  },
  calendarLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  calendarDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
