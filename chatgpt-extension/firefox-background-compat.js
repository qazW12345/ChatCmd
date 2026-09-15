// Firefox Manifest V3 runs background.scripts as an event page rather than an
// extension service worker. The dependency scripts are already loaded by the
// manifest in the same order used by background.js, so make the service-worker
// importScripts(...) bootstrap a no-op in that environment.
//
// Chromium ignores background.scripts for Manifest V3 and therefore never loads
// this shim; its native service-worker importScripts implementation is unchanged.
if (typeof globalThis.importScripts !== 'function') {
  globalThis.importScripts = () => {};
}
