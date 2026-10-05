# Testing in the running app

**When:** a change needs checking in the app itself, beyond unit tests: the web app in the browser, or Android on a device or the emulator.

## Which sheet

| Sheet | Use |
|---|---|
| Mom's (`VITE_DEFAULT_SPREADSHEET_ID`) | Never: no tests, no experiments |
| Test (`VITE_SPREADSHEET_ID`) | Checking behaviour against the released schema; testers use it |
| Dev (`VITE_DEV_SPREADSHEET_ID`) | Anything that changes the sheet's structure (new columns, migrations) until that release ships |

Mom's phone is never part of testing. Her setup is reproduced instead: a Ukrainian-locale sheet, Ukrainian Gboard, large text.

## Web app (local)

- `npm run dev` serves `http://localhost:5173`; drive it in a separate browser tab of its own.
- **The developer signs in, never Claude.** Ask, then wait for "signed in".
- The token lives only in memory: a page reload, or a hot reload after editing `src/i18n/uk.ts` or a context provider, signs out. Finish edits before asking for a sign-in, and plan the check to need as few reloads as possible.
- Name test data so it's obviously temporary, e.g. «Хліб житній (тест 1.9)», and delete it at the end of the check through the app's own delete flows.
- To confirm what reached the sheet, read it back through the app's own modules in the page, e.g. `await (await import("/src/lib/ingredients.ts")).listIngredients()`.
- Never type into the sheet itself (standing rule 6).
- The dev server answers only on IPv6 (`[::1]:5173`). To open it from the phone over USB, start a second one on IPv4, `npx vite --host 127.0.0.1 --port 5174 --strictPort`, then `adb reverse tcp:5174 tcp:5174` and open `http://localhost:5174/` on the phone. Stop it afterwards.

## Android

- **Devices:** the developer's Pixel 10 (adb serial `58101FDCR007JM`) over USB, or the Pixel 10 emulator (Android 17). If `adb devices` shows "unauthorized", the developer accepts the USB-debugging prompt on the phone.
- **Debug build:** `npm run build:android`, then install from Android Studio or with `cd android && ./gradlew installDebug`.
- **In Git Bash, set `MSYS_NO_PATHCONV=1`** before any adb command that has a device path (`adb pull /sdcard/...`). Otherwise Git Bash rewrites the path into a Windows path.
- **Screenshots:** `adb exec-out screencap -p > file.png`.
- **Screen recordings** (made by the developer) are in `/sdcard/Movies/`. List them with `adb shell "content query --uri content://media/external/video/media --projection _display_name:relative_path:date_added --sort 'date_added DESC'"`.
- **Logs:** `adb logcat -d | grep ImeTracker` (keyboard) or the app's own tags. Clear the log first with `adb logcat -c`.
- Before touching the phone, ask whether the developer is using it; stop as soon as they start using it.
