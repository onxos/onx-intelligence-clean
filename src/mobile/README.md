# ONX Mobile (EV-P2-09) — React Native Architecture

Expo + React Native client for core clinic flows, sharing the tRPC API contract
with the web app (same procedure names/shapes — zero API drift).

## Stack
- Expo SDK 52 (React Native 0.76), TypeScript, expo-router (file-based routes)
- @trpc/client + @tanstack/react-query — same `AppRouter` types as web
- react-native-reanimated, expo-notifications (PUSH channel, D18)
- react-native-webview fallback for TeleVet video (D11)

## Screens (core clinic flows)
- `app/(tabs)/index.tsx` — dashboard: today appointments, critical alerts
- `app/(tabs)/clinic.tsx` — sessions list + create session (vet.createSession)
- `app/(tabs)/patients.tsx` — patient file viewer (domains.portal.patientFile)
- `app/(tabs)/inventory.tsx` — stock + low-stock alerts (domains.inventory)
- `app/emergency.tsx` — one-tap emergency escalation (vet.emergency)
- `app/login.tsx` — Kimi OAuth via expo-web-browser (same /api/oauth/callback)

## Sync strategy
Optimistic mutations with server reconciliation; offline queue for
low-connectivity clinics (AsyncStorage-backed mutation queue).

## Build
`npx expo prebuild && npx expo run:android|ios` — EAS Build for store releases.
