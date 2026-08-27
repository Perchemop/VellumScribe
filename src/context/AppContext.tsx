import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  EventRecord,
  NoteRecord,
  BackupFrequency,
  CloudAccount,
} from '../types';
import { StorageManager } from '../lib/storage';
import { CloudSyncEngine } from '../lib/cloudSync';
import { NativeBridge } from '../lib/nativeBridge';

interface AppContextValue {
  // State
  events: EventRecord[];
  notes: NoteRecord[];
  selectedEventId: number | null;
  selectedNoteId: number | null;
  activeView: 'all' | 'recent' | 'archive' | 'trash' | 'tag' | 'security_log' | 'version_history';
  selectedTag: string | null;
  searchQuery: string;
  filterType: 'all' | 'text' | 'checklist' | 'sketch';
  darkMode: boolean;
  isSyncing: boolean;
  syncProgress: number;
  syncStatusMessage: string;
  backupFrequency: BackupFrequency;
  cloudAccounts: CloudAccount[];
  isOnline: boolean;
  toastMessage: string | null;

  // Setters
  setSelectedEventId: (id: number | null) => void;
  setSelectedNoteId: (id: number | null) => void;
  setActiveView: (view: 'all' | 'recent' | 'archive' | 'trash' | 'tag' | 'security_log' | 'version_history') => void;
  setSelectedTag: (tag: string | null) => void;
  setSearchQuery: (q: string) => void;
  setFilterType: (f: 'all' | 'text' | 'checklist' | 'sketch') => void;
  setDarkMode: (val: boolean | ((prev: boolean) => boolean)) => void;
  setBackupFrequency: (freq: BackupFrequency) => void;
  showToast: (msg: string) => void;

  // Data Actions
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
  triggerSync: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [events, setEvents] = useState<EventRecord[]>(() => StorageManager.getEvents());
  const [notes, setNotes] = useState<NoteRecord[]>(() => StorageManager.getNotes());
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [activeView, setActiveView] = useState<'all' | 'recent' | 'archive' | 'trash' | 'tag' | 'security_log' | 'version_history'>('all');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'text' | 'checklist' | 'sketch'>('all');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncStatusMessage, setSyncStatusMessage] = useState('');
  const [backupFrequency, setBackupFrequencyState] = useState<BackupFrequency>(() => CloudSyncEngine.getBackupFrequency());
  const [cloudAccounts, setCloudAccounts] = useState<CloudAccount[]>(() => CloudSyncEngine.getAccounts());
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));

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

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 2800);
  }, []);

  const refreshData = useCallback(() => {
    setEvents(StorageManager.getEvents());
    setNotes(StorageManager.getNotes());
    setCloudAccounts(CloudSyncEngine.getAccounts());
  }, []);

  // Online / Offline listener
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showToast('Network restored. Local changes ready for sync.');
    };
    const handleOffline = () => {
      setIsOnline(false);
      showToast('Offline mode active. All edits safely saved locally.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [showToast]);

  // Dark mode class sync on DOM root
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const setBackupFrequency = useCallback((freq: BackupFrequency) => {
    CloudSyncEngine.setBackupFrequency(freq);
    setBackupFrequencyState(freq);
    showToast(`Backup schedule set to ${freq}`);
  }, [showToast]);

  const createEvent = useCallback((title: string): EventRecord => {
    const newEv = StorageManager.addEvent({
      title: title.trim(),
      event_date: new Date().toISOString().slice(0, 10),
    });
    setEvents(StorageManager.getEvents());
    NativeBridge.hapticsVibrate();
    showToast(`Folder "${newEv.title}" created`);
    return newEv;
  }, [showToast]);

  const updateEvent = useCallback((id: number, updates: Partial<EventRecord>) => {
    StorageManager.updateEvent(id, updates);
    setEvents(StorageManager.getEvents());
  }, []);

  const deleteEvent = useCallback((id: number) => {
    StorageManager.deleteEvent(id);
    setEvents(StorageManager.getEvents());
    setNotes(StorageManager.getNotes());
    if (selectedEventId === id) setSelectedEventId(null);
    showToast('Folder and associated items removed.');
  }, [selectedEventId, showToast]);

  const createNote = useCallback((params?: Partial<NoteRecord>): NoteRecord => {
    const defaultEventId = selectedEventId || (events[0]?.id ?? 1);
    const newNote = StorageManager.addNote({
      event_id: params?.event_id ?? defaultEventId,
      title: params?.title || '',
      body: params?.body || '',
      note_type: params?.note_type || 'text',
      checklist_items: params?.checklist_items || [],
      sketch_data: params?.sketch_data,
      status: 'active',
      cloud_save_enabled: false,
      created_at: new Date().toISOString(),
    });
    setNotes(StorageManager.getNotes());
    setSelectedNoteId(newNote.id);
    NativeBridge.hapticsVibrate();
    return newNote;
  }, [events, selectedEventId]);

  const updateNote = useCallback((id: number, updates: Partial<NoteRecord>): NoteRecord | null => {
    const updated = StorageManager.updateNote(id, updates);
    if (updated) {
      setNotes(StorageManager.getNotes());
    }
    return updated;
  }, []);

  const deleteNote = useCallback((id: number) => {
    StorageManager.deleteNote(id);
    setNotes(StorageManager.getNotes());
    if (selectedNoteId === id) setSelectedNoteId(null);
    showToast('Note deleted permanently.');
  }, [selectedNoteId, showToast]);

  const archiveNote = useCallback((id: number) => {
    StorageManager.archiveNote(id);
    setNotes(StorageManager.getNotes());
    showToast('Note archived.');
  }, [showToast]);

  const unarchiveNote = useCallback((id: number) => {
    StorageManager.unarchiveNote(id);
    setNotes(StorageManager.getNotes());
    showToast('Note unarchived.');
  }, [showToast]);

  const trashNote = useCallback((id: number) => {
    StorageManager.trashNote(id);
    setNotes(StorageManager.getNotes());
    if (selectedNoteId === id) setSelectedNoteId(null);
    showToast('Note moved to Trash.');
  }, [selectedNoteId, showToast]);

  const restoreNote = useCallback((id: number) => {
    StorageManager.restoreNote(id);
    setNotes(StorageManager.getNotes());
    showToast('Note restored to active.');
  }, [showToast]);

  const triggerSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncProgress(10);
    setSyncStatusMessage('Connecting to cloud storage...');
    try {
      await CloudSyncEngine.syncWithCloud(
        (progress, msg) => {
          setSyncProgress(progress);
          setSyncStatusMessage(msg);
        }
      );
      refreshData();
      showToast('Cloud backup completed successfully.');
    } catch (e: any) {
      showToast(`Sync warning: ${e.message || 'Sync failed.'}`);
    } finally {
      setIsSyncing(false);
      setSyncProgress(0);
      setSyncStatusMessage('');
    }
  }, [isSyncing, refreshData, showToast]);

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
      isSyncing,
      syncProgress,
      syncStatusMessage,
      backupFrequency,
      cloudAccounts,
      isOnline,
      toastMessage,
      setSelectedEventId,
      setSelectedNoteId,
      setActiveView,
      setSelectedTag,
      setSearchQuery,
      setFilterType,
      setDarkMode,
      setBackupFrequency,
      showToast,
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
      triggerSync,
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
      isSyncing,
      syncProgress,
      syncStatusMessage,
      backupFrequency,
      cloudAccounts,
      isOnline,
      toastMessage,
      setDarkMode,
      setBackupFrequency,
      showToast,
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
      triggerSync,
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
