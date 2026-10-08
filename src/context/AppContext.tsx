import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  EventRecord,
  NoteRecord,
} from '../types';
import { StorageManager } from '../lib/storage';

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

interface AppContextValue {
  events: EventRecord[];
  notes: NoteRecord[];
  selectedEventId: number | null;
  selectedNoteId: number | null;
  activeView: 'all' | 'recent' | 'archive' | 'trash' | 'tag' | 'security_log' | 'version_history';
  selectedTag: string | null;
  searchQuery: string;
  filterType: 'all' | 'text' | 'checklist' | 'sketch';
  darkMode: boolean;
  isOnline: boolean;
  toastMessage: string | null;
  toastAction?: { label: string; onClick: () => void } | null;
  showToast: (msg: string, action?: { label: string; onClick: () => void }) => void;
  dismissToast: () => void;

  setSelectedEventId: (id: number | null) => void;
  setSelectedNoteId: (id: number | null) => void;
  setActiveView: (view: 'all' | 'recent' | 'archive' | 'trash' | 'tag' | 'security_log' | 'version_history') => void;
  setSelectedTag: (tag: string | null) => void;
  setSearchQuery: (q: string) => void;
  setFilterType: (f: 'all' | 'text' | 'checklist' | 'sketch') => void;
  setDarkMode: (val: boolean | ((prev: boolean) => boolean)) => void;

