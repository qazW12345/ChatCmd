(() => {
const CONTENT_CONTEXT = globalThis.ChatCmdRuntime.install('chatgpt-model-options');
const { isVisible } = globalThis.ChatCmdConversationDom;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!globalThis.ChatCmdRuntime.current(CONTENT_CONTEXT)) return false;
  if (message?.type === 'chatcmd-chatgpt-model-options') {
    void discoverChatGptChoices()
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: modelChoiceErrorMessage(error) }));
    return true;
  }
  if (message?.type === 'chatcmd-chatgpt-select-choices') {
    void selectChoices(message.model, message.reasoning)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: modelChoiceErrorMessage(error) }));
    return true;
  }
  return false;
});

async function discoverChatGptChoices() {
  const model = await discoverMenu(findModelSwitcherButton, cleanModelLabel, true);
  const reasoning = await discoverMenu(findReasoningSwitcherButton, cleanReasoningLabel, true);
  if (!model.options.length) {
    throw new Error(`No ChatGPT model choices were discovered. Visible control diagnostics: ${modelControlDiagnostics()}`);
  }
  return {
    currentModel: model.current || 'Auto',
    models: model.options,
    currentReasoning: reasoning.current || '',
    reasoningOptions: reasoning.options,
  };
}

async function selectChoices(model, reasoning) {
  await selectMenuChoice(model, findModelSwitcherButton, cleanModelLabel, 'model', true);
  await selectMenuChoice(reasoning, findReasoningSwitcherButton, cleanReasoningLabel, 'reasoning mode', true);
}

async function selectMenuChoice(value, findButton, cleanLabel, kind, includeComposer) {
  const target = cleanLabel(value);
  if (!target || /^auto$/i.test(target)) return;
  const button = findButton();
  if (!button) throw new Error(`ChatGPT is not currently showing a ${kind} selector. Use Auto in ChatCMD.`);
  const current = cleanLabel(button.textContent || button.getAttribute('aria-label') || '');
  if (normalizeLabel(current) === normalizeLabel(target)) return;
  const wasExpanded = button.getAttribute('aria-expanded') === 'true';
  if (!wasExpanded) {
    button.click();
    await delay(180);
  }
  const options = await waitForMenuOptions(includeComposer);
  const wanted = normalizeLabel(target);
  const option = options.find((item) => normalizeLabel(cleanLabel(optionLabel(item))) === wanted)
    || options.find((item) => normalizeLabel(cleanLabel(optionLabel(item))).includes(wanted));
  if (!option) {
    if (!wasExpanded) closeMenu(button);
    throw new Error(`Could not find ${kind} “${target}” in the ChatGPT menu.`);
  }
  option.click();
  await delay(180);
}

async function discoverMenu(findButton, cleanLabel, includeComposer) {
  const button = findButton();
  if (!button) return { current: '', options: [] };
  const current = cleanLabel(button.textContent || button.getAttribute('aria-label') || '');
  const wasExpanded = button.getAttribute('aria-expanded') === 'true';
  if (!wasExpanded) {
    button.click();
    await delay(180);
  }
  let options = [];
  try {
    const items = await waitForMenuOptions(includeComposer);
    options = uniqueLabels(items.map((item) => cleanLabel(optionLabel(item))).filter(Boolean));
  } finally {
    if (!wasExpanded) {
      closeMenu(button);
      await delay(120);
    }
  }
  return { current, options };
}

async function waitForMenuOptions(includeComposer) {
  const started = Date.now();
  while (Date.now() - started < 4_000) {
    const options = visibleMenuOptions(includeComposer);
    if (options.length) return options;
    await delay(50);
  }
  return [];
}

function visibleMenuOptions(includeComposer) {
  return [...document.querySelectorAll('[role="menuitem"], [role="option"], [data-radix-collection-item]')]
    .filter((item) => isVisible(item)
      && item.getAttribute('aria-disabled') !== 'true'
      && (includeComposer || !item.closest('form[data-type="unified-composer"]')));
}

function findModelSwitcherButton() {
  const selectors = [
    'button[data-testid="model-switcher-dropdown-button"]',
    'button[data-testid*="model" i]',
    'button[aria-label*="model" i]',
    'button[id*="model" i]',
  ];
  for (const selector of selectors) {
    for (const button of document.querySelectorAll(selector)) {
      if (isVisible(button) && looksLikeModelSwitcher(button)) return button;
    }
  }

  const candidates = [
    ...document.querySelectorAll('form[data-type="unified-composer"] button[aria-haspopup="menu"], form[data-type="unified-composer"] button[aria-haspopup="listbox"]'),
    ...document.querySelectorAll('#page-header button[aria-haspopup="menu"], #page-header button[aria-haspopup="listbox"]'),
  ];
  return candidates.find((button) => isVisible(button) && looksLikeModelSwitcher(button)) || null;
}

