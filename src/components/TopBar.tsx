import React, { useState } from 'react';
import { Upload, Sun, Moon, Menu, X, LogOut, User as UserIcon } from 'lucide-react';
import { User } from 'firebase/auth';
import { cn } from '@/src/lib/utils';
import { Button } from './ui/Button';

export type ActiveTab = 'dashboard' | 'autopilot' | 'regression' | 'doe' | 'data' | 'analysis' | 'history';

interface TopBarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onOpenImport: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  user: User | null;
  onSignIn: () => void;
  onSignOut: () => void;
}

const NAV_ITEMS: Array<{ id: ActiveTab; label: string }> = [
  { id: 'dashboard', label: 'Översikt' },
  { id: 'autopilot', label: 'Autopilot' },
  { id: 'regression', label: 'Regression' },
  { id: 'doe', label: 'DOE' },
  { id: 'data', label: 'Data & Export' },
  { id: 'analysis', label: 'AI-analys' },
  { id: 'history', label: 'Historik' },
];

export function TopBar({
  activeTab,
  onSelectTab,
  onOpenImport,
  isDarkMode,
  onToggleDarkMode,
  user,
  onSignIn,
  onSignOut,
}: TopBarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  return (
    <header className="no-print sticky top-0 z-50 bg-card/90 backdrop-blur-md border-b border-border/90">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-6">
        {/* Zone 1: Brand Mark + Single-line Wordmark */}
        <button
          type="button"
          onClick={() => onSelectTab('dashboard')}
          className="inline-flex items-center gap-2.5 text-[15px] font-bold tracking-tight text-foreground whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md"
        >
          <span
            aria-hidden="true"
            className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-[0_1px_2px_rgba(15,23,42,0.18)]"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <line x1="1.5" y1="3.5" x2="14.5" y2="3.5" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.2" strokeDasharray="2 1.5" />
              <line x1="1.5" y1="12.5" x2="14.5" y2="12.5" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.2" strokeDasharray="2 1.5" />
              <polyline
                points="2,9.5 5,6.2 8.2,10.2 11.2,5.5 14,7.8"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span>Production AI Analyst</span>
        </button>

        {/* Zone 2: Clean Single-Line Nav Links */}
        <nav aria-label="Huvudnavigation" className="hidden lg:flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={cn(
                  'relative h-14 px-3 text-[13px] font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer',
                  isActive
                    ? 'text-foreground font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {item.label}
                {isActive && (
                  <span className="absolute bottom-0 left-2.5 right-2.5 h-[2px] rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Primary CTA + Utility Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="primary"
            size="sm"
            onClick={onOpenImport}
            className="hidden sm:inline-flex"
          >
            <Upload className="w-3.5 h-3.5" />
            Importera fil
          </Button>

          <div className="hidden sm:block h-5 w-px bg-border mx-0.5" aria-hidden="true" />

          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleDarkMode}
            title={isDarkMode ? 'Byt till ljust läge' : 'Byt till mörkt läge'}
            aria-label={isDarkMode ? 'Byt till ljust läge' : 'Byt till mörkt läge'}
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>

          {/* Compact account menu */}
          <div className="relative hidden md:block">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setAccountOpen((prev) => !prev)}
              title={user ? user.email || 'Konto' : 'Logga in'}
              aria-label={user ? 'Kontomeny' : 'Logga in med Google'}
              className={cn(user && 'border-primary/40 text-primary')}
            >
              <UserIcon className="w-4 h-4" />
            </Button>

            {accountOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setAccountOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-64 rounded-xl border border-border bg-card p-4 shadow-xl z-50 space-y-3">
                  {user ? (
                    <>
                      <div className="space-y-0.5 border-b border-border pb-3">
                        <p className="text-xs text-muted-foreground">Inloggad som</p>
                        <p className="text-sm font-semibold text-foreground truncate">
                          {user.email}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => {
                          setAccountOpen(false);
                          onSignOut();
                        }}
                      >
                        <LogOut className="w-4 h-4" />
                        Logga ut
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Logga in med Google för att spara och hantera privata AI-rapporter i molnet.
                      </p>
                      <Button
                        variant="primary"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          setAccountOpen(false);
                          onSignIn();
                        }}
                      >
                        Logga in med Google
                      </Button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          <Button
            variant="outline"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label="Öppna meny"
          >
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-border bg-card px-4 py-4 space-y-3">
          <div className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectTab(item.id);
                  setMobileOpen(false);
                }}
                className={cn(
                  'w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  activeTab === item.id
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="pt-3 border-t border-border flex flex-col gap-2">
            <Button
              variant="primary"
              size="sm"
              className="w-full"
              onClick={() => {
                onOpenImport();
                setMobileOpen(false);
              }}
            >
              <Upload className="w-4 h-4" />
              Importera Excel / CSV
            </Button>
            {user ? (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  onSignOut();
                  setMobileOpen(false);
                }}
              >
                <LogOut className="w-4 h-4" />
                Logga ut ({user.email})
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  onSignIn();
                  setMobileOpen(false);
                }}
              >
                Logga in med Google
              </Button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
