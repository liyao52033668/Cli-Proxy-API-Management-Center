import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from 'react';
import { createPortal } from 'react-dom';
import { IconChevronDown, IconSearch } from './icons';
import styles from './Select.module.scss';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  options: ReadonlyArray<SelectOption>;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  fullWidth?: boolean;
  id?: string;
  dropdownDirection?: 'auto' | 'up' | 'down';
  /** 展开后在列表顶部提供输入框，按 label/value 子串过滤候选项。 */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** 过滤后没有任何候选项时展示的文案。 */
  noMatchText?: string;
}

const VIEWPORT_MARGIN = 8;
const DROPDOWN_OFFSET = 6;
const DROPDOWN_MAX_HEIGHT = 240;
/** 搜索框（含分隔线）占用的高度，搜索模式下补进下拉总高。 */
const SEARCH_BAR_HEIGHT = 44;
const DROPDOWN_Z_INDEX = 2010;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const resolveDropdownStyle = (
  element: HTMLElement,
  dropdownDirection: 'auto' | 'up' | 'down' = 'auto',
  maxHeightLimit: number = DROPDOWN_MAX_HEIGHT
): CSSProperties => {
  const rect = element.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.min(rect.width, Math.max(0, viewportWidth - VIEWPORT_MARGIN * 2));
  const left = clamp(
    rect.left,
    VIEWPORT_MARGIN,
    Math.max(VIEWPORT_MARGIN, viewportWidth - width - VIEWPORT_MARGIN)
  );
  const spaceBelow = viewportHeight - rect.bottom - VIEWPORT_MARGIN - DROPDOWN_OFFSET;
  const spaceAbove = rect.top - VIEWPORT_MARGIN - DROPDOWN_OFFSET;

  let direction: 'up' | 'down';
  if (dropdownDirection === 'auto') {
    // 方向判断仍以基础高度为准，避免多出的搜索框高度把下拉硬翻到上方。
    direction = spaceBelow >= DROPDOWN_MAX_HEIGHT || spaceBelow >= spaceAbove ? 'down' : 'up';
  } else {
    direction = dropdownDirection;
  }

  const maxHeight = Math.max(
    0,
    Math.min(maxHeightLimit, direction === 'down' ? spaceBelow : spaceAbove)
  );

  return direction === 'down'
    ? {
      position: 'fixed',
      top: rect.bottom + DROPDOWN_OFFSET,
      left,
      width,
      maxHeight,
      zIndex: DROPDOWN_Z_INDEX
    }
    : {
      position: 'fixed',
      bottom: viewportHeight - rect.top + DROPDOWN_OFFSET,
      left,
      width,
      maxHeight,
      zIndex: DROPDOWN_Z_INDEX
    };
};

