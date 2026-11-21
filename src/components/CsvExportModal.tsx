import React, { useMemo, useState } from 'react';
import { X, Download, FileSpreadsheet } from 'lucide-react';
import { Anomaly, ExcludedPoint, ProductionRow, StatsResult } from '@/src/lib/stats';
import {
  buildProcessedCsvContent,
  exportDatasetToCsv,
  CsvExportOptions,
} from '@/src/lib/export';
import { cn } from '@/src/lib/utils';
import { Card } from './ui/Card';
import { Button } from './ui/Button';

interface CsvExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  rows: ProductionRow[];
  columns: string[];
  categoryColumns: string[];
  selectedMetric: string;
  stats: StatsResult;
  anomaliesByRow: Record<number, Anomaly[]>;
  excludedPoints: Record<number, ExcludedPoint>;
  datasetName: string;
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}

type FormatPreset = 'excel_se' | 'standard_rfc';

export function CsvExportModal({
  isOpen,
  onClose,
  rows,
  columns,
  categoryColumns,
  selectedMetric,
  stats,
  anomaliesByRow,
  excludedPoints,
  datasetName,
  onNotify,
}: CsvExportModalProps) {
  const [preset, setPreset] = useState<FormatPreset>('excel_se');
  const [includeExcluded, setIncludeExcluded] = useState(true);
  const [includeSpcMetadata, setIncludeSpcMetadata] = useState(true);

  const exportOptions: CsvExportOptions = useMemo(
    () => ({
      delimiter: preset === 'excel_se' ? ';' : ',',
      decimalSeparator: preset === 'excel_se' ? ',' : '.',
      includeExcluded,
      includeSpcMetadata,
      categoryColumns,
    }),
    [preset, includeExcluded, includeSpcMetadata, categoryColumns]
  );

  const excludedCount = useMemo(
    () => rows.filter((r) => Boolean(excludedPoints[r.rowIndex])).length,
    [rows, excludedPoints]
  );

  const flaggedAnomalyRowCount = useMemo(
    () => Object.keys(anomaliesByRow).length,
    [anomaliesByRow]
  );

  const preview = useMemo(() => {
    if (!isOpen) return { rowCount: 0, columnCount: 0, previewLines: [] as string[] };
    return buildProcessedCsvContent(
      rows,
      columns,
      selectedMetric,
      stats,
      anomaliesByRow,
      excludedPoints,
      exportOptions
    );
  }, [isOpen, rows, columns, selectedMetric, stats, anomaliesByRow, excludedPoints, exportOptions]);

  if (!isOpen) return null;

  const handleDownload = () => {
    const result = exportDatasetToCsv(
      rows,
      columns,
      selectedMetric,
      stats,
      anomaliesByRow,
      datasetName,
      excludedPoints,
      exportOptions
    );
    onNotify(
      'success',
      `Exporterade ${result.rowCount} rader och ${result.columnCount} kolumner till "${result.fileName}".`
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <Card padding="none" className="w-full max-w-2xl shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="w-4 h-4 text-primary shrink-0" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Exportera bearbetat dataset (CSV)
              </h2>
              <p className="text-xs text-muted-foreground">
                {datasetName} · Aktiv kolumn: <span className="font-medium text-foreground">{selectedMetric}</span>
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Stäng">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-5 space-y-5 text-xs">
          {/* Summary Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 border border-border rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-border bg-muted/25">
            <div className="px-3.5 py-2.5">
              <p className="text-[11px] text-muted-foreground">Rader i export</p>
              <p className="font-mono tabular-nums text-base font-semibold text-foreground mt-0.5">
                {preview.rowCount}
              </p>
            </div>
            <div className="px-3.5 py-2.5">
              <p className="text-[11px] text-muted-foreground">Exkl. Special Cause</p>
              <p className="font-mono tabular-nums text-base font-semibold text-amber-700 dark:text-amber-400 mt-0.5">
                {includeExcluded ? excludedCount : 0}
                {!includeExcluded && excludedCount > 0 && (
                  <span className="text-[11px] font-sans font-normal text-muted-foreground ml-1">
                    (bortfiltr.)
                  </span>
                )}
              </p>
            </div>
            <div className="px-3.5 py-2.5">
              <p className="text-[11px] text-muted-foreground">Flaggade anomalirader</p>
              <p className="font-mono tabular-nums text-base font-semibold text-rose-700 dark:text-rose-400 mt-0.5">
                {flaggedAnomalyRowCount}
              </p>
            </div>
            <div className="px-3.5 py-2.5">
              <p className="text-[11px] text-muted-foreground">Kolumner</p>
              <p className="font-mono tabular-nums text-base font-semibold text-foreground mt-0.5">
                {preview.columnCount}
              </p>
            </div>
          </div>

          {/* CSV Dialect Selector */}
          <div className="space-y-2">
            <p className="font-semibold text-foreground">CSV-format för externt analysverktyg</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setPreset('excel_se')}
                className={cn(
                  'p-3 rounded-lg border text-left transition-colors cursor-pointer space-y-1',
                  preset === 'excel_se'
                    ? 'border-primary bg-primary/[0.05]'
                    : 'border-border bg-card hover:bg-muted/40'
                )}
              >
                <p className="font-semibold text-foreground">Svensk Excel (.csv)</p>
                <p className="text-[11px] text-muted-foreground font-mono">
                  Avgränsare: ; · Decimal: , · UTF-8 BOM
                </p>
              </button>

              <button
                type="button"
                onClick={() => setPreset('standard_rfc')}
                className={cn(
                  'p-3 rounded-lg border text-left transition-colors cursor-pointer space-y-1',
                  preset === 'standard_rfc'
                    ? 'border-primary bg-primary/[0.05]'
                    : 'border-border bg-card hover:bg-muted/40'
                )}
              >
                <p className="font-semibold text-foreground">
                  Python / R / Minitab / Power BI
                </p>
                <p className="text-[11px] text-muted-foreground font-mono">
                  Avgränsare: , · Decimal: . · RFC-4180
                </p>
              </button>
            </div>
          </div>

          {/* Inclusion Toggles */}
          <div className="space-y-2.5 pt-1">
            <p className="font-semibold text-foreground">Innehåll i exportfilen</p>
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeExcluded}
                onChange={(e) => setIncludeExcluded(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-border text-primary focus:ring-primary"
              />
              <div>
                <span className="font-medium text-foreground">
                  Inkludera exkluderade Special Cause-punkter ({excludedCount} st)
                </span>
                <p className="text-[11px] text-muted-foreground">
                  Behåller full spårbarhet i kolumnerna <span className="font-mono">Exkluderad</span>,{' '}
                  <span className="font-mono">Special_Cause_Orsak</span> och{' '}
                  <span className="font-mono">Exkluderad_Tidpunkt</span>.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeSpcMetadata}
                onChange={(e) => setIncludeSpcMetadata(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-border text-primary focus:ring-primary"
              />
              <div>
                <span className="font-medium text-foreground">
                  Inkludera beräknade SPC-kolumner &amp; gränser
                </span>
                <p className="text-[11px] text-muted-foreground">
                  Lägger till <span className="font-mono">Moving_Range</span>,{' '}
                  <span className="font-mono">MR_Ur_Kontroll</span>,{' '}
                  <span className="font-mono">CL_Mean</span>,{' '}
                  <span className="font-mono">UCL_3s / LCL_3s</span> samt{' '}
                  <span className="font-mono">LSL / Target / USL</span> utöver flaggade anomaliregler.
                </p>
              </div>
            </label>
          </div>

          {/* Live Raw CSV Preview */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground">Förhandsgranskning (första rader)</span>
              <span className="font-mono">UTF-8</span>
            </div>
            <div className="p-3 rounded-lg border border-border bg-muted/40 overflow-x-auto">
              <pre className="font-mono text-[11px] leading-relaxed text-foreground whitespace-pre">
                {preview.previewLines.join('\n')}
              </pre>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Avbryt
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={handleDownload}>
              <Download className="w-3.5 h-3.5" />
              Ladda ner CSV ({preview.rowCount} rader)
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
