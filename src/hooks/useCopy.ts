import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotificationStore } from '@/stores/useNotificationStore';
import { copyToClipboard } from '@/utils/clipboard';

export interface UseCopyOptions {
  /** 自定义成功提示文本或 i18n key，默认 'notification.link_copied' */
  successMessage?: string;
  /** 自定义失败提示文本或 i18n key，默认 'notification.copy_failed' */
  errorMessage?: string;
  /** 成功时是否在提示后拼接复制的内容，例如 ": modelId" */
  includeValueInSuccess?: boolean;
  /** 是否静默复制（不触发 notification） */
  silent?: boolean;
  /** 弹窗提示持续时间 (ms) */
  duration?: number;
}

export function useCopy(defaultOptions?: UseCopyOptions) {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const [copied, setCopied] = useState(false);
  const [isCopying, setIsCopying] = useState(false);

  const copy = useCallback(
    async (text: string, options?: UseCopyOptions): Promise<boolean> => {
      if (!text && text !== '') return false;
      const opts = { ...defaultOptions, ...options };
      setIsCopying(true);

      try {
        const ok = await copyToClipboard(text);
        setCopied(ok);

        if (!opts.silent) {
          if (ok) {
            const baseMsg = opts.successMessage
              ? t(opts.successMessage, { defaultValue: opts.successMessage })
              : t('notification.link_copied', { defaultValue: 'Copied to clipboard' });

            const message = opts.includeValueInSuccess ? `${baseMsg}: ${text}` : baseMsg;
            showNotification(message, 'success', opts.duration);
          } else {
            const message = opts.errorMessage
              ? t(opts.errorMessage, { defaultValue: opts.errorMessage })
              : t('notification.copy_failed', { defaultValue: 'Copy failed' });

            showNotification(message, 'error', opts.duration);
          }
        }
        return ok;
      } finally {
        setIsCopying(false);
      }
    },
    [defaultOptions, showNotification, t]
  );

  return { copy, copied, isCopying };
}
