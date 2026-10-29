# Organizer

Organizer is a local-first notes app for Android, iOS, and web. It currently supports:

- Manual note creation, editing, and deletion, stored locally with AsyncStorage.
- Temporary voice recording and microphone permission handling.
- A voice-request flow that asks Gemini only to propose one new note. The complete title and content must be explicitly confirmed before the existing local note service saves it.
- Home-to-notes navigation, including a visible button and a right-swipe gesture.
- Automatic light and dark theme support.

Notes stay on the current device and are not synced. Audio recordings use temporary storage and are released after processing, cancellation, or failure.

## Gemini configuration and privacy

To try the voice-to-note flow, copy `.env.example` to `.env.local` and add your own Gemini API key to the `EXPO_PUBLIC_GEMINI_API_KEY` variable. Do not commit `.env.local`; the repository's `.gitignore` excludes local environment files. Restart the Expo development server after changing environment variables so the new value is picked up.

The app sends recorded audio to Google's Gemini API for analysis. The request asks the API not to store the interaction, and the app releases its temporary recording after processing. Do not record sensitive information unless you are comfortable transmitting it to Google.

An `EXPO_PUBLIC_` value is embedded in the client bundle and is not a secret. Anyone with access to a distributed iOS, Android, or web app can extract its API key. A private GitHub repository and an ignored `.env.local` file do not protect a key after it has been bundled. The direct client call is suitable only for this private prototype with that exposure understood; use a trusted server-side service to keep a key confidential.

## Get started

Install dependencies and start the Expo development server:

```bash
npm install
npx expo start
```

Web recording requires browser microphone permission and a secure context such as HTTPS or localhost. Verify native microphone recording and Gemini behavior on supported iOS and Android devices or simulators; a web export alone does not validate native capture.
