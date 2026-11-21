import React, { useState } from 'react';
import Markdown from 'react-markdown';
import { FileText, RefreshCw, Trash2, ExternalLink } from 'lucide-react';
import { User } from 'firebase/auth';
import { SavedReport } from '@/src/lib/firebase';
import { cn } from '@/src/lib/utils';
import { Card } from './ui/Card';
import { Button } from './ui/Button';

interface HistoryViewProps {
  user: User | null;
  reports: SavedReport[];
  isLoading: boolean;
  onSignIn: () => void;
  onRefresh: () => void;
  onOpenReport: (report: SavedReport) => void;
  onDeleteReport: (reportId: string) => Promise<void>;
}

export function HistoryView({
  user,
  reports,
  isLoading,
  onSignIn,
  onRefresh,
  onOpenReport,
  onDeleteReport,
}: HistoryViewProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleConfirmDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await onDeleteReport(id);
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section aria-label="Rapporthistorik" className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Rapporthistorik</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Dina privata AI-analyser sparade säkert på ditt konto.
          </p>
        </div>
        {user && (
          <Button variant="outline" size="sm" onClick={onRefresh} isLoading={isLoading}>
            <RefreshCw className="w-4 h-4" />
            Uppdatera
          </Button>
        )}
      </div>

      {!user ? (
        <Card className="p-12 text-center flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-muted-foreground">
            <FileText className="w-6 h-6" />
          </div>
          <div className="max-w-md space-y-1">
            <h3 className="text-base font-semibold text-foreground">
              Logga in för att se din historik
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Varje användare har sin egen privata rapporthistorik. Logga in med Google för att
              spara och återbesöka tidigare kvalitetsanalyser.
            </p>
          </div>
          <Button variant="primary" size="md" onClick={onSignIn}>
            Logga in med Google
          </Button>
        </Card>
      ) : isLoading && reports.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((n) => (
            <Card key={n} className="space-y-3">
              <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
              <div className="h-24 bg-muted rounded animate-pulse w-full" />
            </Card>
          ))}
        </div>
      ) : reports.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          Inga sparade rapporter hittades ännu. Kör en AI-analys så sparas den automatiskt här.
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {reports.map((report) => {
            const statusColor =
              report.status === 'RÖD'
                ? 'text-rose-600 dark:text-rose-400'
                : report.status === 'GUL'
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-emerald-700 dark:text-emerald-400';

            return (
              <Card key={report.id} padding="none" className="flex flex-col justify-between">
                <div className="px-5 py-3.5 border-b border-border flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className={cn('font-semibold', statusColor)}>
                      Status: {report.status}
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {new Date(report.timestamp).toLocaleString('sv-SE')}
                    </span>
                  </div>
                  <span className="text-muted-foreground truncate max-w-[180px]" title={report.metric}>
                    {report.metric}
                  </span>
                </div>

                <div className="p-5 space-y-4 flex-1 flex flex-col justify-between">
                  <div className="space-y-2">
                    {report.datasetName && (
                      <p className="text-xs font-medium text-muted-foreground">
                        {report.datasetName}
                        {report.sampleCount ? ` · ${report.sampleCount} punkter` : ''}
                      </p>
                    )}
                    <div className="prose text-xs max-h-48 overflow-y-auto pr-1">
                      <Markdown>{report.content}</Markdown>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-border flex items-center justify-between gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onOpenReport(report)}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Öppna rapport
                    </Button>

                    {confirmDeleteId === report.id ? (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Avbryt
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          isLoading={deletingId === report.id}
                          onClick={() => handleConfirmDelete(report.id)}
                        >
                          Bekräfta radera
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmDeleteId(report.id)}
                        aria-label="Radera rapport"
                      >
                        <Trash2 className="w-4 h-4 text-muted-foreground hover:text-rose-600" />
                        Radera
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
