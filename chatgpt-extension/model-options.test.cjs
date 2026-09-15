const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const extensionRoot = __dirname;
const repoRoot = path.resolve(extensionRoot, '..');

function read(relative) {
  return fs.readFileSync(path.join(repoRoot, relative), 'utf8');
}

test('manifest loads model discovery in Chromium and Firefox paths', () => {
  const manifest = JSON.parse(read('chatgpt-extension/manifest.json'));
  assert.equal(manifest.version, '0.1.18');
  assert.equal(manifest.background.service_worker, 'background-entry.js');
  assert.ok(manifest.background.scripts.includes('background-model-options.js'));
  const chatgpt = manifest.content_scripts.find((entry) => entry.matches.includes('https://chatgpt.com/*') && entry.world !== 'MAIN');
  assert.ok(chatgpt);
  assert.ok(chatgpt.js.includes('content-chatgpt-models.js'));
  assert.match(read('chatgpt-extension/background-entry.js'), /background\.js.*background-model-options\.js/);
});

test('web and manifest require the same extension protocol version', () => {
  const manifest = JSON.parse(read('chatgpt-extension/manifest.json'));
  const bridge = read('web/src/chatgptBridge.ts');
  assert.match(bridge, new RegExp(`REQUIRED_CHATGPT_EXTENSION_VERSION = '${manifest.version.replace(/\./g, '\\.')}'`));
});

test('new conversation preserves pre-applied browser choices on dispatch', () => {
  const page = read('web/src/pages/NewChatGptConversationPage.tsx');
  const apply = page.indexOf('await applyChatGptChoices(model, reasoning, newConversationUrl)');
  const create = page.indexOf('api.createChatGptRequest');
  const dispatch = page.indexOf('dispatchChatGptRequest({');
  assert.ok(apply >= 0 && create > apply && dispatch > create);
  assert.match(page.slice(dispatch, dispatch + 320), /model:\s*AUTO/);
  assert.doesNotMatch(page.slice(dispatch, dispatch + 320), /model:\s*request\.model/);
});

test('content bridge discovers composer-hosted model picker and applies live choices', async () => {
  const source = read('chatgpt-extension/content-chatgpt-models.js');
  new vm.Script(source, { filename: 'content-chatgpt-models.js' });

  let listener;
  let openMenu = '';
  let currentModel = 'GPT-5.6 Sol';
  let currentReasoning = 'Medium';

  const modelOptions = [
    choice('GPT-5.6 Sol', () => { currentModel = 'GPT-5.6 Sol'; openMenu = ''; }, true),
    choice('GPT-5.6 Luna', () => { currentModel = 'GPT-5.6 Luna'; openMenu = ''; }, true),
  ];
  const reasoningOptions = [
    choice('Medium', () => { currentReasoning = 'Medium'; openMenu = ''; }, true),
    choice('High', () => { currentReasoning = 'High'; openMenu = ''; }, true),
  ];
  const modelButton = menuButton('model', () => currentModel, true);
  const reasoningButton = menuButton('reasoning', () => currentReasoning, true);

  function menuButton(kind, label, insideComposer = false) {
    return {
      get textContent() { return label(); },
      get id() { return ''; },
      getAttribute(name) {
        if (name === 'aria-expanded') return openMenu === kind ? 'true' : 'false';
        if (name === 'aria-label') return kind === 'reasoning' ? `Thinking effort: ${label()}` : null;
        if (name === 'data-testid') return kind === 'model' ? 'model-switcher-dropdown-button' : null;
        if (name === 'id') return '';
        return null;
      },
      closest(selector) { return insideComposer && selector.includes('unified-composer') ? {} : null; },
      click() { openMenu = openMenu === kind ? '' : kind; },
    };
  }

  function choice(label, click, insideComposer = false) {
    return {
      textContent: label,
      innerText: label,
      getAttribute(name) { return name === 'aria-disabled' ? 'false' : null; },
      closest(selector) { return insideComposer && selector.includes('unified-composer') ? {} : null; },
      click,
    };
  }

  const document = {
    querySelectorAll(selector) {
      if (selector === 'button[data-testid="model-switcher-dropdown-button"]') return [modelButton];
      if (selector === 'button[data-testid*="model" i]') return [modelButton];
      if (selector === 'button[data-testid*="reasoning" i]') return [reasoningButton];
      if (selector.includes('[role="menuitem"]')) {
        if (openMenu === 'model') return modelOptions;
        if (openMenu === 'reasoning') return reasoningOptions;
      }
      return [];
    },
    querySelector() { return null; },
    dispatchEvent() {},
  };

  const context = {
    console,
    document,
    KeyboardEvent: class KeyboardEvent {},
    setTimeout(callback) { callback(); return 0; },
    ChatCmdRuntime: { install: () => 'ctx', current: () => true },
    ChatCmdConversationDom: { isVisible: () => true },
    chrome: { runtime: { onMessage: { addListener(value) { listener = value; } } } },
  };
  vm.runInNewContext(source, context, { filename: 'content-chatgpt-models.js' });
  assert.equal(typeof listener, 'function');

  const discovered = await invoke(listener, { type: 'chatcmd-chatgpt-model-options' });
  assert.equal(discovered.ok, true);
  assert.deepEqual([...discovered.models], ['GPT-5.6 Sol', 'GPT-5.6 Luna']);
  assert.deepEqual([...discovered.reasoningOptions], ['Medium', 'High']);
  assert.equal(discovered.currentModel, 'GPT-5.6 Sol');
  assert.equal(discovered.currentReasoning, 'Medium');
  assert.equal(openMenu, '');

  const applied = await invoke(listener, { type: 'chatcmd-chatgpt-select-choices', model: 'GPT-5.6 Luna', reasoning: 'High' });
  assert.equal(applied.ok, true);
  assert.equal(currentModel, 'GPT-5.6 Luna');
  assert.equal(currentReasoning, 'High');
  assert.equal(openMenu, '');
});

function invoke(listener, message) {
  return new Promise((resolve, reject) => {
    const keepChannel = listener(message, {}, resolve);
    if (keepChannel !== true) reject(new Error(`Listener did not accept ${message.type}`));
  });
}
