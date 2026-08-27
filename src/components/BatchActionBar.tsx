import React, { useState } from 'react';
import {
  X,
  Trash2,
  GitMerge,
  Archive,
  Pin,
  Palette,
  Tag,
  FolderInput,
  Download,
  Copy,
  Lock,
  Unlock,
  Cloud,
  CheckSquare,
  RotateCcw,
  MoreVertical,
  ChevronDown,
  Share2,
} from 'lucide-react';
import { EventRecord, NoteRecord } from '../types';
import { StorageManager } from '../lib/storage';
import { NativeBridge } from '../lib/nativeBridge';

interface BatchActionBarProps {
  selectedNoteIds: number[];
  allNotes: NoteRecord[];
  events: EventRecord[];
  activeTab: string;
  onClearSelection: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onOpenMergeModal: () => void;
  onRefresh: () => void;
}

const PALETTE_COLORS = [
  { label: 'Clear Tint', value: '' },
  { label: 'Blue', value: '#3b82f6' },
  { label: 'Emerald', value: '#10b981' },
  { label: 'Amber', value: '#f59e0b' },
  { label: 'Rose', value: '#ef4444' },
  { label: 'Purple', value: '#8b5cf6' },
  { label: 'Slate', value: '#64748b' },
];

export const BatchActionBar: React.FC<BatchActionBarProps> = ({
  selectedNoteIds,
  allNotes,
  events,
  activeTab,
  onClearSelection,
  onSelectAll,
  onDeselectAll,
  onOpenMergeModal,
  onRefresh,
}) => {
  const [showCategorySheet, setShowCategorySheet] = useState(false);
  const [showColorSheet, setShowColorSheet] = useState(false);
  const [showTagSheet, setShowTagSheet] = useState(false);
  const [showLockSheet, setShowLockSheet] = useState(false);
  const [showUnlockSheet, setShowUnlockSheet] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [lockPinInput, setLockPinInput] = useState('');
  const [unlockPinInput, setUnlockPinInput] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const count = selectedNoteIds.length;
  if (count === 0) return null;

  const isAllSelected = count === allNotes.length && allNotes.length > 0;

  // Selected notes objects
  const selectedNotes = allNotes.filter((n) => selectedNoteIds.includes(n.id));
  const hasUnpinned = selectedNotes.some((n) => !n.is_pinned);
  const hasLocked = selectedNotes.some((n) => n.is_locked);
  const hasCloudDisabled = selectedNotes.some((n) => !n.cloud_save_enabled);

  // In-app confirmation modal state for deletion/trashing (avoids iframe window.confirm blocks)
  const [confirmModal, setConfirmModal] = useState<'trash' | 'permanent_delete' | null>(null);

  // Batch actions
  const executeBatchTrash = () => {
    StorageManager.batchTrashNotes(selectedNoteIds);
    setConfirmModal(null);
    onClearSelection();
    onRefresh();
  };

  const executeBatchPermanentDelete = () => {
    StorageManager.batchDeleteNotesPermanently(selectedNoteIds);
    setConfirmModal(null);
    onClearSelection();
    onRefresh();
  };

  const handleBatchTrashOrDelete = () => {
    if (activeTab === 'trash') {
      setConfirmModal('permanent_delete');
    } else {
      setConfirmModal('trash');
    }
  };

  const handleBatchRestore = () => {
    StorageManager.batchRestoreNotes(selectedNoteIds);
    onClearSelection();
    onRefresh();
  };

  const handleBatchArchive = () => {
    if (activeTab === 'archived') {
      StorageManager.batchUnarchiveNotes(selectedNoteIds);
    } else {
      StorageManager.batchArchiveNotes(selectedNoteIds);
    }
    onClearSelection();
    onRefresh();
  };

  const handleBatchPin = () => {
    StorageManager.batchPinNotes(selectedNoteIds, hasUnpinned);
    onClearSelection();
    onRefresh();
  };

  const handleBatchMoveCategory = (eventId: number) => {
    StorageManager.batchMoveNotes(selectedNoteIds, eventId);
    setShowCategorySheet(false);
    onClearSelection();
    onRefresh();
  };

  const handleBatchColor = (color: string) => {
    StorageManager.batchColorNotes(selectedNoteIds, color);
    setShowColorSheet(false);
    onClearSelection();
    onRefresh();
  };

  const handleBatchAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagInput.trim()) return;
    StorageManager.batchAddTagToNotes(selectedNoteIds, tagInput.trim());
    setTagInput('');
    setShowTagSheet(false);
    onClearSelection();
    onRefresh();
  };

  const handleBatchDuplicate = () => {
    StorageManager.batchDuplicateNotes(selectedNoteIds);
    setShowMoreMenu(false);
    onClearSelection();
    onRefresh();
  };

  const handleBatchLock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lockPinInput.trim()) return;
    StorageManager.batchLockNotes(selectedNoteIds, lockPinInput.trim());
    setLockPinInput('');
    setShowLockSheet(false);
    onClearSelection();
    onRefresh();
  };

  const handleBatchUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlockPinInput.trim()) return;
    const result = await StorageManager.batchUnlockNotes(selectedNoteIds, unlockPinInput.trim());
    if (result.unlockedCount === 0) {
      setUnlockError('Incorrect PIN or unable to decrypt selected notes.');
      return;
    }
    setUnlockPinInput('');
    setUnlockError(null);
    setShowUnlockSheet(false);
    setShowMoreMenu(false);
    onClearSelection();
    onRefresh();
  };

  const handleBatchToggleCloud = () => {
    StorageManager.batchToggleCloudSave(selectedNoteIds, hasCloudDisabled);
    setShowMoreMenu(false);
    onClearSelection();
    onRefresh();
  };

  const handleExportMarkdown = async () => {
    const md = StorageManager.exportNotesAsMarkdown(selectedNoteIds);
    const fileName = `VellumScribe_Notes_${new Date().toISOString().slice(0, 10)}.md`;
    await NativeBridge.shareOrDownloadFile(fileName, md, 'text/markdown', 'Share Selected Markdown Notes');
    setShowExportMenu(false);
    setShowMoreMenu(false);
  };

  const handleExportJson = async () => {
    const jsonStr = StorageManager.exportNotesAsJson(selectedNoteIds);
    const fileName = `VellumScribe_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    await NativeBridge.shareOrDownloadFile(fileName, jsonStr, 'application/json', 'Share Selected Notes JSON');
    setShowExportMenu(false);
    setShowMoreMenu(false);
  };

  return (
    <>
      {/* Android Contextual Action Bar (CAB) */}
      <div
        id="batch-action-bar"
        className="sticky top-0 z-30 w-full bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950 px-3 sm:px-4 py-2.5 shadow-lg flex items-center justify-between transition-all animate-fade-in"
      >
        {/* Left Side: Close & Counter & Select All */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            id="batch-cancel-btn"
            onClick={onClearSelection}
            title="Cancel Selection"
            className="p-1.5 rounded-full hover:bg-white/15 dark:hover:bg-black/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm font-semibold tracking-tight">
              {count} selected
            </span>
            <button
              onClick={isAllSelected ? onDeselectAll : onSelectAll}
              className="text-[11px] font-medium opacity-80 hover:opacity-100 underline decoration-dotted ml-1"
            >
              {isAllSelected ? 'Deselect All' : 'Select All'}
            </button>
          </div>
        </div>

        {/* Right Side: Primary Actions */}
        <div className="flex items-center gap-0.5 sm:gap-1">
          {/* In Trash Tab: Restore & Permanent Delete */}
          {activeTab === 'trash' ? (
            <>
              <button
                onClick={handleBatchRestore}
                title="Restore Selected"
                className="p-2 rounded-lg hover:bg-white/15 dark:hover:bg-black/10 transition-colors flex items-center gap-1 text-xs font-medium"
              >
                <RotateCcw className="w-4 h-4" />
                <span className="hidden sm:inline">Restore</span>
              </button>
              <button
                onClick={handleBatchTrashOrDelete}
                title="Delete Permanently"
                className="p-2 rounded-lg hover:bg-rose-500/20 text-rose-300 dark:text-rose-600 transition-colors flex items-center gap-1 text-xs font-medium"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">Delete</span>
              </button>
            </>
          ) : (
            <>
              {/* Merge Notes Button (Requires at least 2 notes) */}
              {count >= 2 && (
                <button
                  id="batch-merge-btn"
                  onClick={onOpenMergeModal}
                  title="Merge Selected Notes"
                  className="p-2 rounded-lg hover:bg-white/15 dark:hover:bg-black/10 transition-colors flex items-center gap-1 text-xs font-medium"
                >
                  <GitMerge className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
                  <span className="hidden sm:inline">Merge</span>
                </button>
              )}

              {/* Move to Category */}
              <button
                id="batch-move-category-btn"
                onClick={() => setShowCategorySheet(true)}
                title="Move Category"
                className="p-2 rounded-lg hover:bg-white/15 dark:hover:bg-black/10 transition-colors flex items-center gap-1 text-xs font-medium"
              >
                <FolderInput className="w-4 h-4" />
                <span className="hidden md:inline">Move</span>
              </button>

              {/* Pin / Unpin */}
              <button
                onClick={handleBatchPin}
                title={hasUnpinned ? 'Pin Selected' : 'Unpin Selected'}
                className="p-2 rounded-lg hover:bg-white/15 dark:hover:bg-black/10 transition-colors flex items-center gap-1 text-xs font-medium"
              >
                <Pin className={`w-4 h-4 ${!hasUnpinned ? 'fill-current' : ''}`} />
                <span className="hidden md:inline">{hasUnpinned ? 'Pin' : 'Unpin'}</span>
              </button>

              {/* Archive / Unarchive */}
              <button
                onClick={handleBatchArchive}
                title={activeTab === 'archived' ? 'Unarchive Selected' : 'Archive Selected'}
                className="p-2 rounded-lg hover:bg-white/15 dark:hover:bg-black/10 transition-colors flex items-center gap-1 text-xs font-medium"
              >
                <Archive className="w-4 h-4" />
                <span className="hidden md:inline">{activeTab === 'archived' ? 'Unarchive' : 'Archive'}</span>
              </button>

              {/* Color Palette Picker */}
              <button
                onClick={() => setShowColorSheet(true)}
                title="Change Color"
                className="p-2 rounded-lg hover:bg-white/15 dark:hover:bg-black/10 transition-colors"
              >
                <Palette className="w-4 h-4" />
              </button>

              {/* Trash */}
              <button
                id="batch-trash-btn"
                onClick={handleBatchTrashOrDelete}
                title="Move to Trash"
                className="p-2 rounded-lg hover:bg-rose-500/20 text-rose-300 dark:text-rose-600 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              {/* More Overflow Menu */}
              <div className="relative">
                <button
                  id="batch-more-menu-btn"
                  onClick={() => setShowMoreMenu((p) => !p)}
                  title="More Batch Actions"
                  className="p-2 rounded-lg hover:bg-white/15 dark:hover:bg-black/10 transition-colors"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                {showMoreMenu && (
                  <div className="absolute right-0 top-10 w-48 bg-white dark:bg-[#18181c] text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 rounded-xl p-1.5 shadow-2xl z-40 space-y-0.5 text-xs animate-fade-in">
                    <button
                      onClick={() => {
                        setShowTagSheet(true);
                        setShowMoreMenu(false);
                      }}
                      className="w-full px-2.5 py-2 text-left rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2"
                    >
                      <Tag className="w-3.5 h-3.5 text-zinc-500" />
                      <span>Add Tag to Notes</span>
                    </button>

                    <button
                      onClick={handleBatchDuplicate}
                      className="w-full px-2.5 py-2 text-left rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2"
                    >
                      <Copy className="w-3.5 h-3.5 text-zinc-500" />
                      <span>Duplicate Notes ({count})</span>
                    </button>

                    {hasLocked ? (
                      <button
                        onClick={() => {
                          setShowUnlockSheet(true);
                          setShowMoreMenu(false);
                        }}
                        className="w-full px-2.5 py-2 text-left rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2"
                      >
                        <Unlock className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Remove PIN Lock</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setShowLockSheet(true);
                          setShowMoreMenu(false);
                        }}
                        className="w-full px-2.5 py-2 text-left rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2"
                      >
                        <Lock className="w-3.5 h-3.5 text-amber-500" />
                        <span>Lock with PIN</span>
                      </button>
                    )}

                    <button
                      onClick={handleBatchToggleCloud}
                      className="w-full px-2.5 py-2 text-left rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2"
                    >
                      <Cloud className="w-3.5 h-3.5 text-blue-500" />
                      <span>{hasCloudDisabled ? 'Enable Cloud Backup' : 'Disable Cloud Backup'}</span>
                    </button>

                    <div className="border-t border-zinc-200 dark:border-zinc-800 my-1" />

                    <button
                      onClick={handleExportMarkdown}
                      className="w-full px-2.5 py-2 text-left rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2"
                    >
                      <Download className="w-3.5 h-3.5 text-zinc-500" />
                      <span>Export as Markdown (.md)</span>
                    </button>

                    <button
                      onClick={handleExportJson}
                      className="w-full px-2.5 py-2 text-left rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2"
                    >
                      <Download className="w-3.5 h-3.5 text-zinc-500" />
                      <span>Export as JSON Backup</span>
                    </button>

                    <div className="border-t border-zinc-200 dark:border-zinc-800 my-1" />

                    <button
                      onClick={() => {
                        setShowMoreMenu(false);
                        setConfirmModal('permanent_delete');
                      }}
                      className="w-full px-2.5 py-2 text-left rounded-lg hover:bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center gap-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Permanently ({count})</span>
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Confirmation Modal for Batch Trash / Permanent Delete (Iframe-Safe) */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/65 backdrop-blur-xs select-none animate-fade-in">
          <div className="w-full max-w-sm bg-white dark:bg-[#16161a] rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {confirmModal === 'trash'
                    ? `Move ${count} Note${count > 1 ? 's' : ''} to Trash?`
                    : `Permanently Delete ${count} Note${count > 1 ? 's' : ''}?`}
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  {confirmModal === 'trash'
                    ? 'Notes can be restored from the Archive & Trash tab anytime.'
                    : 'This action is irreversible and will delete all attachments.'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-3.5 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmModal === 'trash' ? executeBatchTrash : executeBatchPermanentDelete}
                className="px-4 py-1.5 text-xs bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl shadow-2xs transition-colors"
              >
                {confirmModal === 'trash' ? 'Move to Trash' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category Picker Sheet */}
      {showCategorySheet && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-zinc-950/50 backdrop-blur-xs animate-fade-in">
          <div className="w-full sm:max-w-sm bg-white dark:bg-[#16161a] rounded-t-2xl sm:rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Move {count} note{count > 1 ? 's' : ''} to Category
                </h3>
                <p className="text-xs text-zinc-500">Choose destination category</p>
              </div>
              <button
                onClick={() => setShowCategorySheet(false)}
                className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1 max-h-60 overflow-y-auto custom-minimal-scrollbar">
              {events.map((ev) => (
                <button
                  key={ev.id}
                  onClick={() => handleBatchMoveCategory(ev.id)}
                  className="w-full px-3 py-2.5 rounded-xl text-left text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2.5 transition-colors"
                >
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: ev.color || '#3b82f6' }}
                  />
                  <span className="truncate flex-1">{ev.title}</span>
                  <span className="text-[10px] text-zinc-400 uppercase tracking-wider">{ev.category}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Color Palette Sheet */}
      {showColorSheet && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-zinc-950/50 backdrop-blur-xs animate-fade-in">
          <div className="w-full sm:max-w-sm bg-white dark:bg-[#16161a] rounded-t-2xl sm:rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Apply Color Accent ({count} notes)
              </h3>
              <button
                onClick={() => setShowColorSheet(false)}
                className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2.5 pt-2">
              {PALETTE_COLORS.map((c) => (
                <button
                  key={c.label}
                  onClick={() => handleBatchColor(c.value)}
                  className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-850 transition-colors"
                >
                  <div
                    className={`w-6 h-6 rounded-full ${!c.value ? 'border border-dashed border-zinc-400' : ''}`}
                    style={{ backgroundColor: c.value || 'transparent' }}
                  />
                  <span className="text-[10px] text-zinc-600 dark:text-zinc-400">{c.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add Tag Sheet */}
      {showTagSheet && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-zinc-950/50 backdrop-blur-xs animate-fade-in">
          <div className="w-full sm:max-w-sm bg-white dark:bg-[#16161a] rounded-t-2xl sm:rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Add Tag to {count} note{count > 1 ? 's' : ''}
              </h3>
              <button
                onClick={() => setShowTagSheet(false)}
                className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleBatchAddTag} className="space-y-3">
              <input
                type="text"
                placeholder="e.g. urgent, client, sprint-1"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                autoFocus
                className="w-full p-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-900 dark:text-zinc-100"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowTagSheet(false)}
                  className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs bg-zinc-950 dark:bg-zinc-50 text-white dark:text-zinc-950 font-semibold rounded-lg"
                >
                  Add Tag
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lock with PIN Sheet */}
      {showLockSheet && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-zinc-950/50 backdrop-blur-xs animate-fade-in">
          <div className="w-full sm:max-w-sm bg-white dark:bg-[#16161a] rounded-t-2xl sm:rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Lock {count} note{count > 1 ? 's' : ''} with PIN
              </h3>
              <button
                onClick={() => setShowLockSheet(false)}
                className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleBatchLock} className="space-y-3">
              <input
                type="password"
                maxLength={8}
                placeholder="Enter 4-8 digit PIN..."
                value={lockPinInput}
                onChange={(e) => setLockPinInput(e.target.value)}
                autoFocus
                className="w-full p-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs tracking-widest text-center"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowLockSheet(false)}
                  className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs bg-amber-600 text-white font-semibold rounded-lg"
                >
                  Set Lock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unlock with PIN Sheet */}
      {showUnlockSheet && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-zinc-950/50 backdrop-blur-xs animate-fade-in">
          <div className="w-full sm:max-w-sm bg-white dark:bg-[#16161a] rounded-t-2xl sm:rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Unlock {count} note{count > 1 ? 's' : ''} with PIN
              </h3>
              <button
                onClick={() => {
                  setShowUnlockSheet(false);
                  setUnlockError(null);
                }}
                className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {unlockError && (
              <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 rounded-xl text-xs">
                {unlockError}
              </div>
            )}

            <form onSubmit={handleBatchUnlock} className="space-y-3">
              <input
                type="password"
                maxLength={8}
                placeholder="Enter current PIN..."
                value={unlockPinInput}
                onChange={(e) => setUnlockPinInput(e.target.value)}
                autoFocus
                className="w-full p-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs tracking-widest text-center"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowUnlockSheet(false);
                    setUnlockError(null);
                  }}
                  className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs bg-emerald-600 text-white font-semibold rounded-lg"
                >
                  Unlock Notes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
