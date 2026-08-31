import re

with open('src/lib/storage.ts', 'r') as f:
    content = f.read()

replacement = """  public static deleteEvent(id: number): boolean {
    const events = this.getEvents();
    const eventIndex = events.findIndex(e => e.id === id);
    if (eventIndex === -1) return false;

    // Preserve notes by moving them to "General"
    const notes = this.getNotesByEvent(id);
    if (notes.length > 0) {
      let generalEvent = events.find(e => e.title.toLowerCase() === 'general');
      if (!generalEvent) {
        const newEvent = this.addEvent({
          title: 'General',
          event_date: new Date().toISOString().slice(0, 10),
          category: 'other',
          color: '#6b7280',
        });
        generalEvent = newEvent;
      }
      if (generalEvent) {
        for (const note of notes) {
          this.updateNote(note.id, { event_id: generalEvent.id });
        }
      }
    }

    events.splice(eventIndex, 1);
    this.saveEvents(events);
    return true;
  }"""

content = re.sub(
    r"  public static deleteEvent\(id: number\): boolean \{[\s\S]*?this\.saveEvents\(events\);\s*return true;\s*\}",
    replacement,
    content
)

with open('src/lib/storage.ts', 'w') as f:
    f.write(content)
