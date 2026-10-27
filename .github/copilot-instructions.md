Copilot instructions
These instructions apply to the entire Organizer repository. Follow the existing project structure and conventions unless a deliberate, explained change is required.
Project structure and architecture
- This is an Expo SDK 58 app using React Native, TypeScript, and Expo Router.
- Routes live under src/app/. The root _layout.tsx wraps routes in the system light/dark ThemeProvider, splash overlay, and tab navigation.
- index and explore are the initial route files. Replace starter/demo content as the Organizer screens are implemented; do not leave unrelated template UI in the finished app.
- Keep screens and layouts in src/app/; reusable UI in src/components/; shared design tokens in src/constants/; and reusable hooks in src/hooks/.
- Keep route components focused on UI and orchestration. Put domain logic and device/API integrations in separate service modules rather than embedding business logic in screens.
- Tabs are platform-specific: app-tabs.tsx uses Expo Router native tabs, while app-tabs.web.tsx uses expo-router/ui. Update both when changing tab behavior or labels.
- Theme colors and spacing live in src/constants/theme.ts. Use useTheme, ThemedText, and ThemedView where appropriate. Respect src/global.css and automatic light/dark appearance.
- The @/ alias points to src/; @/assets/ points to assets/.
- TypeScript strict mode and Expo typed routes are enabled. Preserve strict typing; do not use any as a shortcut.
- Native splash and animation behavior has platform-specific implementations in src/components/animated-icon.tsx and its .web.tsx counterpart. Keep platform-specific behavior in the appropriate platform file.
- Continuous Native Generation is in use. There are currently no committed ios/ or android/ directories. Configure native changes through app.json or config plugins; do not create or edit generated native folders without a specific, justified reason.
Product goal
Organizer is a personal, voice-driven organizer for iOS and Android. It provides:
- Voice-driven requests processed by the Gemini API.
- Local notes with titles and body text.
- Creating, opening, editing, and deleting notes.
- Creating, editing, and deleting events in the device's calendar.
- A clear action preview and explicit user approval before any proposed change is performed.
The initial product is for private use by two people. Keep the design simple and local-first. Do not add user accounts, a backend, sync, analytics, or other infrastructure unless asked. Cross-device synchronization is not required.

