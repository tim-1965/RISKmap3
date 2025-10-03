// Thin re-export for backwards compatibility with legacy bundle paths.
// The module lives alongside this file, so we import it relative to the
// current directory rather than a nested "components" folder. The previous
// path caused requests to /components/components/AppController.module.js,
// resulting in 404 errors when the app booted in production.
export * from './AppController.module.js';
export { AppController as default } from './AppController.module.js';