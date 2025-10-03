// Thin re-export for backwards compatibility with legacy bundle paths.
// This file lives at /public/AppController.js and intentionally re-exports
// the module from the /public/components directory so that legacy imports
// (which expect the component bundle in /components) continue to function.
export * from './components/AppController.module.js';
export { AppController as default } from './components/AppController.module.js';
