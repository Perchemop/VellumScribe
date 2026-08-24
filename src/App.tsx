import React, { useState, useEffect } from 'react';
import {
  Cloud,
  RefreshCw,
  Moon,
  Sun,
  FileText,
  Plus,
  Maximize2,
  Minimize2,
  Shield,
  Download,
  Smartphone,
  CheckSquare,
  PenTool,
  ChevronDown,
  Clock,
  Settings,
  X,
  Layers,
  Archive,
  Sparkles,
} from 'lucide-react';
import { EventRecord, NoteRecord, ConflictLog } from './types';
import { SQLiteDatabase } from './lib/storage';
import { CloudSyncEngine, SyncProgressUpdate } from './lib/cloudSync';
import { NativeBridge } from './lib/nativeBridge';
import { EventNotesList } from './components/EventNotesList';
import { NoteEditor } from './components/NoteEditor';
import { RecentNotesSection } from './components/RecentNotesSection';
import { ArchiveSection } from './components/ArchiveSection';
import { SettingsView } from './components/SettingsView';
import { SyncProgressBar } from './components/SyncProgressBar';
import { ConflictResolutionModal } from './components/ConflictResolutionModal';
import {
  FirstTimeUserGuideModal,
  hasCompletedOnboarding,
} from './components/FirstTimeUserGuideModal';
import { AppLogo } from './components/AppLogo';

