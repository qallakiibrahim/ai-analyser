import React, { useState, useEffect } from 'react';
import { X, Ban, AlertTriangle } from 'lucide-react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';

export interface PointToExclude {
  rowIndex: number;
  label: string;
  value: number;
  metric: string;
}

interface ExcludePointModalProps {
  point: PointToExclude | null;
  onClose: () => void;
  onConfirm: (rowIndex: number, reason: string) => void;
}

const PRESET_REASONS = [
  'Mätfel / felaktig avläsning',
  'Verktygsbrott eller verktygsbyte',
  'Uppstart / omställning av maskin',
  'Råmaterialavvikelse / fel batch',
  'Tillfällig störning / stopp i process',
];

export function ExcludePointModal({
  point,
  onClose,
  onConfirm,
}: ExcludePointModalProps) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (point) setReason('');
  }, [point]);

  if (!point) return null;

  const canSubmit = reason.trim().length >= 3;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onConfirm(point.rowIndex, reason.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <Card padding="none" className="w-full max-w-lg shadow-2xl">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Ban className="w-4 h-4 text-rose-600 dark:text-rose-400" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Exkludera punkt som Special Cause
              </h2>
              <p className="text-xs font-mono tabular-nums text-muted-foreground">
                Rad #{point.rowIndex} ({point.label}) · {point.metric} = {point.value.toFixed(4)}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Stäng">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Enligt SPC-praxis (IATF 16949) får en mätpunkt endast exkluderas ur kontrollgränser
              och Cpk/Ppk när det finns en verifierad, dokumenterad orsak. Punkten sparas i
              spårbarhetsloggen och kan återställas när som helst.
            </span>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Snabbval (vanliga Special Cause-orsaker):
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_REASONS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setReason(preset)}
                  className="px-2.5 py-1 rounded-md border border-border bg-muted/40 hover:bg-muted text-xs text-foreground transition-colors cursor-pointer"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="special-cause-reason" className="text-xs font-semibold text-foreground block">
              Förklaring / Rotorsak (obligatorisk)
            </label>
            <textarea
              id="special-cause-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Beskriv varför denna mätpunkt är en verifierad special cause..."
              className="w-full p-2.5 text-xs bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              autoFocus
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Avbryt
            </Button>
            <Button type="submit" variant="danger" size="sm" disabled={!canSubmit}>
              <Ban className="w-3.5 h-3.5" />
              Exkludera punkt #{point.rowIndex}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
