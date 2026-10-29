# Organizer

Organizer is a local-first notes app for Android, iOS, and web. The current development phases include:

- A home screen with a prominent microphone button for temporary voice recording.
- Microphone permission handling, recording status, stop/cancel controls, and temporary recording cleanup.
- A persistent local notes list with manual note creation, editing, and deletion.
- Navigation between the home screen and notes, including a right-swipe gesture on the home screen.
- Automatic light and dark theme support.

Notes are stored on the current device using AsyncStorage. They are not synced between devices.
Audio recordings remain in temporary memory or cache only and are not sent to a service yet. Web recording requires browser microphone access and a secure context such as HTTPS or localhost.

## Get started

Install dependencies and start the Expo development server:

```bash
npm install
npx expo start
```

Use the terminal shortcuts to open the app on Android, iOS, or web. Native behavior should be verified on a supported device or simulator.