export default function App() {
  // State from Local Storage
  const [events, setEvents] = useState<EventRecord[]>(() => SQLiteDatabase.getEvents());
  const [notes, setNotes] = useState<NoteRecord[]>(() => SQLiteDatabase.getNotes());
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);

  // UI Navigation
  const [activeView, setActiveView] = useState<'notes' | 'recents' | 'archive' | 'settings'>('notes');
  const [settingsSubtab, setSettingsSubtab] = useState<'cloud' | 'ai' | 'storage' | 'security' | 'diagnostics' | 'updates'>('cloud');
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [showFabSpeedDial, setShowFabSpeedDial] = useState(false);
  const [focusMode, setFocusMode] = useState<boolean>(false);
  const [showOnboardingGuide, setShowOnboardingGuide] = useState<boolean>(() => !hasCompletedOnboarding());

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  // Sync & Progress state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgressUpdate | null>(null);
  const [backupFrequency, setBackupFrequency] = useState<string>(() => CloudSyncEngine.getBackupFrequency());
  const [unresolvedConflicts, setUnresolvedConflicts] = useState<ConflictLog[]>(() =>
    CloudSyncEngine.getConflicts().filter((c) => c.status !== 'resolved')
  );

  // Refresh helper
  const refreshLocalState = () => {
    setEvents(SQLiteDatabase.getEvents());
    setNotes(SQLiteDatabase.getNotes());
    setBackupFrequency(CloudSyncEngine.getBackupFrequency());
    setUnresolvedConflicts(
      CloudSyncEngine.getConflicts().filter((c) => c.status !== 'resolved')
    );
  };

  useEffect(() => {
    refreshLocalState();
  }, []);

  // Quick Top Bar Sync with Granular Progress
  const handleQuickSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncProgress({ percent: 10, message: 'Initiating cloud backup...', phase: 'init' });

    try {
      await CloudSyncEngine.triggerSync({
        onProgress: (p) => setSyncProgress(p),
      });
      refreshLocalState();
    } catch {
      setSyncProgress({ percent: 100, message: 'Sync failed. Please check network connection.', phase: 'complete' });
    } finally {
      setIsSyncing(false);
      setTimeout(() => {
        setSyncProgress(null);
      }, 2500);
    }
  };

  // Event & Note CRUD Handlers
  const handleCreateEvent = (newEvent: Omit<EventRecord, 'id'>) => {
    const created = SQLiteDatabase.addEvent(newEvent);
    refreshLocalState();
    setSelectedEventId(created.id);
  };

  const handleCreateNote = (eventId?: number, type: 'text' | 'checklist' | 'sketch' = 'text') => {
    let targetEventId = eventId || selectedEventId;
    if (!targetEventId) {
      if (events.length > 0) {
        targetEventId = events[0].id;
      } else {
        const defaultCat = SQLiteDatabase.addEvent({
          title: 'General',
          event_date: new Date().toISOString().split('T')[0],
          category: 'personal',
          color: '#3b82f6',
        });
        targetEventId = defaultCat.id;
      }
    }

    const newNote = SQLiteDatabase.addNote({
      event_id: targetEventId,
      title: type === 'checklist' ? 'New To-Do List' : type === 'sketch' ? 'New Sketch Note' : 'Untitled Note',
      body: type === 'checklist' ? 'Notes & subtasks' : type === 'sketch' ? 'Visual annotations' : '## Thoughts\n\nBegin typing here...',
      note_type: type,
      checklist_items: type === 'checklist' ? [{ id: '1', text: 'First task', completed: false }] : undefined,
      created_at: new Date().toISOString(),
      tags: [type === 'checklist' ? 'Tasks' : type === 'sketch' ? 'Drawings' : 'General'],
      is_pinned: false,
      cloud_save_enabled: false,
    });
    refreshLocalState();
    setSelectedNoteId(newNote.id);
    setActiveView('notes');
    setShowNewMenu(false);
    setShowFabSpeedDial(false);
  };

  const handleDeleteEvent = (eventId: number) => {
    SQLiteDatabase.deleteEvent(eventId);
    refreshLocalState();
    if (selectedEventId === eventId) setSelectedEventId(null);
  };

  const handleDeleteNote = (noteId: number) => {
    SQLiteDatabase.deleteNote(noteId);
    refreshLocalState();
    if (selectedNoteId === noteId) setSelectedNoteId(null);
  };

  const handleNoteUpdated = (_updated: NoteRecord) => {
    refreshLocalState();
  };

  const selectedNote = notes.find((n) => n.id === selectedNoteId);
  const archivedNotesCount = notes.filter((n) => n.status === 'archived').length;

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div
        id="app-root-container"
        className="h-screen w-screen flex flex-col bg-[#fafaf9] dark:bg-[#0c0c0e] text-zinc-900 dark:text-zinc-100 antialiased overflow-hidden font-sans selection:bg-zinc-200 dark:selection:bg-zinc-800"
      >
        {/* Desktop & Mobile Clean Top Bar */}
        {!focusMode && (
          <header className="min-h-14 safe-area-pt border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white/95 dark:bg-[#121215]/95 backdrop-blur-md px-3.5 sm:px-6 flex items-center justify-between shrink-0 z-20">
            {/* Brand Identity */}
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => {
                  setActiveView('notes');
                  setSelectedNoteId(null);
                }}
                className="group flex items-center gap-2.5 text-left focus:outline-hidden"
              >
                <AppLogo size="sm" showText={true} />
              </button>
            </div>

            {/* Desktop Center Navigation Tabs */}
            <div className="hidden md:flex items-center bg-zinc-100 dark:bg-zinc-900 p-0.5 rounded-xl text-xs border border-zinc-200/60 dark:border-zinc-800/60">
              <button
                id="nav-notes-view-btn"
                onClick={() => {
                  setActiveView('notes');
                }}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                  activeView === 'notes'
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-semibold shadow-2xs'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Notes</span>
              </button>

              <button
                id="nav-recents-view-btn"
                onClick={() => {
                  setActiveView('recents');
                  setSelectedNoteId(null);
                }}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                  activeView === 'recents'
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-semibold shadow-2xs'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Timeline</span>
              </button>

              <button
                id="nav-archive-view-btn"
                onClick={() => {
                  setActiveView('archive');
                  setSelectedNoteId(null);
                }}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                  activeView === 'archive'
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-semibold shadow-2xs'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <Archive className="w-3.5 h-3.5" />
                <span>Archive</span>
                {archivedNotesCount > 0 && (
                  <span className="px-1.5 py-0.2 bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-full text-[10px] font-semibold">
                    {archivedNotesCount}
                  </span>
                )}
              </button>

              <button
                id="nav-settings-view-btn"
                onClick={() => {
                  setActiveView('settings');
                  setSelectedNoteId(null);
                }}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                  activeView === 'settings'
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-semibold shadow-2xs'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Settings &amp; Cloud</span>
                {unresolvedConflicts.length > 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                )}
              </button>
            </div>

            {/* Right Action Icons */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Quick Note Dropdown on Desktop */}
              <div className="relative hidden sm:block">
                <button
                  id="header-new-note-dropdown-btn"
                  onClick={() => setShowNewMenu((p) => !p)}
                  title="Create New Note..."
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 rounded-xl text-xs font-semibold shadow-2xs transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>New Note</span>
                  <ChevronDown className="w-3 h-3 opacity-60 ml-0.5" />
                </button>

                {showNewMenu && (
                  <div className="absolute right-0 top-10 w-48 bg-white dark:bg-[#16161a] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-1.5 shadow-2xl z-30 space-y-0.5 text-xs animate-fade-in">
                    <button
                      onClick={() => handleCreateNote(undefined, 'text')}
                      className="w-full px-3 py-2 text-left rounded-xl text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2.5"
                    >
                      <FileText className="w-4 h-4 text-zinc-500" />
                      <span>Text Document</span>
                    </button>
                    <button
                      onClick={() => handleCreateNote(undefined, 'checklist')}
                      className="w-full px-3 py-2 text-left rounded-xl text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2.5"
                    >
                      <CheckSquare className="w-4 h-4 text-zinc-500" />
                      <span>To-Do Checklist</span>
                    </button>
                    <button
                      onClick={() => handleCreateNote(undefined, 'sketch')}
                      className="w-full px-3 py-2 text-left rounded-xl text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2.5"
                    >
                      <PenTool className="w-4 h-4 text-zinc-500" />
                      <span>Sketch Canvas</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Sync Trigger with Tooltip & Live spinner */}
              <button
                id="quick-sync-btn"
                onClick={handleQuickSync}
                disabled={isSyncing}
                title={backupFrequency === 'never' ? 'Offline Mode (Local Snapshots Only)' : 'Sync Notes to Cloud'}
                className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 rounded-xl transition-colors disabled:opacity-40 relative"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-zinc-900 dark:text-zinc-100' : ''}`} />
                {backupFrequency === 'never' && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-500 rounded-full ring-2 ring-white dark:ring-zinc-900" title="Offline mode active" />
                )}
              </button>

              {/* Direct Settings Tab Button */}
              <button
                id="open-app-settings-btn"
                onClick={() => {
                  setSelectedNoteId(null);
                  setActiveView('settings');
                }}
                title="Settings & Cloud"
                className={`p-2 rounded-xl transition-colors ${
                  activeView === 'settings'
                    ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/80'
                }`}
              >
                <Settings className="w-4 h-4" />
              </button>

              {/* Theme Toggle */}
              <button
                id="theme-toggle-btn"
                onClick={() => setDarkMode((prev) => !prev)}
                title={darkMode ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
                className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 rounded-xl transition-colors"
              >
                {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>
          </header>
        )}

        {/* Global Animated Sync Progress Bar */}
        {(isSyncing || syncProgress) && (
          <SyncProgressBar
            isSyncing={isSyncing}
            progress={syncProgress}
            onDismiss={() => setSyncProgress(null)}
          />
        )}

        {/* Main Workspace Canvas */}
        <main className="flex-1 overflow-hidden relative">
          {activeView === 'notes' ? (
            <div className="h-full w-full flex overflow-hidden">
              {/* Left Column: Note Explorer */}
              {!focusMode && (
                <div
                  className={`h-full overflow-hidden w-full md:w-80 lg:w-96 shrink-0 md:border-r border-zinc-200/80 dark:border-zinc-800/80 ${
                    selectedNote ? 'hidden md:block' : 'block'
                  }`}
                >
                  <EventNotesList
                    events={events}
                    notes={notes}
                    selectedEventId={selectedEventId}
                    selectedNoteId={selectedNoteId}
                    onSelectEvent={(eid) => setSelectedEventId(eid)}
                    onSelectNote={(nid) => setSelectedNoteId(nid)}
                    onCreateEvent={handleCreateEvent}
                    onCreateNote={handleCreateNote}
                    onDeleteEvent={handleDeleteEvent}
                    onDeleteNote={handleDeleteNote}
                    onRefresh={refreshLocalState}
                  />
                </div>
              )}

              {/* Right Column: Note Editor or Recent Dashboard */}
              <div
                className={`h-full overflow-hidden flex-1 bg-white dark:bg-[#0c0c0e] ${
                  selectedNote ? 'block' : 'hidden md:block'
                }`}
              >
                {selectedNote ? (
                  <NoteEditor
                    note={selectedNote}
                    events={events}
                    focusMode={focusMode}
                    onToggleFocus={() => setFocusMode((prev) => !prev)}
                    onNoteUpdated={handleNoteUpdated}
                    onNoteDeleted={handleDeleteNote}
                    onOpenVersions={() => setShowConflictModal(true)}
                    onClose={() => {
                      setSelectedNoteId(null);
                      setFocusMode(false);
                    }}
                  />
                ) : (
                  <RecentNotesSection
                    notes={notes}
                    events={events}
                    onSelectNote={(nid) => setSelectedNoteId(nid)}
                    onCreateNote={(eid, type) => handleCreateNote(eid || selectedEventId || undefined, type)}
                  />
                )}
              </div>
            </div>
          ) : activeView === 'recents' ? (
            /* Dedicated Timeline / Recents View */
            <div className="h-full overflow-y-auto custom-minimal-scrollbar bg-white dark:bg-[#0c0c0e]">
              <RecentNotesSection
                notes={notes}
                events={events}
                onSelectNote={(nid) => {
                  setSelectedNoteId(nid);
                  setActiveView('notes');
                }}
                onCreateNote={(eid, type) => {
                  handleCreateNote(eid || selectedEventId || undefined, type);
                  setActiveView('notes');
                }}
              />
            </div>
          ) : activeView === 'archive' ? (
            /* Dedicated Archive Section */
            <ArchiveSection
              notes={notes}
              events={events}
              onSelectNote={(nid) => {
                setSelectedNoteId(nid);
                setActiveView('notes');
              }}
              onRefresh={refreshLocalState}
            />
          ) : (
            /* Dedicated Integrated Settings & Cloud View */
            <div className="h-full overflow-y-auto custom-minimal-scrollbar bg-white dark:bg-[#0c0c0e]">
              <SettingsView
                initialSubtab={settingsSubtab}
                onOpenConflictModal={() => setShowConflictModal(true)}
                onRefreshNotes={refreshLocalState}
                onBackToNotes={selectedNote ? () => setActiveView('notes') : undefined}
                activeEditingNoteTitle={selectedNote?.title || (selectedNote ? 'Untitled Note' : undefined)}
              />
            </div>
          )}

          {/* Android Mobile Floating Action Button (FAB) */}
          {!selectedNote && activeView === 'notes' && (
            <div className="md:hidden fixed bottom-18 right-4 z-30">
              {showFabSpeedDial && (
                <div className="flex flex-col items-end gap-2.5 mb-3 animate-fade-in">
                  <button
                    onClick={() => handleCreateNote(undefined, 'text')}
                    className="flex items-center gap-2 px-3.5 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-full shadow-lg border border-zinc-200/80 dark:border-zinc-700 text-xs font-semibold"
                  >
                    <span>Text Note</span>
                    <div className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-zinc-700 flex items-center justify-center">
                      <FileText className="w-3.5 h-3.5" />
                    </div>
                  </button>
                  <button
                    onClick={() => handleCreateNote(undefined, 'checklist')}
                    className="flex items-center gap-2 px-3.5 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-full shadow-lg border border-zinc-200/80 dark:border-zinc-700 text-xs font-semibold"
                  >
                    <span>To-Do List</span>
                    <div className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-zinc-700 flex items-center justify-center">
                      <CheckSquare className="w-3.5 h-3.5" />
                    </div>
                  </button>
                  <button
                    onClick={() => handleCreateNote(undefined, 'sketch')}
                    className="flex items-center gap-2 px-3.5 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-full shadow-lg border border-zinc-200/80 dark:border-zinc-700 text-xs font-semibold"
                  >
                    <span>Sketch Canvas</span>
                    <div className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-zinc-700 flex items-center justify-center">
                      <PenTool className="w-3.5 h-3.5" />
                    </div>
                  </button>
                </div>
              )}

              <button
                id="mobile-fab-create-btn"
                onClick={() => setShowFabSpeedDial((p) => !p)}
                className={`w-13 h-13 rounded-2xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-xl flex items-center justify-center transition-transform active:scale-95 ${
                  showFabSpeedDial ? 'rotate-45' : ''
                }`}
              >
                <Plus className="w-6 h-6" />
              </button>
            </div>
          )}
        </main>

        {/* Mobile Bottom Navigation Bar */}
        {!focusMode && !selectedNote && (
          <nav className="md:hidden min-h-14 safe-area-pb border-t border-zinc-200/80 dark:border-zinc-800/80 bg-white/95 dark:bg-[#121215]/95 backdrop-blur-md px-3 py-1 flex items-center justify-around shrink-0 z-20">
            <button
              onClick={() => {
                NativeBridge.hapticImpact('light');
                setActiveView('notes');
                setSelectedNoteId(null);
              }}
              className={`flex flex-col items-center justify-center gap-0.5 transition-colors ${
                activeView === 'notes'
                  ? 'text-zinc-950 dark:text-zinc-50 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              <div
                className={`px-3 py-1 rounded-full transition-all ${
                  activeView === 'notes' ? 'bg-zinc-200/80 dark:bg-zinc-800' : ''
                }`}
              >
                <FileText className="w-4 h-4" />
              </div>
              <span className="text-[10px] tracking-tight">Notes</span>
            </button>

            <button
              onClick={() => {
                NativeBridge.hapticImpact('light');
                setActiveView('recents');
                setSelectedNoteId(null);
              }}
              className={`flex flex-col items-center justify-center gap-0.5 transition-colors ${
                activeView === 'recents'
                  ? 'text-zinc-950 dark:text-zinc-50 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              <div
                className={`px-3 py-1 rounded-full transition-all ${
                  activeView === 'recents' ? 'bg-zinc-200/80 dark:bg-zinc-800' : ''
                }`}
              >
                <Clock className="w-4 h-4" />
              </div>
              <span className="text-[10px] tracking-tight">Timeline</span>
            </button>

            <button
              onClick={() => {
                NativeBridge.hapticImpact('light');
                setActiveView('archive');
                setSelectedNoteId(null);
              }}
              className={`flex flex-col items-center justify-center gap-0.5 transition-colors ${
                activeView === 'archive'
                  ? 'text-zinc-950 dark:text-zinc-50 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              <div
                className={`px-3 py-1 rounded-full transition-all ${
                  activeView === 'archive' ? 'bg-zinc-200/80 dark:bg-zinc-800' : ''
                }`}
              >
                <Archive className="w-4 h-4" />
              </div>
              <span className="text-[10px] tracking-tight">Archive</span>
            </button>

            <button
              onClick={() => {
                NativeBridge.hapticImpact('light');
                setActiveView('settings');
                setSelectedNoteId(null);
              }}
              className={`flex flex-col items-center justify-center gap-0.5 transition-colors relative ${
                activeView === 'settings'
                  ? 'text-zinc-950 dark:text-zinc-50 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              <div
                className={`px-3 py-1 rounded-full transition-all relative ${
                  activeView === 'settings' ? 'bg-zinc-200/80 dark:bg-zinc-800' : ''
                }`}
              >
                <Settings className="w-4 h-4" />
                {unresolvedConflicts.length > 0 && (
                  <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                )}
              </div>
              <span className="text-[10px] tracking-tight">Settings</span>
            </button>
          </nav>
        )}

        {/* First Time User Onboarding Guide Modal */}
        {showOnboardingGuide && (
          <FirstTimeUserGuideModal
            isOpen={showOnboardingGuide}
            onClose={() => setShowOnboardingGuide(false)}
          />
        )}

        {/* Sync Conflict Resolution Modal */}
        {showConflictModal && (
          <ConflictResolutionModal
            conflict={unresolvedConflicts[0] || null}
            onResolved={(_body) => {
              refreshLocalState();
              setShowConflictModal(false);
            }}
            onClose={() => setShowConflictModal(false)}
          />
        )}
      </div>
    </div>
  );
}
