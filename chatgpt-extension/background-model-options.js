const MODEL_OPTIONS_PREPARED_TAB_PREFIX = 'chatcmd-prepared-tab:';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'chatcmd-local-command' || message.action !== 'model-options') return false;
  void discoverModelOptionsForSource(sender.tab?.id, message.newConversationUrl)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: modelOptionsErrorMessage(error) }));
  return true;
});

async function discoverModelOptionsForSource(sourceTabId, newConversationUrl) {
  if (!sourceTabId) throw new Error('Could not determine the current ChatCMD tab.');
  const target = normalizeNewConversationUrl(newConversationUrl);
  let tab = await preparedTabForSource(sourceTabId, target);
  if (!tab?.id) {
    tab = await findAvailableNewConversationTab(target);
    if (!tab?.id) tab = await chrome.tabs.create({ url: target, active: false });
  }
  if (!tab?.id) throw new Error('Could not open a ChatGPT tab to inspect available models.');

  // Reserve the same inactive tab for the eventual send. Discovery must not steal
  // focus or require the user to interact with a ChatCMD-controlled ChatGPT tab.
  await chrome.storage.session.set({
    [`${MODEL_OPTIONS_PREPARED_TAB_PREFIX}${sourceTabId}`]: { tabId: tab.id, target },
  });
  await bindReturnSource(tab.id, sourceTabId);
  await waitForTab(tab.id);
  await waitForChatGptReady(tab.id);

  const response = await sendToChatGpt(tab.id, { type: 'chatcmd-chatgpt-model-options' });
  const models = uniqueModelOptionStrings(response?.models);
  const reasoningOptions = uniqueModelOptionStrings(response?.reasoningOptions);
  const refreshedTab = await safeTab(tab.id);
  return {
    models,
    reasoningOptions,
    currentModel: cleanReturnedOption(response?.currentModel),
    currentReasoning: cleanReturnedOption(response?.currentReasoning),
    tabId: tab.id,
    tabUrl: refreshedTab?.url || tab.url,
  };
}

function uniqueModelOptionStrings(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const cleaned = cleanReturnedOption(value);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    result.push(cleaned);
  }
  return result;
}

function cleanReturnedOption(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function modelOptionsErrorMessage(error) {
  return error instanceof Error ? error.message : String(error || 'Could not inspect ChatGPT model options.');
}
