import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { ModelEntry } from '../types';

export type ConnectivityTestStatus = 'idle' | 'loading' | 'success' | 'error';
export type ModelRowTestStatus = 'idle' | 'loading' | 'success' | 'error';

export interface UseProviderConnectivityTestOptions<TForm extends { modelEntries: ModelEntry[] }> {
  form: TForm;
  setForm: Dispatch<SetStateAction<TForm>>;
  /** Additional signature values to watch for resetting test status */
  extraSignature?: string;
  /** Controlled testModel state (e.g. from draft store/outlet context) */
  testModel?: string;
  setTestModel?: Dispatch<SetStateAction<string>>;
  /** Controlled testStatus state */
  testStatus?: ConnectivityTestStatus;
  setTestStatus?: Dispatch<SetStateAction<ConnectivityTestStatus>>;
  /** Controlled testMessage state */
  testMessage?: string;
  setTestMessage?: Dispatch<SetStateAction<string>>;
  /** Optional callback when test status should be reset (e.g. reset key test statuses) */
  onReset?: () => void;
}

export function useProviderConnectivityTest<TForm extends { modelEntries: ModelEntry[] }>({
  form,
  setForm,
  extraSignature = '',
  testModel: controlledTestModel,
  setTestModel: controlledSetTestModel,
  testStatus: controlledTestStatus,
  setTestStatus: controlledSetTestStatus,
  testMessage: controlledTestMessage,
  setTestMessage: controlledSetTestMessage,
  onReset,
}: UseProviderConnectivityTestOptions<TForm>) {
  const [internalTestModel, setInternalTestModel] = useState('');
  const [internalTestStatus, setInternalTestStatus] = useState<ConnectivityTestStatus>('idle');
  const [internalTestMessage, setInternalTestMessage] = useState('');
  const [modelTestStatuses, setModelTestStatuses] = useState<Record<string, ModelRowTestStatus>>({});
  const [isTesting, setIsTesting] = useState(false);
  const skipConnectivityResetRef = useRef(false);

  const testModel = controlledTestModel !== undefined ? controlledTestModel : internalTestModel;
  const setTestModel = controlledSetTestModel || setInternalTestModel;

  const testStatus = controlledTestStatus !== undefined ? controlledTestStatus : internalTestStatus;
  const setTestStatus = controlledSetTestStatus || setInternalTestStatus;

  const testMessage = controlledTestMessage !== undefined ? controlledTestMessage : internalTestMessage;
  const setTestMessage = controlledSetTestMessage || setInternalTestMessage;

  const availableModels = useMemo(
    () =>
      form.modelEntries
        .map((entry) => entry.name.trim())
        .filter((name, index, arr) => Boolean(name) && arr.indexOf(name) === index),
    [form.modelEntries]
  );

  const hasConfiguredModels = availableModels.length > 0;

  const modelSelectOptions = useMemo(() => {
    const seen = new Set<string>();
    return form.modelEntries.reduce<Array<{ value: string; label: string }>>((acc, entry) => {
      const name = entry.name.trim();
      if (!name || seen.has(name)) return acc;
      seen.add(name);
      const alias = entry.alias.trim();
      acc.push({
        value: name,
        label: alias && alias !== name ? `${name} (${alias})` : name,
      });
      return acc;
    }, []);
  }, [form.modelEntries]);

  const connectivityConfigSignature = useMemo(() => {
    const modelsSignature = form.modelEntries
      .map((entry) => `${entry.name.trim()}:${entry.alias.trim()}`)
      .join('|');
    return [testModel.trim(), modelsSignature, extraSignature].join('||');
  }, [extraSignature, form.modelEntries, testModel]);

  const previousConnectivityConfigRef = useRef(connectivityConfigSignature);

  useEffect(() => {
    if (!testModel && availableModels.length) {
      setTestModel(availableModels[0]);
      return;
    }
    if (testModel && !availableModels.includes(testModel)) {
      setTestModel(availableModels[0] ?? '');
    }
  }, [availableModels, setTestModel, testModel]);

  useEffect(() => {
    if (previousConnectivityConfigRef.current === connectivityConfigSignature) {
      return;
    }
    previousConnectivityConfigRef.current = connectivityConfigSignature;
    if (skipConnectivityResetRef.current) {
      skipConnectivityResetRef.current = false;
      return;
    }
    setModelTestStatuses({});
    setTestStatus('idle');
    setTestMessage('');
    onReset?.();
  }, [connectivityConfigSignature, onReset, setTestMessage, setTestStatus]);

  const removeModelEntryByName = useCallback(
    (modelName: string) => {
      const normalizedModelName = modelName.trim();
      if (!normalizedModelName) return;

      const next = form.modelEntries.filter((entry) => entry.name.trim() !== normalizedModelName);
      const nextModelEntries = next.length ? next : [{ name: '', alias: '' }];
      const nextTestModel =
        nextModelEntries.find((entry) => entry.name.trim())?.name.trim() ?? '';

      skipConnectivityResetRef.current = true;
      setForm((prev) => ({
        ...prev,
        modelEntries: nextModelEntries,
      }));
      setModelTestStatuses((prev) => {
        const nextStatuses = { ...prev };
        delete nextStatuses[normalizedModelName];
        return nextStatuses;
      });
      setTestModel(nextTestModel);
    },
    [form.modelEntries, setForm, setTestModel]
  );

  const selectNextModel = useCallback(
    (currentModelName: string) => {
      const modelNames = form.modelEntries.map((entry) => entry.name.trim()).filter(Boolean);
      const currentIndex = modelNames.findIndex((name) => name === currentModelName.trim());
      const nextModel = currentIndex >= 0 ? modelNames[currentIndex + 1] : modelNames[0];
      if (nextModel) {
        skipConnectivityResetRef.current = true;
        setTestModel(nextModel);
      }
    },
    [form.modelEntries, setTestModel]
  );

  const resetTestState = useCallback(() => {
    setModelTestStatuses({});
    setTestStatus('idle');
    setTestMessage('');
  }, [setTestMessage, setTestStatus]);

  const markSkipConnectivityReset = useCallback(() => {
    skipConnectivityResetRef.current = true;
  }, []);

  return {
    testModel,
    setTestModel,
    testStatus,
    setTestStatus,
    testMessage,
    setTestMessage,
    modelTestStatuses,
    setModelTestStatuses,
    isTesting,
    setIsTesting,
    availableModels,
    hasConfiguredModels,
    modelSelectOptions,
    skipConnectivityResetRef,
    markSkipConnectivityReset,
    removeModelEntryByName,
    selectNextModel,
    resetTestState,
  };
}
