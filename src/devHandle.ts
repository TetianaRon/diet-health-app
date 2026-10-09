// Local dev server only: the app's own module instances on `window.__tmm`, so
// checks in the running app (docs/tasks/dha-task-device-testing.md) read and
// save through the same signed-in session as the screens. Never in a build.
import * as sheets from "./lib/sheets";
import * as ingredients from "./lib/ingredients";
import * as dishes from "./lib/dishes";
import * as dailyLog from "./lib/dailyLog";
import * as sync from "./lib/sync";
import * as medications from "./lib/medications";
import * as bloodSugar from "./lib/bloodSugar";
import * as recordStore from "./lib/recordStore";

(window as unknown as { __tmm: unknown }).__tmm = { sheets, ingredients, dishes, dailyLog, sync, medications, bloodSugar, recordStore };
