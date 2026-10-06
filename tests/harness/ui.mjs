// Minimal DOM helpers for jsdom UI tests (no testing-library dependency).
import { createRequire } from "node:module";
import { loadApp, installDom } from "./load-app.mjs";

const require = createRequire(import.meta.url);
installDom();
export const React = require("react");
const { createRoot } = require("react-dom/client");
export const { act } = React;

// The app logs "[sync diag]" lines and React warns about act() for async effects started by the
// app itself (timers, promises). Both are noise for these tests; real errors still surface.
const origLog = console.log;
const origErr = console.error;
console.log = (...a) => (typeof a[0] === "string" && /diag\]/.test(a[0]) ? undefined : origLog(...a));
console.error = (...a) => (typeof a[0] === "string" && /not wrapped in act|act\(\.\.\.\)/.test(a[0]) ? undefined : origErr(...a));

let current = null;
export async function mount(element) {
  await unmount();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  current = { root, container };
  return container;
}
export async function unmount() {
  if (!current) return;
  const { root, container } = current;
  current = null;
  await act(async () => root.unmount());
  container.remove();
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const byTestId = (id, root = document) => root.querySelector(`[data-testid="${id}"]`);
export const buttonByText = (text, root = document) =>
  $$("button", root).find((b) => (typeof text === "string" ? b.textContent.trim().includes(text) : text.test(b.textContent)));
export async function click(el) {
  if (!el) throw new Error("click: element not found");
  await act(async () => el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
}
// React-compatible typing: native value setter + bubbling input event.
export async function type(input, value) {
  if (!input) throw new Error("type: element not found");
  const proto = input.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
export async function blur(el) {
  await act(async () => el.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
}
export async function flush(ms = 0, rounds = 3) {
  for (let i = 0; i < rounds; i++) await act(async () => new Promise((r) => setTimeout(r, ms)));
}
export { loadApp };
