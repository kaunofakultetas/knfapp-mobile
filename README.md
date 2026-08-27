# KNF APP

<br/>

## Testing 
1. Install Expo Go app on your phone

2. Scan the QR code with your phone camera to open the project
<img src="_DOCS/images/qr-code.png" alt="Expo Go QR Code" width="200"/>


<br/>

## Older versions of the app


📹 [Screen Recording 1](https://rinkis.knf.vu.lt/static-knf/files/KNFAPP/ScreenRecording_08-09-202514-22-26_1.MP4)

📹 [Screen Recording 2](https://rinkis.knf.vu.lt/static-knf/files/KNFAPP/ScreenRecording_08-10-202522-46-08_1.MP4)

📹 [Screen Recording 3](https://rinkis.knf.vu.lt/static-knf/files/KNFAPP/ScreenRecording_08-11-202522-30-41_1.MP4)


## Development

The app is `app/` (Expo SDK 54, expo-router, NativeWind, i18next). Screens live in
route files under `app/app/`, the UI kit in `app/components/ui/`, the API layer in
`app/services/api/`, and every color in `app/constants/theme.ts`.

```bash
cd app
npx tsc --noEmit                 # typecheck
npx expo lint --max-warnings 0   # eslint
npm test                         # jest unit tests (__tests__/)
npx expo export --platform web   # bundle smoke test
```

`EXPO_PUBLIC_API_URL` selects the backend (set per profile in `eas.json`, and by
docker-compose for the dev container). CI runs the same four gates on every push.