The app should remain usable in the web target for layout/development where practical, but native audio recording and device-calendar behavior must be treated as platform-specific capabilities and tested on supported native environments.
Main interaction flow
- The home screen has a prominent microphone button.
- Tapping it starts audio recording; the control changes to a stop button while recording.
- Tapping stop ends the recording and submits the audio to the configured Gemini service for interpretation.
- Show an explicit loading/processing state and handle permission denial, empty recordings, network failure, API errors, timeouts, and quota limits gracefully.
- One recording may result in at most one action in the initial version. Do not execute a chain of unrelated actions from a single request.
- Gemini proposes an action; it must never directly perform app or calendar mutations. The app validates the proposal and displays a preview.
- The user confirms with a green check or rejects with a red cross. A rejected proposal performs no mutation.
- Only show a success state after the app has actually completed and verified the operation to the extent the API permits.
- After a confirmed or rejected action, return to the home screen. After a successful action, show an action bar/banner that remains until the app is closed or another voice request is submitted. It should link to the resulting note/event with a clear “View” affordance. For deletions, offer “Restore” instead.
- Provide a visible navigation affordance in addition to the right-swipe gesture. Do not make essential navigation depend solely on a gesture.
- Swiping right from the home screen opens the note list. The list displays note titles and should support opening a note. Use accessible touch targets and preserve navigation parity across platforms.
Notes
- Store notes locally on the device. Prefer SQLite through an Expo-compatible library such as expo-sqlite; check the existing dependencies and SDK compatibility before adding anything.
- A note has a stable ID, title, body, and suitable created/updated timestamps. Use explicit TypeScript types and validate data at boundaries.
- Users can create, open, edit, and delete notes manually. Manual editing means ordinary text fields and the device keyboard, not voice dictation. Include clear UI controls for creating and deleting notes; opening a note should allow editing its title and body in the normal way.
- Voice requests are a separate way to ask Gemini to perform an action; do not make voice mandatory for ordinary note management.
- When Gemini proposes a new note, show the full proposed title and full content before confirmation.
- For a note edit, show only one changed region at a time. Include approximately two lines of surrounding context above and below where available, and visually highlight the changed text. If several separate regions change, present each proposed change sequentially and ask the user to accept or reject each one individually.
- Accumulate accepted text patches safely in a working copy. Rejected patches must leave their corresponding text unchanged. Do not overwrite the stored note until the review of the proposed patches is complete; then save the combined accepted changes as one logical edit. Provide a way to cancel the review without saving.
- Identify edits using the original text plus enough surrounding context to verify the location. Validate every patch against the current note before applying it. If a patch no longer matches because the note changed, stop and request a fresh proposal rather than editing the wrong text. Recalculate locations as accepted patches are applied; never rely blindly on stale character offsets.
- For destructive or ambiguous requests, identify the exact note in the preview. Never delete or modify a note just because it is the top search result.
Semantic note search and candidate selection
- A user may refer to a note by meaning rather than its exact title or literal contents. For example, “open my recipes” may refer to a note titled “Food,” even if the words “recipe” or “recipes” do not appear in the note.
- Initially send Gemini only the list of note IDs and titles for candidate selection. Do not send every note's full content by default.
- When necessary, retrieve and send the content of a candidate note so Gemini can check whether it matches the user's intent. Only request the contents needed to disambiguate the request.
- The first candidate and up to two additional candidate checks are allowed (at most three candidate-content checks for a single request). If the intent is still uncertain, present up to three explicit choices: the most likely candidate and up to two alternatives. The user must select the intended item.
- For actions requiring the selection of an existing item—opening, editing, or deleting a note, or selecting an event to change—uncertainty should lead to candidate choices rather than guessing. Creating a new note is the exception to this candidate-selection flow.
- Do not rely solely on a confidence number generated by the model. Check that the candidate exists, validate the returned ID, and require user selection whenever the result is ambiguous or risky.
- Never let model-generated text or IDs bypass application-level checks.
Calendar integration
- Use the device's calendar, not a separate in-app calendar, for calendar events.
- Check the Expo SDK 58-compatible version and configuration of expo-calendar before adding or changing calendar functionality. Install Expo native dependencies with npx expo install <package> where applicable.
- Request calendar permission only when it is needed. Handle denied/revoked permissions and devices without an available writable calendar.
- Before creating, editing, or deleting an event, show a clear preview identifying the event and all relevant details: title, date, start/end time, calendar, location, and any other fields being changed when applicable.
- Resolve relative dates and times into explicit date/time values and display them before approval. Handle locale and time-zone considerations carefully. If required details are missing or ambiguous, ask the user to choose rather than inventing values.
- For editing or deleting an existing event, verify that the proposed event ID belongs to a real event returned by the calendar API. If multiple events match, show candidate choices.
- Require an explicit user confirmation before any calendar mutation. Never silently create, edit, or delete calendar events.
- Implement best-effort undo for calendar actions where technically possible: for a newly created event, undo by removing that event; for an edit, retain the previous field values and restore them; for a deletion, retain enough event details to recreate it. Calendar undo may recreate an event with a new ID or be limited by permissions, calendar provider behavior, or external synchronization. Handle and communicate these limitations honestly.
AI service and data validation
- Keep Gemini calls behind a dedicated service interface, separate from UI components and storage/calendar logic. Keep the model identifier configurable in one place; do not scatter model IDs through the app.
- Before relying on a model name or API feature, verify the currently available model ID and relevant API documentation. Do not assume that a model name mentioned in planning is a valid API model ID.
- Treat model output as untrusted input, even if it is expected to be JSON. Define typed action proposals and validate responses at runtime before using them.
- Use a finite set of application-defined action types (for example: create note, edit note, delete note, open note, create calendar event, edit calendar event, delete calendar event, open event). Reject unknown action types and invalid/missing fields.
- The model should return a proposal, not executable code or direct tool instructions. The app controls all reads, writes, IDs, permissions, confirmation UI, persistence, and execution.
- Normalize and validate titles, note contents, event dates, times, time zones, and required fields before showing a proposal or saving data.
- Ask Gemini to return a single action per recording. If an utterance contains several requested actions, ask the user to submit them separately in the initial version rather than silently dropping actions or executing a batch.
- For note edits, require structured patch information identifying the original excerpt, replacement text, and sufficient context. Validate each patch against the current note.
- Handle malformed responses, refusals, empty output, and API errors without changing any data. Include safe retry behavior but do not automatically repeat mutations.
- Audio is only needed for the request being processed and does not need to be stored after processing in the initial version. Clean up temporary recordings when safe to do so. Do not retain recordings or add transcription history unless asked.
Local storage, undo, and action status
- Keep user-created notes and app state local. Do not add cloud synchronization or a separate app backend in this version.
- Create a small action/history mechanism that records enough prior state to undo supported changes. Keep this logic separate from screen components.
- Support best-effort undo for all applicable actions: note creation, note deletion, accepted note edits, calendar-event creation, calendar-event editing, and calendar-event deletion. For operations that cannot be perfectly reversed, implement the safest available recovery and report any limitation.
- For note changes, retain the previous title/body snapshot. For calendar events, retain prior fields and required identifiers where available.
- Keep the home-screen action bar visible until app closure or a new voice request is submitted, as described above. Do not dismiss it on an arbitrary timer.
- Distinguish proposed, rejected, in-progress, succeeded, failed, and undone states. Never present a rejected or failed action as completed.
- If part of an operation fails, avoid leaving the app in a misleading state. Preserve the original data or roll back where possible, and explain what did or did not happen.
Security and API keys
- Never commit API keys, credentials, tokens, or private user data. Keep local secrets in an ignored environment file and check .gitignore before adding any configuration.
- An environment variable exposed to a React Native client bundle (including EXPO_PUBLIC_*) is not a secure secret. For the private prototype, a direct client API call may be used only with this limitation understood; keep the integration isolated so it can later be moved behind a secure service if needed.
- Do not add an in-app privacy disclaimer, sign-in flow, analytics, or consent screen for the current private prototype unless asked. This does not relax the requirement to avoid committing secrets.
UI and accessibility
- Favor a clear, calm, minimal interface. The microphone should be the most prominent element on the home screen.
- Use theme tokens and existing themed components. Support light and dark mode and keep text readable on both.
- The preview should explicitly state what will happen and to which item. Show the full contents for a new note, the changed excerpt for note edits, and all important event fields for calendar actions.
- Use consistent green check and red cross controls for accept/reject, with clear labels and accessible touch targets. Color must not be the only way to communicate an action.
- Show loading, empty, permission-denied, offline, and error states. Prevent duplicate submissions while a request is being processed.
- Keep UI and behavior as consistent as practical across iOS, Android, and web. Use platform-specific files only when platform behavior genuinely differs.
Commands and validation
Common commands:
- npm install
- npx expo start
- npm run android
- npm run ios
- npm run web
- npm run lint
- npx tsc --noEmit
- npx expo-doctor
There is currently no configured test runner or test suite, and no production build script. Do not claim tests were run unless they actually were. Add tests when a suitable test setup is introduced, especially for action validation, note patching, search candidate selection, and undo logic.

