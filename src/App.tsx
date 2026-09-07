import React, { useState, useEffect } from 'react';
import {
  Moon,
  Sun,
  FileText,
  Plus,
  CheckSquare,
  PenTool,
  Clock,
  Settings,
  Archive,
  Key,
  Sparkles,
  X,
  Info,
} from 'lucide-react';
import { EventRecord, NoteRecord } from './types';
import { StorageManager } from './lib/storage';
import { NativeBridge } from './lib/nativeBridge';
import { CloudSyncEngine } from './lib/cloudSync';
import { useApp } from './context/AppContext';
import { EventNotesList } from './components/EventNotesList';
import { NoteEditor } from './components/NoteEditor';
import { RecentNotesSection } from './components/RecentNotesSection';
import { ArchiveSection } from './components/ArchiveSection';
import { SettingsView } from './components/SettingsView';
import { AppUpdateModal } from './components/AppUpdateModal';
import { AppUpdateManager } from './lib/appUpdateManager';
import { ModalBackStack } from './lib/modalBackStack';
import {
  FirstTimeUserGuideModal,
  hasCompletedOnboarding,
  markOnboardingCompleted,
} from './components/FirstTimeUserGuideModal';
import { AppLogo } from './components/AppLogo';

export default function App() {
  const {
    events,
    notes,
    selectedEventId,
    setSelectedEventId,
    selectedNoteId,
    setSelectedNoteId,
    darkMode,
    setDarkMode,
    refreshData,
    deleteEvent,
    deleteNote,
    showToast,
    toastMessage,
    toastAction,
    dismissToast,
  } = useApp();

  // Local UI Navigation & modal states
  const [activeView, setActiveView] = useState<'notes' | 'recents' | 'archive' | 'settings'>('notes');
  const [settingsSubtab, setSettingsSubtab] = useState<'cloud' | 'ai' | 'storage' | 'security' | 'diagnostics'>('cloud');
  const [showFabSpeedDial, setShowFabSpeedDial] = useState(false);
  const [focusMode, setFocusMode] = useState<boolean>(false);
  const [showOnboardingGuide, setShowOnboardingGuide] = useState<boolean>(() => !hasCompletedOnboarding());
  const [showUpdateModal, setShowUpdateModal] = useState<boolean>(false);

  // Run schema checks and check for remote updates once per session on startup
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('cloud') === 'connected') {
      CloudSyncEngine.fetchConfig().then(() => {
        setActiveView('settings');
        setSettingsSubtab('cloud' as any);
        window.history.replaceState({}, document.title, '/');
      });
    } else {
      CloudSyncEngine.fetchConfig();
    }

    const migrationResult = AppUpdateManager.checkAndRunMigrations();
    if (migrationResult.showChangelog) {
      setShowUpdateModal(true);
    }

    const checked = sessionStorage.getItem('vellumscribe_update_checked');
    if (!checked) {
      sessionStorage.setItem('vellumscribe_update_checked', 'true');
      AppUpdateManager.checkForRemoteUpdates()
        .then((res) => {
          if (res.hasUpdate) {
            setShowUpdateModal(true);
          }
        })
        .catch(() => {});
    }
  }, []);

  // Active Note Reminder Notification Watcher (In-app alerts + Web Notification API)
  useEffect(() => {
    // Skip scheduling interval if no active notes have reminders
    const hasAnyReminders = notes.some(
      (n) => n.reminder_at && n.status !== 'archived' && n.status !== 'trash'
    );
    if (!hasAnyReminders) {
      return;
    }

    const notifiedKey = 'vellumscribe_notified_reminders';
    const checkReminders = () => {
      // Pause reminder processing when app/tab is hidden or backgrounded
      if (typeof document !== 'undefined' && document.hidden) {
        return;
      }

      try {
        const notified: string[] = JSON.parse(sessionStorage.getItem(notifiedKey) || '[]');
        const now = Date.now();
        const dueNotes = notes.filter(
          (n) => n.reminder_at && n.status !== 'archived' && n.status !== 'trash' && new Date(n.reminder_at).getTime() <= now && !notified.includes(String(n.id))
        );

        for (const note of dueNotes) {
          notified.push(String(note.id));
          sessionStorage.setItem(notifiedKey, JSON.stringify(notified));

          // 1. In-app toast notification with quick jump
          showToast(`Reminder: ${note.title || 'Untitled Note'}`, {
            label: 'View',
            onClick: () => setSelectedNoteId(note.id),
          });

          // 2. Web browser notification if granted
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification(`Reminder: ${note.title || 'Untitled Note'}`, {
                body: note.body ? note.body.slice(0, 100) : 'Note reminder due',
                icon: '/favicon.ico',
              });
            } catch {}
          }
        }
      } catch {}
    };

    checkReminders();
    const interval = setInterval(checkReminders, 15000);
    return () => clearInterval(interval);
  }, [notes, showToast, setSelectedNoteId]);

  // Android System Back Navigation Handler (Hardware Back Button & Swipe Edge Gestures)
  useEffect(() => {
    // Maintain a history state baseline for Android phone navigation trapping
    if (!window.history.state || window.history.state.vellumscribe !== 'active') {
      window.history.pushState({ vellumscribe: 'active' }, '');
    }

    const handlePopState = () => {
      // 1. First priority: Dismiss any open foreground modal on top of stack
      if (ModalBackStack.handlePopState()) {
        return;
      }

      // 2. User triggered Android hardware back button or edge swipe gesture for main views
      if (showFabSpeedDial) {
        setShowFabSpeedDial(false);
        window.history.pushState({ vellumscribe: 'active' }, '');
        return;
      }
      if (showOnboardingGuide) {
        markOnboardingCompleted();
        setShowOnboardingGuide(false);
        window.history.pushState({ vellumscribe: 'active' }, '');
        return;
      }
      if (showUpdateModal) {
        setShowUpdateModal(false);
        window.history.pushState({ vellumscribe: 'active' }, '');
        return;
      }
      if (selectedNoteId) {
        setSelectedNoteId(null);
        window.history.pushState({ vellumscribe: 'active' }, '');
        return;
      }
      if (activeView !== 'notes') {
        setActiveView('notes');
        window.history.pushState({ vellumscribe: 'active' }, '');
        return;
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [showFabSpeedDial, showOnboardingGuide, showUpdateModal, selectedNoteId, activeView]);

  // Event & Note CRUD Handlers
  const handleCreateEvent = (newEvent: Omit<EventRecord, 'id'>) => {
    const created = StorageManager.addEvent(newEvent);
    refreshData();
    setSelectedEventId(created.id);
  };

  const handleCreateNote = (eventId?: number, type: 'text' | 'checklist' | 'sketch' = 'text') => {
    let targetEventId = eventId || selectedEventId;
    if (!targetEventId) {
      if (events.length > 0) {
        targetEventId = events[0].id;
      } else {
        const defaultCat = StorageManager.addEvent({
          title: 'General',
          event_date: new Date().toISOString().split('T')[0],
          category: 'personal',
          color: '#3b82f6',
        });
        targetEventId = defaultCat.id;
      }
    }

    try {
      const newNote = StorageManager.addNote({
        event_id: targetEventId,
        title: type === 'checklist' ? 'New To-Do List' : type === 'sketch' ? 'New Sketch Note' : 'Untitled Note',
        body: type === 'checklist' ? 'Notes & subtasks' : type === 'sketch' ? 'Visual annotations' : '## Thoughts\n\nBegin typing here...',
        note_type: type,
        checklist_items: type === 'checklist' ? [{ id: '1', text: 'First task', completed: false }] : undefined,
        created_at: new Date().toISOString(),
        tags: [type === 'checklist' ? 'Tasks' : type === 'sketch' ? 'Drawings' : 'General'],
        is_pinned: false,
      });
      refreshData();
      setSelectedNoteId(newNote.id);
      setActiveView('notes');
      setShowFabSpeedDial(false);
    } catch (e: any) {
      console.error('Failed to create new note:', e);
      showToast(`Storage Error: ${e.message}`);
    }
  };

  const handleDeleteEvent = (eventId: number) => {
    deleteEvent(eventId);
    refreshData();
    if (selectedEventId === eventId) setSelectedEventId(null);
  };

  const handleDeleteNote = (noteId: number) => {
    deleteNote(noteId);
    refreshData();
    if (selectedNoteId === noteId) setSelectedNoteId(null);
  };

  const handleNoteUpdated = (_updated: NoteRecord) => {
    refreshData();
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
                <span>Recent</span>
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
                <span>Settings &amp; AI</span>
              </button>
            </div>

            {/* Right Action Icons */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Quick Note Button on Desktop */}
              <div className="hidden sm:block">
                <button
                  id="header-new-note-dropdown-btn"
                  onClick={() => handleCreateNote(undefined, 'text')}
                  title="Create New Note"
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 rounded-xl text-xs font-semibold shadow-2xs transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>New Note</span>
                </button>
              </div>

              {/* Direct Settings Tab Button */}
              <button
                id="open-app-settings-btn"
                onClick={() => {
                  setSelectedNoteId(null);
                  setActiveView('settings');
                }}
                title="Settings & AI Configuration"
                aria-label="Settings & AI Configuration"
                className={`min-h-[44px] min-w-[44px] p-2.5 rounded-xl transition-colors flex items-center justify-center ${
                  activeView === 'settings'
                    ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/80'
                }`}
              >
                <Settings className="w-5 h-5" />
              </button>

              {/* Theme Toggle */}
              <button
                id="theme-toggle-btn"
                onClick={() => setDarkMode((prev: boolean) => !prev)}
                title={darkMode ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
                aria-label={darkMode ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
                className="min-h-[44px] min-w-[44px] p-2.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 rounded-xl transition-colors flex items-center justify-center"
              >
                {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
            </div>
          </header>
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
                    onRefresh={refreshData}
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
                    onOpenVersions={() => setActiveView('archive')}
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
            /* Dedicated Recent View */
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
              onRefresh={refreshData}
            />
          ) : (
            /* Dedicated Integrated Settings & Cloud View */
            <div className="h-full overflow-y-auto custom-minimal-scrollbar bg-white dark:bg-[#0c0c0e]">
              <SettingsView
                initialSubtab={settingsSubtab}
                onRefreshNotes={refreshData}
                onOpenUpdateModal={() => setShowUpdateModal(true)}
                onOpenOnboardingGuide={() => setShowOnboardingGuide(true)}
                onBackToNotes={selectedNote ? () => setActiveView('notes') : undefined}
                activeEditingNoteTitle={selectedNote?.title || (selectedNote ? 'Untitled Note' : undefined)}
              />
            </div>
          )}

          {/* Android Mobile Floating Action Button (FAB) */}
          {!selectedNote && activeView === 'notes' && (
            <>
              {showFabSpeedDial && (
                <div
                  className="md:hidden fixed inset-0 z-25 bg-black/20 backdrop-blur-2xs"
                  onClick={() => setShowFabSpeedDial(false)}
                />
              )}
              <div className="md:hidden fixed bottom-20 right-4 z-30">
                {showFabSpeedDial && (
                  <div className="flex flex-col items-end gap-2.5 mb-3 animate-fade-in">
                    <button
                      onClick={() => {
                        setShowFabSpeedDial(false);
                        handleCreateNote(undefined, 'text');
                      }}
                      className="flex items-center gap-2 px-3.5 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-full shadow-lg border border-zinc-200/80 dark:border-zinc-700 text-xs font-semibold active:scale-95 transition-transform"
                    >
                      <span>Text Note</span>
                      <div className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-zinc-700 flex items-center justify-center">
                        <FileText className="w-3.5 h-3.5" />
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        setShowFabSpeedDial(false);
                        handleCreateNote(undefined, 'checklist');
                      }}
                      className="flex items-center gap-2 px-3.5 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-full shadow-lg border border-zinc-200/80 dark:border-zinc-700 text-xs font-semibold active:scale-95 transition-transform"
                    >
                      <span>To-Do List</span>
                      <div className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-zinc-700 flex items-center justify-center">
                        <CheckSquare className="w-3.5 h-3.5" />
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        setShowFabSpeedDial(false);
                        handleCreateNote(undefined, 'sketch');
                      }}
                      className="flex items-center gap-2 px-3.5 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-full shadow-lg border border-zinc-200/80 dark:border-zinc-700 text-xs font-semibold active:scale-95 transition-transform"
                    >
                      <span>Sketch</span>
                      <div className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-zinc-700 flex items-center justify-center">
                        <PenTool className="w-3.5 h-3.5" />
                      </div>
                    </button>
                  </div>
                )}

                <button
                  id="mobile-fab-create-btn"
                  onClick={() => setShowFabSpeedDial((p) => !p)}
                  aria-label={showFabSpeedDial ? "Close create menu" : "Create note"}
                  className={`w-13 h-13 rounded-2xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-xl flex items-center justify-center transition-transform active:scale-95 ${
                    showFabSpeedDial ? 'rotate-45' : ''
                  }`}
                >
                  <Plus className="w-6 h-6" />
                </button>
              </div>
            </>
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
              <span className="text-[10px] tracking-tight">Recent</span>
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
              </div>
              <span className="text-[10px] tracking-tight">Settings</span>
            </button>
          </nav>
        )}

        {/* First Time User Onboarding Guide Modal */}
        {showOnboardingGuide && (
          <FirstTimeUserGuideModal
            isOpen={showOnboardingGuide}
            onClose={() => {
              markOnboardingCompleted();
              setShowOnboardingGuide(false);
            }}
          />
        )}

        {/* App Version & Migration Update Modal */}
        {showUpdateModal && (
          <AppUpdateModal onClose={() => setShowUpdateModal(false)} />
        )}

        {/* Global Accessible Toast Notification Banner */}
        {toastMessage && (
          <div
            role="status"
            aria-live="polite"
            className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-md w-[calc(100%-2rem)] sm:w-auto min-w-[280px] bg-zinc-900/95 dark:bg-zinc-100/95 text-zinc-100 dark:text-zinc-900 border border-zinc-800 dark:border-zinc-200/80 rounded-xl px-3.5 py-2.5 shadow-2xl backdrop-blur-md flex items-center justify-between gap-3 text-xs animate-fade-in"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Info className="w-4 h-4 text-indigo-400 dark:text-indigo-600 shrink-0" />
              <span className="font-medium truncate leading-tight">{toastMessage}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {toastAction && (
                <button
                  onClick={() => {
                    toastAction.onClick();
                    dismissToast();
                  }}
                  className="px-2 py-0.5 bg-zinc-800 dark:bg-zinc-200 hover:bg-zinc-700 dark:hover:bg-zinc-300 text-white dark:text-zinc-900 rounded font-semibold text-[11px] transition-colors"
                >
                  {toastAction.label}
                </button>
              )}
              <button
                onClick={dismissToast}
                aria-label="Close notification"
                className="p-1 text-zinc-400 hover:text-zinc-200 dark:hover:text-zinc-700 rounded-md transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
