import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import type { ConnectivityTestStatus } from './hooks/useProviderConnectivityTest';
import styles from '@/pages/AiProvidersPage.module.scss';

export interface ProviderConnectivityTestPanelProps {
  title?: string;
  hint?: string;
  testModel: string;
  modelSelectOptions: Array<{ value: string; label: string }>;
  onModelChange: (model: string) => void;
  selectPlaceholder?: string;
  selectEmptyText?: string;
  testStatus: ConnectivityTestStatus;
  testMessage?: string;
  disabled?: boolean;
  canRunSingleTest: boolean;
  canRunAllTest: boolean;
  singleTestActionText?: string;
  singleTestTitle?: string;
  onRunSingleTest: () => void;
  allTestActionText?: string;
  allTestTitle?: string;
  onRunAllTest: () => void;
  extraControls?: ReactNode;
}

export function ProviderConnectivityTestPanel({
  title,
  hint,
  testModel,
  modelSelectOptions,
  onModelChange,
  selectPlaceholder,
  selectEmptyText,
  testStatus,
  testMessage,
  disabled = false,
  canRunSingleTest,
  canRunAllTest,
  singleTestActionText,
  singleTestTitle,
  onRunSingleTest,
  allTestActionText,
  allTestTitle,
  onRunAllTest,
  extraControls,
}: ProviderConnectivityTestPanelProps) {
  const isLoading = testStatus === 'loading';

  return (
    <>
      <div className={styles.modelTestPanel}>
        <div className={styles.modelTestMeta}>
          {title ? <label className={styles.modelTestLabel}>{title}</label> : null}
          {hint ? <span className={styles.modelTestHint}>{hint}</span> : null}
        </div>
        <div className={styles.modelTestControls}>
          <Select
            value={testModel}
            options={modelSelectOptions}
            onChange={onModelChange}
            placeholder={
              modelSelectOptions.length ? selectPlaceholder : selectEmptyText
            }
            className={styles.openaiTestSelect}
            ariaLabel={title}
            disabled={disabled || isLoading || modelSelectOptions.length === 0}
          />
          <Button
            variant={testStatus === 'error' ? 'danger' : 'secondary'}
            size="sm"
            onClick={onRunSingleTest}
            loading={isLoading}
            disabled={disabled || isLoading || !canRunSingleTest}
            title={singleTestTitle || singleTestActionText}
            className={styles.modelTestAllButton}
          >
            {singleTestActionText}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onRunAllTest}
            loading={isLoading}
            disabled={disabled || isLoading || !canRunAllTest}
            title={allTestTitle || allTestActionText}
            className={styles.modelTestAllButton}
          >
            {allTestActionText}
          </Button>
          {extraControls}
        </div>
      </div>
      {testMessage && (
        <div
          className={`status-badge ${
            testStatus === 'error'
              ? 'error'
              : testStatus === 'success'
                ? 'success'
                : 'muted'
          }`}
        >
          {testMessage}
        </div>
      )}
    </>
  );
}
