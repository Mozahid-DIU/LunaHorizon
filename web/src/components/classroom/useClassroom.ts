"use client";

import { useSyncExternalStore } from "react";

const KEY = "lunahorizon-classroom";
const listeners = new Set<() => void>();
/** Kept here too, so the mode still works where the browser refuses storage. */
let memory: boolean | null = null;

function read(): boolean {
  if (memory !== null) return memory;
  try {
    memory = window.localStorage.getItem(KEY) === "on";
  } catch {
    memory = false;
  }
  return memory;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    // a null key means another tab cleared all storage
    if (event.key !== KEY && event.key !== null) return;
    memory = event.key === null ? false : event.newValue === "on";
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function setClassroom(isOn: boolean): void {
  memory = isOn;
  try {
    if (isOn) window.localStorage.setItem(KEY, "on");
    else window.localStorage.removeItem(KEY);
  } catch {
    // storage blocked: the mode lasts until the page is closed
  }
  listeners.forEach((listener) => listener());
}

/** True while Classroom mode is on. Always off in the server's first render. */
export function useClassroom(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
