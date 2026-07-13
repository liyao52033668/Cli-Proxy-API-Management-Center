import { useEffect, useId, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import styles from './ListPagination.module.scss';

interface ListPaginationProps {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  disabled?: boolean;
  onPageChange: (page: number) => void;
  className?: string;
}

/** Build page items with ellipsis for large ranges, e.g. 1 … 4 5 6 … 20 */
function buildPageItems(currentPage: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const items: Array<number | 'ellipsis'> = [];
  const add = (value: number | 'ellipsis') => {
    if (items[items.length - 1] === value) return;
    items.push(value);
  };

  const windowStart = Math.max(2, currentPage - 1);
  const windowEnd = Math.min(totalPages - 1, currentPage + 1);

  add(1);
  if (windowStart > 2) add('ellipsis');
  for (let page = windowStart; page <= windowEnd; page += 1) {
    add(page);
  }
  if (windowEnd < totalPages - 1) add('ellipsis');
  add(totalPages);

  return items;
}

export function ListPagination({
  currentPage,
  totalPages,
  totalCount,
  disabled = false,
  onPageChange,
  className = ''
}: ListPaginationProps) {
  const { t } = useTranslation();
  const jumpInputId = useId();
  const [draftPage, setDraftPage] = useState(String(currentPage));

  useEffect(() => {
    setDraftPage(String(currentPage));
  }, [currentPage]);

  const pageItems = useMemo(
    () => buildPageItems(currentPage, totalPages),
    [currentPage, totalPages]
  );

  if (totalCount <= 0 || totalPages <= 1) {
    return null;
  }

  const clampPage = (page: number) => Math.max(1, Math.min(totalPages, page));

  const commitJump = () => {
    const parsed = Number.parseInt(draftPage, 10);
    if (!Number.isFinite(parsed)) {
      setDraftPage(String(currentPage));
      return;
    }
    const nextPage = clampPage(parsed);
    setDraftPage(String(nextPage));
    if (nextPage !== currentPage) {
      onPageChange(nextPage);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (disabled) return;
    commitJump();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (disabled) return;
      commitJump();
    }
  };

  return (
    <div className={`${styles.pagination} ${className}`.trim()}>
      <div className={styles.mainControls}>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(clampPage(currentPage - 1))}
          disabled={disabled || currentPage <= 1}
          aria-label={t('auth_files.pagination_prev')}
        >
          {t('auth_files.pagination_prev')}
        </Button>

        <nav className={styles.pageNumbers} aria-label={t('auth_files.pagination_nav_aria')}>
          {pageItems.map((item, index) =>
            item === 'ellipsis' ? (
              <span key={`ellipsis-${index}`} className={styles.ellipsis} aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                className={`${styles.pageNumber} ${
                  item === currentPage ? styles.pageNumberActive : ''
                }`}
                onClick={() => onPageChange(item)}
                disabled={disabled || item === currentPage}
                aria-label={t('auth_files.pagination_page_aria', { page: item })}
                aria-current={item === currentPage ? 'page' : undefined}
              >
                {item}
              </button>
            )
          )}
        </nav>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(clampPage(currentPage + 1))}
          disabled={disabled || currentPage >= totalPages}
          aria-label={t('auth_files.pagination_next')}
        >
          {t('auth_files.pagination_next')}
        </Button>
      </div>

      <div className={styles.metaRow}>
        <div className={styles.pageInfo}>
          {t('auth_files.pagination_info', {
            current: currentPage,
            total: totalPages,
            count: totalCount
          })}
        </div>

        <form className={styles.pageJump} onSubmit={handleSubmit}>
          <label className={styles.pageJumpLabel} htmlFor={jumpInputId}>
            {t('auth_files.pagination_jump_label')}
          </label>
          <input
            id={jumpInputId}
            className={styles.pageJumpInput}
            type="number"
            min={1}
            max={totalPages}
            inputMode="numeric"
            value={draftPage}
            disabled={disabled}
            onChange={(event) => setDraftPage(event.target.value)}
            onBlur={() => {
              if (!disabled) commitJump();
            }}
            onKeyDown={handleKeyDown}
            aria-label={t('auth_files.pagination_jump_aria')}
          />
          {t('auth_files.pagination_jump_unit') ? (
            <span className={styles.pageJumpLabel}>{t('auth_files.pagination_jump_unit')}</span>
          ) : null}
          <Button type="submit" variant="secondary" size="sm" disabled={disabled}>
            {t('auth_files.pagination_jump_go')}
          </Button>
        </form>
      </div>
    </div>
  );
}
