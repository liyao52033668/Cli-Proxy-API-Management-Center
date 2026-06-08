import { Button } from '@/components/ui/Button';
import type { CodexInspectionMode } from '@/features/codexInspection/model/types';

type Props = {
  mode: CodexInspectionMode;
  onChange: (mode: CodexInspectionMode) => void;
  labels: { local: string; server: string };
};

export function CodexInspectionModeTabs({ mode, onChange, labels }: Props) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Button variant={mode === 'server' ? 'primary' : 'secondary'} onClick={() => onChange('server')}>
        {labels.server}
      </Button>
      <Button variant={mode === 'local' ? 'primary' : 'secondary'} onClick={() => onChange('local')}>
        {labels.local}
      </Button>
    </div>
  );
}
