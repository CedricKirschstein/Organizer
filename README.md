# Organizer

Organizer ist eine persönliche Organizer-App für iOS und Android. Sie verbindet lokale Notizen mit Sprachvorschlägen für Notiz- und Kalenderaktionen. Eine Web-Version ist für Entwicklung und Layout verfügbar; Funktionen, die den nativen Geräte-Kalender benötigen, sind dort nicht verfügbar.

## Funktionen

### Start und Spracheingabe

- Der Startbildschirm bietet einen großen Mikrofonknopf zum Starten und Stoppen einer Aufnahme.
- Nach dem Stoppen wird die Aufnahme an den Gemini-Dienst zur Interpretation übergeben. Während Aufnahme und Verarbeitung zeigt die App den jeweiligen Status an.
- Mikrofonberechtigungen, leere Aufnahmen und Verarbeitungsfehler werden behandelt. Temporäre Aufnahmen werden nach der Verarbeitung oder beim Abbruch freigegeben.
- Pro Aufnahme wird genau ein Aktionsvorschlag weiterverarbeitet. Wenn mehrere Aktionen erwähnt werden, wählt Gemini die wahrscheinlichste einzelne Aktion; weitere Aktionen aus derselben Äußerung werden nicht ausgeführt.

### Notizen

- Notizen können in der Notizübersicht manuell erstellt, geöffnet, bearbeitet und gelöscht werden.
- Notizen bestehen aus einer stabilen ID, Titel, Inhalt sowie Erstellungs- und Änderungszeitpunkt.
- Die Speicherung erfolgt lokal mit AsyncStorage. Es gibt keine Synchronisierung zwischen Geräten.
- Bei einem sprachgesteuerten Notizvorschlag zeigt Organizer die vorgeschlagene Aktion vor der Ausführung an. Notizänderungen werden als einzelne Textpatches geprüft und können jeweils angenommen oder abgelehnt werden.
- Sprachgesteuerte Löschungen und Änderungen haben einen Best-Effort-Wiederherstellungsablauf. Die manuelle Löschung im Notizeditor ist nicht rückgängig zu machen.

### Kalender

- Der Kalender-Tab zeigt Termine der nächsten 30 Tage aus dem Geräte-Kalender.
- Über Sprache können Kalendertermine vorgeschlagen, verschoben und gelöscht werden. Vor einer Änderung zeigt die App eine Vorschau und verlangt eine ausdrückliche Bestätigung.
- Bei mehreren plausiblen Treffern kann der Benutzer den passenden Termin auswählen. Kalenderberechtigungen werden bei Bedarf angefordert.
- Wiederkehrende Termine und Änderungen an Terminserien werden derzeit nicht unterstützt. Der Sprachworkflow soll wiederkehrende Kandidaten ausschließen; verschiebbare Ereignisse werden zusätzlich vom Kalenderdienst geprüft. Das Wiederherstellen eines gelöschten Termins erzeugt einen neuen Termin und erhält keine Serienregel.
- Undo für Kalenderaktionen ist best effort. Eine Wiederherstellung kann eine neue Ereignis-ID erhalten oder in einem anderen beschreibbaren Kalender erfolgen.
- Der native Geräte-Kalender ist im Web nicht verfügbar.

### Gestaltung und Navigation

- Die App unterstützt den automatischen Hell-/Dunkelmodus.
- Zwischen Start, Notizen und Kalender kann über die sichtbare Tab-Navigation gewechselt werden. Vom Startbildschirm führt außerdem eine Rechts-Wischgeste zur Notizübersicht.

## Technologie

- Expo SDK 58
- React Native 0.88 und TypeScript 6
- Expo Router
- `expo-audio` für Audioaufnahmen
- `expo-calendar` für den nativen Geräte-Kalender
- AsyncStorage für lokale Notizen
- Gemini Interactions API für die Sprachinterpretation

## Voraussetzungen

- Node.js und npm
- Für iOS- und Android-Entwicklung: die jeweils benötigte Expo-Entwicklungsumgebung. Native Funktionen können einen Development Build erfordern.
- Einen Gemini-API-Schlüssel für die Sprachverarbeitung

## Lokal starten

1. Abhängigkeiten installieren:

   ```sh
   npm install
   ```

2. `.env.example` als `.env.local` kopieren und den Gemini-Schlüssel eintragen:

   ```env
   EXPO_PUBLIC_GEMINI_API_KEY=dein-api-schluessel
   ```

   Unter Windows PowerShell:

   ```powershell
   Copy-Item .env.example .env.local
   ```

   `.env.local` wird von Git ignoriert. Nach Änderungen an der Umgebungsdatei Expo neu starten.

3. Entwicklungsserver starten:

   ```sh
   npx expo start
   ```

   Verfügbare Projekt-Skripte:

   ```sh
   npm run web
   npm run android
   npm run ios
   ```

   `npm run android` und `npm run ios` starten Expo und versuchen, die jeweilige Plattform zu öffnen; sie erstellen nicht selbst einen nativen Build.

## API-Schlüssel und Daten

Die App ruft Gemini direkt vom Client aus auf. `EXPO_PUBLIC_GEMINI_API_KEY` ist Bestandteil des Client-Bundles und **kein geheimes oder sicheres Secret**. Diese Konfiguration ist nur für einen privaten Prototyp geeignet. Für eine öffentliche Bereitstellung sollte die Gemini-Anbindung hinter einen abgesicherten Dienst verlegt werden.

Für eine Sprachverarbeitung wird die temporäre Audioaufnahme an Gemini gesendet. Bei der Auswahl bestehender Notizen können Titel und IDs zunächst zur Kandidatenauswahl und anschließend der Inhalt passender Kandidaten an Gemini übermittelt werden. Bei Kalenderaktionen werden passende Kalenderdaten zur Auswahl an Gemini gesendet. Die App speichert keine Audio- oder Transkript-Historie als Produktfunktion.

Im Development-Modus können Diagnose-Logs Transkripte, Modellantworten und Vorschlagsdetails enthalten. Diese Logs sollten vor dem Teilen von Konsolenausgaben geprüft und sensible Inhalte entfernt werden. Niemals API-Schlüssel, Zugangsdaten oder private Nutzerdaten committen.

## Projektstruktur

```text
src/
  app/
    index.tsx             Startbildschirm, Sprachworkflow und Vorschau
    explore.tsx           Notizübersicht und manueller Editor
    calendar.tsx          Kalenderübersicht
    _layout.tsx           Root-Layout, Theme und Tab-Navigation
  components/             Wiederverwendbare UI und plattformspezifische Tabs
  constants/              Theme- und Layout-Tokens
  hooks/
    use-voice-recording.ts Aufnahme- und Verarbeitungszustand
  services/
    calendar.ts           Native Kalenderzugriffe
    calendar.web.ts       Web-Fallback für Kalenderzugriffe
    calendar.types.ts     Gemeinsame Kalender-Typen
    gemini.ts              Gemini-Requests, Prompts und Laufzeitvalidierung
    note-edits.ts          Validierung und Anwendung von Textpatches
    notes.ts               Lokale Notizspeicherung
    temporary-audio.ts     Freigabe temporärer Audioressourcen
```

Native iOS- und Android-Verzeichnisse werden durch Continuous Native Generation erzeugt und sind nicht als Quellverzeichnisse eingecheckt. Native Konfiguration erfolgt über `app.json` und Expo Config Plugins.

## Prüfungen

```sh
npx tsc --noEmit
npm run lint
```

Ein automatisiertes Test-Framework ist im Projekt derzeit nicht eingerichtet.
