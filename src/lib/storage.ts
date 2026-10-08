export class StorageManager {
  // TEMP restore marker — full file loaded next
  static async initialize(): Promise<void> {}
  static getEvents() { return []; }
  static getNotes() { return []; }
  static getActiveNotes() { return []; }
  static getArchivedNotes() { return []; }
  static getTrashNotes() { return []; }
  static refreshCaches() {}
  static addEvent(e: any) { return { id: 1, ...e }; }
  static updateEvent() { return null; }
  static deleteEvent() { return false; }
  static addNote(n: any) { return { id: 1, ...n }; }
  static updateNote() { return null; }
  static deleteNote() {}
  static archiveNote() {}
  static unarchiveNote() {}
  static trashNote() {}
  static restoreNote() {}
  static getNoteById() { return undefined; }
  static getNotesForEvent() { return []; }
  static getItem() { return null; }
  static setItem() { return false; }
  static removeItem() {}
  static hasItem() { return false; }
  static loadDemoData() {}
}
export const SQLiteDatabase = StorageManager;
