export function registerStorage(app) {
  app.services.storage = window.localStorage;
}
