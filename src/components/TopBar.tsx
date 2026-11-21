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
    <header className="no-print sticky top-0 z-50 bg-card border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => onSelectTab('dashboard')}
          className="text-base font-bold tracking-tight text-foreground whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md"
        >
          Production AI Analyst
        </button>

        {/* Zone 2: Clean Single-Line Nav Links */}
        <nav aria-label="Huvudnavigation" className="hidden lg:flex items-center gap-5">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={cn(
                  'relative py-5 text-sm font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer',
                  isActive
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {item.label}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Primary CTA + Utility Menu */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="primary"
            size="sm"
            onClick={onOpenImport}
            className="hidden sm:inline-flex"
          >
            <Upload className="w-4 h-4" />
            Importera fil
          </Button>

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
            >
              <UserIcon className="w-4 h-4" />
            </Button>

            {accountOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setAccountOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-64 rounded-xl border border-border bg-card p-4 shadow-lg z-50 space-y-3">
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
