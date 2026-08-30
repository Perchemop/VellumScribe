with open('src/lib/storage.ts', 'r') as f:
    lines = f.readlines()

for i in range(len(lines)-1, -1, -1):
    if lines[i].strip() == '}':
        lines.insert(i, """
  public static async exportCloudBackupArchive(): Promise<Blob> {
    const backupStr = this.exportCloudBackup();
    const encoder = new TextEncoder();
    const data = encoder.encode(backupStr);
    
    // Gzip compression via browser-native CompressionStream
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    writer.write(data);
    writer.close();
    
    const res = new Response(cs.readable);
    return await res.blob();
  }
""")
        break

with open('src/lib/storage.ts', 'w') as f:
    f.writelines(lines)
