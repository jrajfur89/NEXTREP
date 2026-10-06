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
