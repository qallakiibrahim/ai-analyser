import React, { useState, useMemo } from 'react';
import {
  Download,
  Search,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  Ban,
  RotateCcw,
} from 'lucide-react';
import { Anomaly, ExcludedPoint, ProductionRow, StatsResult } from '@/src/lib/stats';
import { exportDatasetToExcel } from '@/src/lib/export';
import { PointToExclude } from './ExcludePointModal';
import { cn } from '@/src/lib/utils';
import { Card } from './ui/Card';
import { Button } from './ui/Button';

interface DataTableViewProps {
  rows: ProductionRow[];
  columns: string[];
  categoryColumns: string[];
  selectedMetric: string;
  stats: StatsResult;
  anomaliesByRow: Record<number, Anomaly[]>;
  excludedPoints: Record<number, ExcludedPoint>;
  onRequestExclude: (pt: PointToExclude) => void;
  onRestorePoint: (rowIndex: number) => void;
  onRestoreAll: () => void;
  onOpenCsvExport: () => void;
  datasetName: string;
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}

type FilterMode = 'all' | 'oos' | 'anomaly' | 'excluded' | 'ok';
const PAGE_SIZE = 50;

export function DataTableView({
  rows,
  columns,
  categoryColumns,
  selectedMetric,
  stats,
  anomaliesByRow,
  excludedPoints,
  onRequestExclude,
  onRestorePoint,
  onRestoreAll,
  onOpenCsvExport,
  datasetName,
  onNotify,
}: DataTableViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [page, setPage] = useState(1);

  const excludedCount = useMemo(
    () => rows.filter((r) => Boolean(excludedPoints[r.rowIndex])).length,
    [rows, excludedPoints]
  );

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((row) => {
      const val = row.values[selectedMetric];
      const exclusion = excludedPoints[row.rowIndex];
      const rowAnomalies = anomaliesByRow[row.rowIndex] || [];
      const isOos =
        !exclusion &&
        typeof val === 'number' &&
        stats.usl > stats.lsl &&
        (val > stats.usl || val < stats.lsl);

      if (filterMode === 'oos' && !isOos) return false;
      if (filterMode === 'anomaly' && (Boolean(exclusion) || rowAnomalies.length === 0)) return false;
      if (filterMode === 'excluded' && !exclusion) return false;
      if (filterMode === 'ok' && (Boolean(exclusion) || isOos || rowAnomalies.length > 0)) return false;

      if (!q) return true;
      const ruleText = rowAnomalies.map((a) => `${a.ruleCode} ${a.explanation}`).join(' ').toLowerCase();
      const exclText = exclusion ? exclusion.reason.toLowerCase() : '';
      return (
        String(row.rowIndex).includes(q) ||
        row.label.toLowerCase().includes(q) ||
        (val !== undefined && val.toFixed(4).includes(q)) ||
        ruleText.includes(q) ||
        exclText.includes(q)
      );
    });
  }, [rows, selectedMetric, stats.usl, stats.lsl, anomaliesByRow, excludedPoints, filterMode, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredRows, safePage]
  );

  const handleExportExcel = () => {
    exportDatasetToExcel(
      rows,
      columns,
      selectedMetric,
      stats,
      anomaliesByRow,
      datasetName,
      excludedPoints,
      categoryColumns
    );
    onNotify('success', 'Excel-rapport (.xlsx) med SPC-sammanfattning och mätdata exporterad.');
  };

  const handleExportCsv = () => {
    onOpenCsvExport();
  };

  return (
    <section aria-label="Rådata och export" className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Mätdata &amp; Export</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Granska enskilda rader, exkludera dokumenterade Special Cause-punkter och exportera
            sanerad SPC-rapport.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {excludedCount > 0 && (
            <Button variant="outline" size="sm" onClick={onRestoreAll}>
              <RotateCcw className="w-4 h-4" />
              Återställ exkluderade ({excludedCount})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleExportCsv}>
            <Download className="w-4 h-4" />
            Exportera CSV
          </Button>
          <Button variant="primary" size="sm" onClick={handleExportExcel}>
            <FileSpreadsheet className="w-4 h-4" />
            Exportera Excel (.xlsx)
          </Button>
        </div>
      </div>

      <Card padding="none">
        {/* Filter & Search Toolbar */}
        <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-muted rounded-lg w-fit">
            {(
              [
                { id: 'all', label: `Alla (${rows.length})` },
                { id: 'oos', label: `Utanför spec (${stats.oosCount})` },
                {
                  id: 'anomaly',
                  label: `Avvikelser (${Object.keys(anomaliesByRow).length})`,
                },
                { id: 'excluded', label: `Exkluderade (${excludedCount})` },
                { id: 'ok', label: 'Godkända' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setFilterMode(tab.id);
                  setPage(1);
                }}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer',
                  filterMode === tab.id
                    ? 'bg-card text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Sök rad, tid, värde, regel eller orsak..."
              className="w-full h-9 pl-9 pr-3 text-xs bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        {/* High-Density Data Grid */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-muted/60 text-muted-foreground border-b border-border">
                <th className="py-2.5 px-4 font-medium w-16">Rad</th>
                <th className="py-2.5 px-4 font-medium">Tidpunkt</th>
                {columns.map((col) => (
                  <th
                    key={col}
                    className={cn(
                      'py-2.5 px-4 font-medium text-right whitespace-nowrap',
                      col === selectedMetric && 'text-foreground font-semibold'
                    )}
                  >
                    {col}
                  </th>
                ))}
                <th className="py-2.5 px-4 font-medium">Status</th>
                <th className="py-2.5 px-4 font-medium">Regler / Special Cause</th>
                <th className="py-2.5 px-4 font-medium text-right">Åtgärd</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pageRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + 5}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    Inga rader matchar aktuellt filter eller sökord.
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => {
                  const val = row.values[selectedMetric];
                  const exclusion = excludedPoints[row.rowIndex];
                  const rowAnomalies = anomaliesByRow[row.rowIndex] || [];
                  const isOos =
                    !exclusion &&
                    typeof val === 'number' &&
                    stats.usl > stats.lsl &&
                    (val > stats.usl || val < stats.lsl);
                  const hasAnomaly = !exclusion && rowAnomalies.length > 0;

                  return (
                    <tr
                      key={row.rowIndex}
                      className={cn(
                        'hover:bg-muted/40 transition-colors',
                        exclusion && 'bg-muted/25 opacity-75'
                      )}
                    >
                      <td className="py-2.5 px-4 font-mono tabular-nums text-muted-foreground">
                        #{row.rowIndex}
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-muted-foreground whitespace-nowrap">
                        {row.label}
                      </td>
                      {columns.map((col) => {
                        const cellVal = row.values[col];
                        const isHighlighted = col === selectedMetric;
                        return (
                          <td
                            key={col}
                            className={cn(
                              'py-2.5 px-4 font-mono tabular-nums text-right whitespace-nowrap',
                              isHighlighted && exclusion
                                ? 'text-muted-foreground line-through'
                                : isHighlighted && isOos
                                ? 'text-rose-600 dark:text-rose-400 font-semibold'
                                : isHighlighted
                                ? 'text-foreground font-semibold'
                                : 'text-muted-foreground'
                            )}
                          >
                            {cellVal !== undefined ? cellVal.toFixed(4) : '–'}
                          </td>
                        );
                      })}
                      <td className="py-2.5 px-4 whitespace-nowrap font-medium">
                        {exclusion ? (
                          <span className="text-amber-700 dark:text-amber-400">Exkluderad</span>
                        ) : isOos ? (
                          <span className="text-rose-600 dark:text-rose-400">Utanför spec</span>
                        ) : hasAnomaly ? (
                          <span className="text-amber-700 dark:text-amber-400">Avvikelse</span>
                        ) : (
                          <span className="text-emerald-700 dark:text-emerald-400">OK</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground max-w-xs">
                        {exclusion ? (
                          <span className="text-foreground">
                            Special Cause: {exclusion.reason}
                          </span>
                        ) : rowAnomalies.length > 0 ? (
                          <span className="font-mono text-[11px] text-foreground">
                            {rowAnomalies.map((a) => a.ruleCode).join(', ')}
                          </span>
                        ) : (
                          '–'
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        {exclusion ? (
                          <button
                            type="button"
                            onClick={() => onRestorePoint(row.rowIndex)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Återställ
                          </button>
                        ) : typeof val === 'number' ? (
                          <button
                            type="button"
                            onClick={() =>
                              onRequestExclude({
                                rowIndex: row.rowIndex,
                                label: row.label,
                                value: val,
                                metric: selectedMetric,
                              })
                            }
                            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                          >
                            <Ban className="w-3 h-3" />
                            Exkludera
                          </button>
                        ) : (
                          '–'
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-4 py-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-mono tabular-nums">
            Visar {filteredRows.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}–
            {Math.min(safePage * PAGE_SIZE, filteredRows.length)} av {filteredRows.length} rader
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="w-4 h-4" />
              Föregående
            </Button>
            <span className="font-mono tabular-nums px-2">
              {safePage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Nästa
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>
    </section>
  );
}
