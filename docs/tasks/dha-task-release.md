# Releasing a version (and hotfixes)

**When:** a roadmap release (`x.y`) or an urgent fix (`x.y.z`) is built and ready to ship.

## Branches

- **Release:** `release/x.y`, cut from an up-to-date `main` when the release starts. All of its work is committed there.
- **Hotfix:** `release/x.y.z`, cut from `main`, holding only the fix. After it ships, merge `main` into any open release branch. In a roadmap conflict, keep both sections: the hotfix entry above the open release's.

## Before merging

1. `npx tsc -b`, `npx vitest run` and `npm run build` all pass.
2. The change is checked in the running app (`dha-task-device-testing.md`); test data made for the check is deleted afterwards.
3. Docs:
   - `docs/build-log.md` gets what changed, the decisions and what was verified, including what was *not* checked;
   - `docs/technical-spec.md` reflects any design change;
   - `docs/roadmap.md` marks the release "✅ built (date)";
   - every note explaining a changed structure is swept (standing rule 8).
4. Version in `android/app/build.gradle`: `versionCode` + 1, `versionName` = the release number.

## Merge and build

1. `git checkout main`, then `git merge --no-ff release/x.y`, then run the tests again on `main`.
2. Build the Play bundle with Java 21:
   ```bash
   export JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-21.0.12.101-hotspot"
   npm run build:android            # tsc, vite build --mode android, cap sync
   cd android && ./gradlew bundleRelease
   ```
3. Check the bundle at `android/app/build/outputs/bundle/release/app-release.aab`:
   - signed with the upload key: `keytool -printcert -jarfile` shows SHA-1 `AC:5A:D7:9B:D7:00:21:0E:AB:10:99:A0:3F:A1:C5:81:16:F2:A2:FA`;
   - the new version is in the manifest: `unzip -p <aab> base/manifest/AndroidManifest.xml | grep -a -o '<versionName>'`;
   - a marker of the change is in the bundled JS (`base/assets/public/assets/index-*.js`).
4. Leave the working tree clean. If `cap sync` marks gradle files as modified with no content change, staging them clears it.

## Hand-off

- **Release notes:** English only, short, user-facing, and with no medical claims.
- **The developer pushes `main` (this deploys the web app) and uploads the bundle to Play.** Never push or upload yourself.

## After "pushed and released"

1. Roadmap: "✅ released (date, Play + web)". Build log: "✅ **x.y released date:** main pushed (web) and Play bundle uploaded (versionCode N)." Commit on `main`.
2. Merge `main` into any open release branch.
3. Update the roadmap's "Next session — start here" if the next step changed.
