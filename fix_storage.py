with open('src/lib/storage.ts', 'r') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if "return this.updateNote(id, {" in line and "encryptedPayload" in line:
        pass
    new_lines.append(line)

# Let's insert the missing block at line 490 (0-indexed 489)
missing_code = """
      const payload = {
        body: updates.body !== undefined ? updates.body : note.body,
        checklist_items: updates.checklist_items !== undefined ? updates.checklist_items : note.checklist_items,
        sketch_data: updates.sketch_data !== undefined ? updates.sketch_data : note.sketch_data,
      };

      if (sessionKey) {
        encryptedPayload = await encryptNotePayloadV2(payload, sessionKey);
      } else if (pinHeld) {
        encryptedPayload = await encryptNotePayload(payload, pinHeld);
      } else {
        throw new Error('No active unlock session and no legacy PIN provided for locked note save.');
      }

      const sanitizedUpdates = { ...updates };
      delete sanitizedUpdates.body;
      delete sanitizedUpdates.checklist_items;
      delete sanitizedUpdates.sketch_data;
"""
lines.insert(490, missing_code)

with open('src/lib/storage.ts', 'w') as f:
    f.writelines(lines)
