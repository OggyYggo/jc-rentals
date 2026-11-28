export function readStorage(key: string, session = false) {
  try { return (session ? window.sessionStorage : window.localStorage).getItem(key); }
  catch { return null; }
}

export function writeStorage(key: string, value: string, session = false) {
  try { (session ? window.sessionStorage : window.localStorage).setItem(key, value); return true; }
  catch { return false; }
}
