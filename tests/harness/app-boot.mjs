// Boots the full <App/> as a GUEST (no session) in jsdom, past the intro video, with optional
// seeded localStorage data in the guest namespace. No network: Supabase is the in-memory fake.
import { React, mount, flush, act, loadApp } from "./ui.mjs";
import { resetStorage } from "./load-app.mjs";

export async function bootGuestApp(seed = {}) {
  const A = await loadApp();
  resetStorage();
  A.__testState.resetActiveDataNamespace();
  localStorage.setItem("trainapp_onboarding_completed_v1", "true");
  for (const [name, value] of Object.entries(seed)) localStorage.setItem(`nextrep_guest_${name}_v1`, JSON.stringify(value));
  const container = await mount(React.createElement(A.App));
  const video = document.querySelector("video");
  if (video) await act(async () => video.dispatchEvent(new Event("ended")));
  await flush(20, 5);
  return { A, container };
}

// Boots the full <App/> with an optional SESSION (fake Supabase) and raw localStorage entries
// (key → value; objects are JSON-stringified). Options:
//   session      — { user: { id } } or null (guest)
//   storage      — { "full_key": value }
//   holdSession  — getSession() stays pending (SDK still trying to refresh, e.g. offline)
//   offline      — navigator.onLine reports false while the app runs (restored by restoreOnline())
//   tables       — rows of the fake Supabase tables ({ table: [rows] }), deep-copied
//   setupFake    — (fakeSupabase) => void, called right before mounting (e.g. install a queryHook)
export async function bootApp({ session = null, storage = {}, holdSession = false, offline = false, tables = null, setupFake = null } = {}) {
  const A = await loadApp();
  resetStorage();
  A.__testState.resetActiveDataNamespace();
  localStorage.setItem("trainapp_onboarding_completed_v1", "true");
  for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
  const S = globalThis.__nrSupabase;
  S.session = session;
  S.holdGetSession = holdSession;
  if (tables) S.tables = JSON.parse(JSON.stringify(tables));
  if (setupFake) setupFake(S);
  if (offline) Object.defineProperty(globalThis.navigator, "onLine", { value: false, configurable: true });
  await mount(React.createElement(A.App));
  const video = document.querySelector("video");
  if (video) await act(async () => video.dispatchEvent(new Event("ended")));
  await flush(20, 5);
  return { A, S };
}
export function restoreOnline() {
  try {
    delete globalThis.navigator.onLine;
  } catch {}
}