  refreshData: () => void;
  createEvent: (title: string) => EventRecord;
  updateEvent: (id: number, updates: Partial<EventRecord>) => void;
  deleteEvent: (id: number) => void;
  createNote: (params?: Partial<NoteRecord>) => NoteRecord;
  updateNote: (id: number, updates: Partial<NoteRecord>) => NoteRecord | null;
  deleteNote: (id: number) => void;
  archiveNote: (id: number) => void;
  unarchiveNote: (id: number) => void;
  trashNote: (id: number) => void;
  restoreNote: (id: number) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [events, setEvents] = useState<EventRecord[]>(() => asArray(StorageManager.getEvents()));
  const [notes, setNotes] = useState<NoteRecord[]>(() => asArray(StorageManager.getNotes()));
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [activeView, setActiveView] = useState<
    'all' | 'recent' | 'archive' | 'trash' | 'tag' | 'security_log' | 'version_history'
  >('all');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'text' | 'checklist' | 'sketch'>('all');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastAction, setToastAction] = useState<{ label: string; onClick: () => void } | null>(null);
  const toastTimeoutRef = React.useRef<number | null>(null);

  const dismissToast = useCallback(() => {
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = null;
    }
    setToastMessage(null);
    setToastAction(null);
  }, []);

  const showToast = useCallback((msg: string, action?: { label: string; onClick: () => void }) => {
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    setToastMessage(msg);
    setToastAction(action || null);
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage(null);
      setToastAction(null);
      toastTimeoutRef.current = null;
    }, 4500);
  }, []);

  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  const [darkMode, setDarkModeState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('omninote_dark_mode_v1');
      if (saved !== null) return JSON.parse(saved);
      return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }
  });

  const setDarkMode = useCallback((valOrFn: boolean | ((prev: boolean) => boolean)) => {
    setDarkModeState((prev) => {
      const next = typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn;
      try {
        localStorage.setItem('omninote_dark_mode_v1', JSON.stringify(next));
      } catch (e) {
        console.error('Failed to save dark mode preference', e);
      }
      return next;
    });
  }, []);

  const refreshData = useCallback(() => {
    setEvents(asArray(StorageManager.getEvents()));
    setNotes(asArray(StorageManager.getNotes()));
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showToast('Network restored.');
    };
    const handleOffline = () => {
      setIsOnline(false);
      showToast('Offline mode active. All notes safely stored on device.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [showToast]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const createEvent = useCallback(
    (title: string): EventRecord => {
      const newEv = StorageManager.addEvent({
        title: title.trim(),
        event_date: new Date().toISOString().slice(0, 10),
      });
      setEvents(asArray(StorageManager.getEvents()));
      showToast(`Category "${title.trim()}" created`);
      return newEv;
    },
    [showToast]
  );

  const updateEvent = useCallback(
    (id: number, updates: Partial<EventRecord>) => {
      StorageManager.updateEvent(id, updates);
      setEvents(asArray(StorageManager.getEvents()));
      showToast('Event updated.');
    },
    [showToast]
  );

  const deleteEvent = useCallback(
    (id: number) => {
      StorageManager.deleteEvent(id);
      refreshData();
      if (selectedEventId === id) setSelectedEventId(null);
      showToast('Category and its notes removed.');
    },
    [refreshData, selectedEventId, showToast]
  );

  const createNote = useCallback(
    (params?: Partial<NoteRecord>): NoteRecord => {
      const targetEventId = params?.event_id ?? selectedEventId ?? (events[0]?.id || 1);
      try {
        const newNote = StorageManager.addNote({
          event_id: targetEventId,
          title: params?.title || '',
          body: params?.body || '',
          note_type: params?.note_type || 'text',
          checklist_items: params?.checklist_items || [],
          tags: params?.tags || [],
          created_at: new Date().toISOString(),
        });
        setNotes(asArray(StorageManager.getNotes()));
        setSelectedNoteId(newNote.id);
        showToast('New note created.');
        return newNote;
      } catch (e: any) {
        console.error('Failed to create note:', e);
        showToast(`Storage Error: ${e.message}`);
        throw e;
      }
    },
    [events, selectedEventId, showToast]
  );

  const updateNote = useCallback((id: number, updates: Partial<NoteRecord>): NoteRecord | null => {
    const updated = StorageManager.updateNote(id, updates);
    if (updated) {
      setNotes(asArray(StorageManager.getNotes()));
    }
    return updated;
  }, []);

  const deleteNote = useCallback(
    (id: number) => {
      StorageManager.deleteNote(id);
      setNotes(asArray(StorageManager.getNotes()));
      if (selectedNoteId === id) setSelectedNoteId(null);
      showToast('Note deleted.');
    },
    [selectedNoteId, showToast]
  );

  const archiveNote = useCallback(
    (id: number) => {
      StorageManager.archiveNote(id);
      setNotes(asArray(StorageManager.getNotes()));
      if (selectedNoteId === id) setSelectedNoteId(null);
      showToast('Note moved to Archive.');
    },
    [selectedNoteId, showToast]
  );

  const unarchiveNote = useCallback(
    (id: number) => {
      StorageManager.unarchiveNote(id);
      setNotes(asArray(StorageManager.getNotes()));
      showToast('Note restored to active.');
    },
    [showToast]
  );

  const trashNote = useCallback(
    (id: number) => {
      StorageManager.trashNote(id);
      setNotes(asArray(StorageManager.getNotes()));
      if (selectedNoteId === id) setSelectedNoteId(null);
      showToast('Note moved to Trash.', {
        label: 'Undo',
        onClick: () => {
          StorageManager.restoreNote(id);
          setNotes(asArray(StorageManager.getNotes()));
          setSelectedNoteId(id);
        },
      });
    },
    [selectedNoteId, showToast]
  );

  const restoreNote = useCallback(
    (id: number) => {
      StorageManager.restoreNote(id);
      setNotes(asArray(StorageManager.getNotes()));
      showToast('Note restored to active.');
    },
    [showToast]
  );

  const value = useMemo<AppContextValue>(
    () => ({
      events,
      notes,
      selectedEventId,
      selectedNoteId,
      activeView,
      selectedTag,
      searchQuery,
      filterType,
      darkMode,
      isOnline,
      toastMessage,
      toastAction,
      showToast,
      dismissToast,
      setSelectedEventId,
      setSelectedNoteId,
      setActiveView,
      setSelectedTag,
      setSearchQuery,
      setFilterType,
      setDarkMode,
      refreshData,
      createEvent,
      updateEvent,
      deleteEvent,
      createNote,
      updateNote,
      deleteNote,
      archiveNote,
      unarchiveNote,
      trashNote,
      restoreNote,
    }),
    [
      events,
      notes,
      selectedEventId,
      selectedNoteId,
      activeView,
      selectedTag,
      searchQuery,
      filterType,
      darkMode,
      isOnline,
      toastMessage,
      toastAction,
      showToast,
      dismissToast,
      setDarkMode,
      refreshData,
      createEvent,
      updateEvent,
      deleteEvent,
      createNote,
      updateNote,
      deleteNote,
      archiveNote,
      unarchiveNote,
      trashNote,
      restoreNote,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = (): AppContextValue => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
