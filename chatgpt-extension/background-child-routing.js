(() => {
const CHILD_ROUTE_PREFIX = '__CHATCMD_CHILD_ROUTE_V1__:';
const originalSendMessage = chrome.tabs.sendMessage.bind(chrome.tabs);

chrome.tabs.sendMessage = async function patchedSendMessage(tabId, message, ...rest) {
  if (!message || message.type !== 'chatcmd-chatgpt-run' || typeof message.model !== 'string') {
    return originalSendMessage(tabId, message, ...rest);
  }
  const route = childRoute(message.model);
  if (!route) return originalSendMessage(tabId, message, ...rest);
  if (rest.length) return originalSendMessage(tabId, message, ...rest);

  const selection = await originalSendMessage(tabId, {
    type: 'chatcmd-chatgpt-select-choices',
    model: route.model,
    reasoning: route.reasoning,
  });
  if (!selection?.ok) {
    throw new Error(selection?.error || `Could not apply child reasoning “${route.reasoning}”.`);
  }
  return originalSendMessage(tabId, { ...message, model: route.model });
};

function childRoute(value) {
  if (!value.startsWith(CHILD_ROUTE_PREFIX)) return null;
  try {
    const parsed = JSON.parse(value.slice(CHILD_ROUTE_PREFIX.length));
    const model = clean(parsed?.model) || 'Auto';
    const reasoning = clean(parsed?.reasoning) || 'Auto';
    return { model, reasoning };
  } catch {
    return null;
  }
}

function clean(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}
})();
