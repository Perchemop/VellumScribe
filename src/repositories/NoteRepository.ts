import { NoteRecord, ChecklistItem } from '../types';
import { getDatabaseAdapter } from '../lib/sqlite/databaseAdapter';
import { SqliteRepository, SearchOptions, SearchResult } from '../lib/sqlite/sqliteRepository';
import { AppLogger } from '../lib/logger';
import { generateUUID } from '../lib/uuid';

export interface CreateNoteInput {
  title?: string;
  body?: string;
  event_id?: number;
  tags?: string[];
  note_type?: 'text' | 'checklist' | 'sketch';
  checklist_items?: ChecklistItem[];
  color?: string;
  reminder_at?: string;
  sketch_data?: string;
  sketch_media_key?: string;
  is_pinned?: boolean;
  is_locked?: boolean;
  lock_mode?: 'standard' | 'private';
  security_type?: 'pin' | 'passphrase';
  pin_salt?: string;
  pin_hash?: string;
}

export interface UpdateNoteInput extends Partial<CreateNoteInput> {
  status?: 'active' | 'archived' | 'trash';
  archived_at?: string;
  deleted_at?: string;
}

export interface NotesPageOptions {
  limit?: number;
  offset?: number;
  cursor?: string;
  status?: 'active' | 'archived' | 'trash';
  eventId?: number;
  tag?: string;
  filterType?: 'all' | 'text' | 'checklist' | 'sketch' | 'audio' | 'scan';
  hasReminder?: boolean;
  hasAttachments?: boolean;
  searchQuery?: string;
}

export interface NotesPageResult {
  notes: NoteRecord[];
  totalCount: number;
  hasMore: boolean;
  nextOffset?: number;
}

/**
 * Asynchronous NoteRepository operating over the authoritative DatabaseAdapter.
 * Eliminates synchronous full-cache hydration assumptions.
 */
export class NoteRepository {
  public static async getById(id: number): Promise<NoteRecord | null> {
    try {
      const db = getDatabaseAdapter();
      const rows = await db.query<any>('SELECT * FROM notes WHERE id = ?;', [id]);
      if (!rows || rows.length === 0) return null;
      return SqliteRepository.getNoteById(id);
    } catch (e) {
      AppLogger.error('NoteRepository', `Failed to get note ${id}`, e);
      return SqliteRepository.getNoteById(id);
    }
  }

  public static async list(options: NotesPageOptions = {}): Promise<NotesPageResult> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 500);
    const offset = Math.max(options.offset ?? 0, 0);

    const searchOptions: SearchOptions = {
      query: options.searchQuery || '',
      status: options.status || 'active',
      eventId: options.eventId,
      tag: options.tag,
      filterType: options.filterType,
      hasReminder: options.hasReminder,
      hasAttachments: options.hasAttachments,
      limit,
      offset,
    };

    const res = SqliteRepository.searchNotesWithCount(searchOptions);
    const hasMore = offset + res.notes.length < res.totalCount;

    return {
      notes: res.notes,
      totalCount: res.totalCount,
      hasMore,
      nextOffset: hasMore ? offset + limit : undefined,
    };
  }

  public static async create(input: CreateNoteInput): Promise<NoteRecord> {
    const noteData: NoteRecord = {
      id: 0,
      title: input.title || 'Untitled',
      body: input.body || '',
      event_id: input.event_id ?? 0,
      tags: input.tags || [],
      note_type: input.note_type || 'text',
      checklist_items: input.checklist_items || [],
      color: input.color,
      reminder_at: input.reminder_at,
      sketch_data: input.sketch_data,
      sketch_media_key: input.sketch_media_key,
      is_pinned: input.is_pinned || false,
      is_locked: input.is_locked || false,
      lock_mode: input.lock_mode,
      security_type: input.security_type,
      pin_salt: input.pin_salt,
      pin_hash: input.pin_hash,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
    };

    return SqliteRepository.saveNote(noteData);
  }

  public static async update(id: number, patch: UpdateNoteInput): Promise<NoteRecord> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`Note ${id} not found`);
    }

    const updated: NoteRecord = {
      ...existing,
      ...patch,
      id,
      updated_at: new Date().toISOString(),
      version: (existing.version || 1) + 1,
    };

    return SqliteRepository.saveNote(updated);
  }

  public static async delete(id: number): Promise<void> {
    SqliteRepository.deleteNote(id);
  }

  public static async search(options: SearchOptions): Promise<SearchResult> {
    return SqliteRepository.searchNotesWithCount(options);
  }
}