export function Select({
  value,
  options,
  onChange,
  placeholder,
  className,
  disabled = false,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  fullWidth = true,
  id,
  dropdownDirection = 'auto',
  searchable = false,
  searchPlaceholder,
  noMatchText,
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const listboxId = `${selectId}-listbox`;
  const searchId = `${selectId}-search`;
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [search, setSearch] = useState('');
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties | null>(null);
  const isOpen = open && !disabled;

  const openDropdown = useCallback(() => {
    setSearch('');
    setHighlightedIndex(-1);
    setOpen(true);
  }, []);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setSearch('');
    setHighlightedIndex(-1);
  }, []);

  useEffect(() => {
    if (!open || disabled) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      closeDropdown();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [closeDropdown, disabled, open]);

  useEffect(() => {
    // dropdownStyle 就绪后搜索框才真正挂载，依赖它保证聚焦时机正确。
    if (!isOpen || !searchable || !dropdownStyle) return;
    searchRef.current?.focus();
  }, [dropdownStyle, isOpen, searchable]);

  const updateDropdownStyle = useCallback(() => {
    if (!wrapRef.current) return;
    const maxHeightLimit = searchable ? DROPDOWN_MAX_HEIGHT + SEARCH_BAR_HEIGHT : DROPDOWN_MAX_HEIGHT;
    setDropdownStyle(resolveDropdownStyle(wrapRef.current, dropdownDirection, maxHeightLimit));
  }, [dropdownDirection, searchable]);

  const scheduleDropdownStyleUpdate = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      updateDropdownStyle();
    });
  }, [updateDropdownStyle]);

  useLayoutEffect(() => {
    if (!isOpen) {
      if (rafRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    updateDropdownStyle();

    const handleViewportChange = () => {
      scheduleDropdownStyleUpdate();
    };

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' && wrapRef.current
        ? new ResizeObserver(() => {
          scheduleDropdownStyleUpdate();
        })
        : null;

    if (resizeObserver && wrapRef.current) {
      resizeObserver.observe(wrapRef.current);
    }

    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
      resizeObserver?.disconnect();
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isOpen, scheduleDropdownStyleUpdate, updateDropdownStyle]);

  const filteredOptions = useMemo(() => {
    const keyword = searchable ? search.trim().toLowerCase() : '';
    if (!keyword) return options;
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(keyword) || option.value.toLowerCase().includes(keyword)
    );
  }, [options, search, searchable]);

  const selectedIndex = filteredOptions.findIndex((option) => option.value === value);
  const resolvedHighlightedIndex =
    highlightedIndex >= 0 && highlightedIndex < filteredOptions.length
      ? highlightedIndex
      : selectedIndex >= 0
        ? selectedIndex
        : filteredOptions.length > 0
          ? 0
          : -1;
  const selected = options.find((option) => option.value === value);
  const displayText = selected?.label ?? placeholder ?? '';
  const isPlaceholder = !selected && placeholder;

  const commitSelection = useCallback(
    (nextIndex: number) => {
      const nextOption = filteredOptions[nextIndex];
      if (!nextOption) return;
      onChange(nextOption.value);
      closeDropdown();
    },
    [closeDropdown, filteredOptions, onChange]
  );

  const moveHighlight = useCallback(
    (direction: 1 | -1) => {
      if (filteredOptions.length === 0) return;
      const nextIndex =
        (resolvedHighlightedIndex + direction + filteredOptions.length) % filteredOptions.length;
      setHighlightedIndex(nextIndex);
    },
    [filteredOptions.length, resolvedHighlightedIndex]
  );

  const handleSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(event.target.value);
    setHighlightedIndex(0);
  }, []);

  const handleSearchKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          moveHighlight(1);
          return;
        case 'ArrowUp':
          event.preventDefault();
          moveHighlight(-1);
          return;
        case 'Enter':
          event.preventDefault();
          if (resolvedHighlightedIndex >= 0) {
            commitSelection(resolvedHighlightedIndex);
          }
          return;
        case 'Escape':
          event.preventDefault();
          closeDropdown();
          wrapRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
          return;
        case 'Tab':
          closeDropdown();
          return;
        default:
          return;
      }
    },
    [closeDropdown, commitSelection, moveHighlight, resolvedHighlightedIndex]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return;

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          if (!isOpen) {
            openDropdown();
            return;
          }
          moveHighlight(1);
          return;
        case 'ArrowUp':
          event.preventDefault();
          if (!isOpen) {
            openDropdown();
            return;
          }
          moveHighlight(-1);
          return;
        case 'Home':
          if (!isOpen || filteredOptions.length === 0) return;
          event.preventDefault();
          setHighlightedIndex(0);
          return;
        case 'End':
          if (!isOpen || filteredOptions.length === 0) return;
          event.preventDefault();
          setHighlightedIndex(filteredOptions.length - 1);
          return;
        case 'Enter':
        case ' ': {
          event.preventDefault();
          if (!isOpen) {
            openDropdown();
            return;
          }
          if (resolvedHighlightedIndex >= 0) {
            commitSelection(resolvedHighlightedIndex);
          }
          return;
        }
        case 'Escape':
          if (!isOpen) return;
          event.preventDefault();
          closeDropdown();
          return;
        case 'Tab':
          if (isOpen) closeDropdown();
          return;
        default:
          return;
      }
    },
    [
      closeDropdown,
      commitSelection,
      disabled,
      filteredOptions.length,
      isOpen,
      moveHighlight,
      openDropdown,
      resolvedHighlightedIndex,
    ]
  );

  useEffect(() => {
    if (!isOpen || resolvedHighlightedIndex < 0) return;
    const highlightedOption = document.getElementById(`${selectId}-option-${resolvedHighlightedIndex}`);
    highlightedOption?.scrollIntoView({ block: 'nearest' });
  }, [isOpen, resolvedHighlightedIndex, selectId]);

  const dropdown =
    isOpen && dropdownStyle
      ? (
        <div
          ref={dropdownRef}
          className={styles.dropdown}
          style={dropdownStyle}
        >
          {searchable && (
            <div className={styles.searchWrap}>
              <IconSearch size={14} className={styles.searchIcon} />
              <input
                ref={searchRef}
                id={searchId}
                type="text"
                className={styles.searchInput}
                value={search}
                onChange={handleSearchChange}
                onKeyDown={handleSearchKeyDown}
                placeholder={searchPlaceholder}
                autoComplete="off"
                aria-label={searchPlaceholder}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded
                aria-controls={listboxId}
                aria-activedescendant={
                  resolvedHighlightedIndex >= 0
                    ? `${selectId}-option-${resolvedHighlightedIndex}`
                    : undefined
                }
              />
            </div>
          )}
          <div
            className={styles.optionList}
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
          >
            {filteredOptions.length === 0
              ? noMatchText && <div className={styles.emptyOption}>{noMatchText}</div>
              : filteredOptions.map((opt, index) => {
                const active = opt.value === value;
                const highlighted = index === resolvedHighlightedIndex;
                return (
                  <button
                    key={opt.value}
                    id={`${selectId}-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`${styles.option} ${active ? styles.optionActive : ''} ${highlighted ? styles.optionHighlighted : ''}`.trim()}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onKeyDown={handleKeyDown}
                    onClick={() => commitSelection(index)}
                  >
                    {opt.label}
                  </button>
                );
              })}
          </div>
        </div>
      )
      : null;

  return (
    <>
      <div
        className={`${styles.wrap} ${fullWidth ? styles.wrapFullWidth : ''} ${className ?? ''}`}
        ref={wrapRef}
      >
        <button
          id={selectId}
          type="button"
          className={styles.trigger}
          onClick={disabled ? undefined : () => (isOpen ? closeDropdown() : openDropdown())}
          onKeyDown={handleKeyDown}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={isOpen ? listboxId : undefined}
          aria-activedescendant={
            isOpen && resolvedHighlightedIndex >= 0
              ? `${selectId}-option-${resolvedHighlightedIndex}`
              : undefined
          }
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-describedby={ariaDescribedBy}
          disabled={disabled}
        >
          <span className={`${styles.triggerText} ${isPlaceholder ? styles.placeholder : ''}`}>
            {displayText}
          </span>
          {/* 没有候选项时不给下拉箭头：展不开的空列表，箭头只会误导。 */}
          {options.length > 0 && (
            <span className={styles.triggerIcon} aria-hidden="true">
              <IconChevronDown size={14} />
            </span>
          )}
        </button>
      </div>
      {dropdown && (typeof document === 'undefined' ? dropdown : createPortal(dropdown, document.body))}
    </>
  );
}