function looksLikeModelSwitcher(button) {
  const testId = cleanLabel(button.getAttribute('data-testid') || '');
  const id = cleanLabel(button.id || button.getAttribute('id') || '');
  const aria = cleanLabel(button.getAttribute('aria-label') || '');
  if (/model/i.test(testId) || /model/i.test(id) || /model/i.test(aria)) return true;
  const label = cleanModelLabel(button.textContent || aria);
  return /^auto$/i.test(label) || looksLikeModelLabel(label);
}

function modelControlDiagnostics() {
  const containers = [
    document.querySelector('form[data-type="unified-composer"]'),
    document.querySelector('#page-header'),
  ].filter(Boolean);
  const pool = containers.length
    ? containers.flatMap((container) => [...container.querySelectorAll('button, [role="button"], [role="combobox"]')])
    : [...document.querySelectorAll('button, [role="button"], [role="combobox"]')];
  const visible = pool.filter((element) => isVisible(element));
  const preferred = visible.filter((element) => /model|gpt|auto|thinking|reasoning|instant|medium|high|pro|sol|luna/i.test(controlDiagnosticText(element)));
  const candidates = (preferred.length ? preferred : visible).slice(0, 10);
  if (!candidates.length) return 'no visible buttons/comboboxes in composer or page header';
  return candidates.map((element) => describeControl(element)).join(' | ');
}

function controlDiagnosticText(element) {
  return [
    element.textContent,
    element.getAttribute('aria-label'),
    element.getAttribute('data-testid'),
    element.getAttribute('id'),
  ].filter(Boolean).join(' ');
}

function describeControl(element) {
  const text = diagnosticValue(element.textContent);
  const aria = diagnosticValue(element.getAttribute('aria-label'));
  const testId = diagnosticValue(element.getAttribute('data-testid'));
  const id = diagnosticValue(element.getAttribute('id'));
  const popup = diagnosticValue(element.getAttribute('aria-haspopup'));
  const role = diagnosticValue(element.getAttribute('role'));
  return `<${String(element.tagName || 'element').toLowerCase()}> text="${text}" aria="${aria}" testid="${testId}" id="${id}" popup="${popup}" role="${role}"`;
}

function diagnosticValue(value) {
  const cleaned = cleanLabel(value || '').replace(/[|<>]/g, ' ').trim();
  return cleaned.length > 80 ? `${cleaned.slice(0, 77)}...` : cleaned;
}

function findReasoningSwitcherButton() {
  const selectors = [
    'button[data-testid*="reasoning" i]',
    'button[data-testid*="thinking" i]',
    'button[aria-label*="reasoning" i]',
    'button[aria-label*="thinking effort" i]',
  ];
  for (const selector of selectors) {
    for (const button of document.querySelectorAll(selector)) {
      if (isVisible(button)) return button;
    }
  }
  return null;
}

function closeMenu(button) {
  if (button.getAttribute('aria-expanded') === 'true') button.click();
  else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

function optionLabel(item) {
  const aria = item.getAttribute('aria-label');
  if (aria?.trim()) return aria;
  const text = String(item.innerText || item.textContent || '').trim();
  return text.split(/\r?\n/).map((part) => part.trim()).find(Boolean) || '';
}

function cleanModelLabel(value) {
  const text = cleanLabel(value).replace(/^model\s*[:：-]?\s*/i, '').trim();
  const ignored = ['model', 'models', 'select model', 'choose model', 'chatgpt', 'more models', 'legacy models', 'learn more'];
  if (!text || ignored.includes(text.toLowerCase()) || text.length > 100) return '';
  return text;
}

function cleanReasoningLabel(value) {
  const text = cleanLabel(value)
    .replace(/^(?:reasoning|thinking(?:\s+effort)?)\s*[:：-]?\s*/i, '')
    .trim();
  const ignored = ['reasoning', 'thinking', 'thinking effort', 'select reasoning', 'choose reasoning', 'learn more'];
  if (!text || ignored.includes(text.toLowerCase()) || text.length > 80) return '';
  return text;
}

function cleanLabel(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function looksLikeModelLabel(value) {
  const text = String(value || '').trim();
  return Boolean(text) && /^(?:GPT(?:[-\s]?[0-9][\w.-]*)?(?:\s+(?:Pro|Thinking|Instant|Mini|Sol|Luna))?|o[1-9](?:[-\s][\w.-]+)?)$/i.test(text);
}
function uniqueLabels(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const normalized = normalizeLabel(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(value);
  }
  return result;
}
function normalizeLabel(value) { return cleanLabel(value).toLowerCase(); }
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function modelChoiceErrorMessage(error) { return error instanceof Error ? error.message : String(error || 'Could not inspect ChatGPT choices.'); }
})();
