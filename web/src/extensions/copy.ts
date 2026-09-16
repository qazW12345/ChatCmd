import type { AppLanguage } from '../i18n';

const en = {
  popupMissingTitle: 'ChatGPT extension is not installed',
  popupMissingDescription: 'Install the ChatCMD browser extension to communicate with ChatGPT directly from this UI.',
  popupOutdatedTitle: 'ChatGPT extension needs an update',
  popupOutdatedDescription: 'The connected extension does not match the version required by this ChatCMD build.',
  goSetup: 'Open installation guide',
  close: 'Close',
  pageEyebrow: 'CHATGPT EXTENSION',
  pageTitle: 'Install the ChatGPT extension',
  pageBody: 'ChatCMD includes the browser integration files beside the application.',
  connected: 'Extension ready',
  missing: 'Extension not detected',
  outdated: 'Extension version mismatch',
  currentVersion: 'Detected version',
  requiredVersion: 'Required version',
  notDetected: 'Not detected',
  checkAgain: 'Check again',
  checking: 'Checking…',
  quickActions: 'Quick actions',
  openBrowser: 'Open browser extensions',
  openBrowserHint: 'Open the extensions management page in the detected browser.',
  openFolder: 'Open extension folder',
  openFolderHint: 'Open the packaged chatgpt-extension folder beside the ChatCMD installation.',
  guideTitle: 'Installation steps',
  step1Title: 'Open the browser extensions page',
  step1Body: 'Open the extensions management page in your browser.',
  step2Title: 'Enable extension development mode',
  step2Body: 'Enable the browser setting that allows loading a local extension.',
  step3Title: 'Load the packaged extension',
  step3Body: 'Select the chatgpt-extension folder that ships beside ChatCMD.',
  step4Title: 'Reload ChatCMD and verify',
  step4Body: 'Return to ChatCMD, reload the page, then use Check again.',
};

export function extensionCopy(_language: AppLanguage) {
  return en;
}