Before completing a meaningful change, run the relevant available checks (at minimum lint and TypeScript checks when feasible) and report any command that could not be run or any errors that remain.
Repository and dependency conventions
- Use Expo Router for navigation and keep route files under src/app/.
- Preserve parity across Android, iOS, and web when changing navigation or core behavior; check both tab implementations when relevant.
- Prefer Expo-supported libraries and confirm SDK 58 compatibility before adding dependencies. Do not use a package just because it is popular in a newer Expo SDK.
- Avoid unnecessary dependencies. Explain why a new dependency is needed before adding it.
- Native-code dependencies may require a development build rather than Expo Go. Keep this in mind when proposing device testing steps.
- Before changing Expo/EAS/React Native APIs, check the Expo SDK 58 documentation: https://docs.expo.dev/versions/v58.0.0/.
- For EAS workflows, use EAS CLI and the official guide: https://docs.expo.dev/eas/index.md.
Working style for Copilot
- Before large changes, briefly describe the proposed approach and files that will change. Then implement in small, coherent steps.
- Do not attempt to build the whole app in one giant change. Start with the core shell and screen navigation, then add storage, audio, AI proposals, and calendar integration incrementally.
- Inspect the existing files before editing. Reuse project conventions and avoid replacing working configuration wholesale.
- Keep dependencies and configuration changes minimal and justified.
- After changes, summarize what was changed, which checks ran, what passed or failed, and the next sensible step.
- If the requirements are clear, proceed with a reasonable implementation instead of repeatedly asking the user to reconfirm already-decided requirements.