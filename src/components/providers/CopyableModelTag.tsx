import type { ModelAlias } from '@/types';
import { useCopy } from '@/hooks';

interface CopyableModelTagProps {
  model: ModelAlias;
  className: string;
  nameClassName: string;
  aliasClassName: string;
}

export function CopyableModelTag({
  model,
  className,
  nameClassName,
  aliasClassName,
}: CopyableModelTagProps) {
  const { copy } = useCopy({ includeValueInSuccess: true });

  const copyValue = model.alias && model.alias !== model.name ? model.alias : model.name;

  return (
    <button type="button" className={className} onClick={() => void copy(copyValue)} title={copyValue}>
      <span className={nameClassName}>{model.name}</span>
      {model.alias && model.alias !== model.name ? (
        <span className={aliasClassName}>{model.alias}</span>
      ) : null}
    </button>
  );
}
