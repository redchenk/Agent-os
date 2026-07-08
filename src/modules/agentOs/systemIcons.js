const systemIconFiles = {
  agent: 'messages.png',
  appCenter: 'app-store.png',
  appStore: 'app-store.png',
  browser: 'browser.png',
  calendar: 'calendar.png',
  camera: 'camera.png',
  calculator: 'calculator.png',
  clock: 'clock.png',
  cloudDrive: 'cloud-drive.png',
  compass: 'compass.png',
  contacts: 'contacts.png',
  downloads: 'downloads.png',
  feedback: 'feedback.png',
  fileManager: 'file-manager.png',
  gallery: 'gallery.png',
  mail: 'mail.png',
  messages: 'messages.png',
  music: 'music.png',
  notes: 'notes.png',
  notepad: 'notes.png',
  recorder: 'recorder.png',
  security: 'security.png',
  settings: 'settings.png',
  start: 'compass.png',
  stream: 'recorder.png',
  tasks: 'tasks.png',
  theme: 'theme.png',
  video: 'video.png',
  weather: 'weather.png',
  yachiyo: 'camera.png'
};

export const systemIconAssets = Object.fromEntries(
  Object.entries(systemIconFiles).map(([key, file]) => [key, `/assets/system-icons/${file}`])
);

export const systemIconDarkAssets = Object.fromEntries(
  Object.entries(systemIconFiles).map(([key, file]) => [key, `/assets/system-icons-dark/${file}`])
);
