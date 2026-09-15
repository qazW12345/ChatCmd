import { LoaderCircle, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { applyChatGptChoices, discoverChatGptModelOptions } from '../chatgptModelBridge';
import { tr } from '../i18n';

const AUTO = 'Auto';

export function ChatGptModelPicker({
  value,
  reasoningValue,
  onChange,
  onReasoningChange,
  disabled = false,
  extensionReady,
  newConversationUrl,
}: {
  value: string;
  reasoningValue: string;
  onChange: (value: string) => void;
  onReasoningChange: (value: string) => void;
  disabled?: boolean;
  extensionReady: boolean | null;
  newConversationUrl?: string;
}) {
  const [models, setModels] = useState<string[]>([]);
  const [reasoningOptions, setReasoningOptions] = useState<string[]>([]);
  const [currentModel, setCurrentModel] = useState('');
  const [currentReasoning, setCurrentReasoning] = useState('');
  const [loading, setLoading] = useState(false);
  const [warning, setWarning] = useState('');

  const loadOptions = useCallback(async () => {
    const options = await discoverChatGptModelOptions(newConversationUrl);
    setModels(options.models);
    setReasoningOptions(options.reasoningOptions);
    setCurrentModel(options.currentModel ?? '');
    setCurrentReasoning(options.currentReasoning ?? '');
  }, [newConversationUrl]);

  const refresh = useCallback(async () => {
    if (extensionReady !== true || loading) return;
    setLoading(true); setWarning('');
    try {
      await loadOptions();
    } catch (reason) {
      setWarning(reason instanceof Error ? reason.message : tr('Could not read the available ChatGPT models.'));
    } finally {
      setLoading(false);
    }
  }, [extensionReady, loadOptions, loading]);

  const selectModel = async (nextModel: string) => {
    onChange(nextModel);
    if (extensionReady !== true || loading || nextModel.toLowerCase() === AUTO.toLowerCase()) return;

    // Reasoning controls can depend on the selected model. Apply the model to the
    // inactive prepared tab first, clear a possibly stale reasoning choice, then
    // read the model-specific reasoning choices back into ChatCMD.
    onReasoningChange(AUTO);
    setLoading(true); setWarning('');
    try {
      await applyChatGptChoices(nextModel, AUTO, newConversationUrl);
      await loadOptions();
    } catch (reason) {
      setWarning(reason instanceof Error ? reason.message : tr('Could not apply the selected ChatGPT model.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (extensionReady !== true) return;
    void refresh();
    // refresh intentionally changes identity while loading; auto-discovery should run once
    // for each ready state / destination URL, not recursively on loading transitions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extensionReady, newConversationUrl]);

  const modelChoices = useMemo(() => uniqueChoices([AUTO, value, ...models]), [models, value]);
  const reasoningChoices = useMemo(() => uniqueChoices([AUTO, reasoningValue, ...reasoningOptions]), [reasoningOptions, reasoningValue]);
  const showReasoning = reasoningOptions.length > 0 || reasoningValue.toLowerCase() !== AUTO.toLowerCase();
  const detail = warning
    ? warning
    : currentModel
      ? tr('Live ChatGPT choice: {model}{reasoning}', { model: currentModel, reasoning: currentReasoning ? ` · ${currentReasoning}` : '' })
      : loading
        ? tr('Reading available choices from ChatGPT…')
        : tr('Auto leaves ChatGPT’s current choice unchanged.');

  return <div className="chatgpt-model-picker">
    <span>{tr('Model / reasoning')}</span>
    <div className="chatgpt-model-picker-row">
      <label className="sr-only" htmlFor="chatgpt-model-choice">{tr('Model')}</label>
      <select id="chatgpt-model-choice" className="chatgpt-model-select" value={value} onChange={(event) => void selectModel(event.target.value)} disabled={disabled || loading || extensionReady !== true}>
        {modelChoices.map((choice) => <option value={choice} key={choice}>{choice}</option>)}
      </select>
      {showReasoning && <>
        <label className="sr-only" htmlFor="chatgpt-reasoning-choice">{tr('Reasoning')}</label>
        <select id="chatgpt-reasoning-choice" className="chatgpt-model-select" value={reasoningValue} onChange={(event) => onReasoningChange(event.target.value)} disabled={disabled || loading || extensionReady !== true}>
          {reasoningChoices.map((choice) => <option value={choice} key={choice}>{choice === AUTO ? tr('Reasoning: Auto') : choice}</option>)}
        </select>
      </>}
      <button className="chatgpt-model-select" type="button" onClick={() => void refresh()} disabled={disabled || loading || extensionReady !== true} title={tr('Refresh ChatGPT model choices')} aria-label={tr('Refresh ChatGPT model choices')}>
        {loading ? <LoaderCircle className="spin" /> : <RefreshCw />}
      </button>
      <small title={detail}>{detail}</small>
    </div>
  </div>;
}

function uniqueChoices(values: string[]) {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const cleaned = value.trim();
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result;
}
