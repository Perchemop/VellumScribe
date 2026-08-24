import React, { useState } from 'react';
import {
  Code,
  FileCode,
  Layers,
  Sparkles,
  Copy,
  Check,
  X,
  Database,
  Mic,
  Shield,
  Cloud,
} from 'lucide-react';

interface FlutterArchitectureDrawerProps {
  onClose: () => void;
}

const FLUTTER_CODE_SNIPPETS = {
  pubspec: `# pubspec.yaml
name: omninote
description: Cross-platform Android note-taking application with AAC audio, OCR, and Gemini Sync.
version: 1.0.0+1
environment:
  sdk: '>=3.2.0 <4.0.0'

dependencies:
  flutter:
    sdk: flutter
  flutter_secure_storage: ^9.0.0 # Android Keystore integration
  sqflite: ^2.3.0               # SQLite local database
  path: ^1.8.3                  # Database path resolution
  record: ^5.1.2                # Compressed AAC audio recording
  just_audio: ^0.9.36           # Audio playback with seek & rate controls
  google_generative_ai: ^0.4.0  # Official Google Gemini API
  extension_google_sign_in_as_googleapis_auth: ^2.0.12 # Google Drive OAuth2
  googleapis: ^13.1.0           # Google Drive cloud backup API
  http: ^1.2.0`,

  databaseHelper: `// lib/data/database_helper.dart
import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';

class DatabaseHelper {
  static final DatabaseHelper instance = DatabaseHelper._init();
  static Database? _database;
  DatabaseHelper._init();

  Future<Database> get database async {
    if (_database != null) return _database!;
    _database = await _initDB('omninote_app.db');
    return _database!;
  }

  Future<Database> _initDB(String filePath) async {
    final dbPath = await getDatabasesPath();
    final path = join(dbPath, filePath);

    return await openDatabase(
      path,
      version: 1,
      onCreate: _createDB,
      onConfigure: (db) async => await db.execute('PRAGMA foreign_keys = ON'),
    );
  }

  Future _createDB(Database db, int version) async {
    await db.execute('''
      CREATE TABLE events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        event_date TEXT NOT NULL
      );
    ''');

    await db.execute('''
      CREATE TABLE notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE
      );
    ''');

    await db.execute('''
      CREATE TABLE recordings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        note_id INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        FOREIGN KEY (note_id) REFERENCES notes (id) ON DELETE CASCADE
      );
    ''');

    await db.execute('''
      CREATE TABLE transcripts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recording_id INTEGER NOT NULL,
        transcript_text TEXT NOT NULL,
        FOREIGN KEY (recording_id) REFERENCES recordings (id) ON DELETE CASCADE
      );
    ''');

    await db.execute('''
      CREATE TABLE ocr_scans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        note_id INTEGER NOT NULL,
        image_path TEXT NOT NULL,
        ocr_text TEXT NOT NULL,
        FOREIGN KEY (note_id) REFERENCES notes (id) ON DELETE CASCADE
      );
    ''');
  }
}`,

  audioService: `// lib/services/audio_recorder_service.dart
import 'package:record/record.dart';
import 'package:path_provider/path_provider.dart';
import 'package:just_audio/just_audio.dart';
import 'dart:io';

class AudioRecorderService {
  final AudioRecorder _audioRecorder = AudioRecorder();
  final AudioPlayer _audioPlayer = AudioPlayer();

  // Record AAC-LC .m4a at 64 kbps
  Future<String?> startAacRecording() async {
    if (await _audioRecorder.hasPermission()) {
      final docDir = await getApplicationDocumentsDirectory();
      final filePath = '\${docDir.path}/rec_\${DateTime.now().millisecondsSinceEpoch}.m4a';

      await _audioRecorder.start(
        const RecordConfig(
          encoder: AudioEncoder.aacLc, // AAC-LC
          bitRate: 64000,              // 64 kbps compression
          sampleRate: 44100,
        ),
        path: filePath,
      );
      return filePath;
    }
    return null;
  }

  Future<File?> stopRecording() async {
    final path = await _audioRecorder.stop();
    return path != null ? File(path) : null;
  }

  // Playback with variable rate multipliers (0.5x - 2.0x)
  Future<void> playAudio(String filePath, {double speed = 1.0}) async {
    await _audioPlayer.setFilePath(filePath);
    await _audioPlayer.setSpeed(speed);
    await _audioPlayer.play();
  }
}`,

  fdroidGuide: `# F-Droid & Google Play Store Publishing Guide

## Option A: Publishing via Capacitor (Web/TypeScript -> Android APK/AAB)
1. Install Capacitor in your project:
   npm install @capacitor/core @capacitor/cli @capacitor/android
   npx cap init VellumScribe com.vellumscribe.app
   npm run build
   npx cap add android
   npx cap sync

2. Build Signed Release APK / AAB:
   cd android
   ./gradlew assembleRelease # generates release APK (app-release-unsigned.apk)
   ./gradlew bundleRelease   # generates AAB for Google Play

3. Sign with your Keystore:
   jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 \\
     -keystore my-release-key.jks \\
     app/build/outputs/apk/release/app-release-unsigned.apk my-alias
   zipalign -v 4 app-release-unsigned.apk VellumScribe-release.apk

## Option B: Submitting to F-Droid (Free & Open Source Repository)
1. Ensure 100% FLOSS Compliance:
   - No proprietary binary blobs or closed tracking SDKs.
   - All AI API calls use standard HTTPS/REST without proprietary binary drivers.
   - Offline-first SQLite local persistence is fully open-source.

2. Create F-Droid Metadata Recipe (metadata/com.vellumscribe.app.yml):
   Categories:
     - Productivity
     - Writing
   License: MIT
   WebSite: https://ai.studio/build
   SourceCode: https://github.com/your-username/vellumscribe
   IssueTracker: https://github.com/your-username/vellumscribe/issues

   AutoUpdateMode: Version v%v
   UpdateCheckMode: Tags
   CurrentVersion: 1.0.0
   CurrentVersionCode: 1

   Builds:
     - versionName: 1.0.0
       versionCode: 1
       commit: v1.0.0
       subdir: android
       gradle:
         - yes

3. Test with fdroidserver:
   pip install fdroidserver
   fdroid checkupdates
   fdroid build com.vellumscribe.app

4. Submit Pull Request:
   Fork and create a merge request against https://gitlab.com/fdroid/fdroiddata`,

  geminiService: `// lib/services/gemini_service.dart
import 'package:google_generative_ai/google_generative_ai.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'dart:typed_data';

class GeminiService {
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  Future<GenerativeModel> _getModel() async {
    final apiKey = await _storage.read(key: 'gemini_api_key') ?? '';
    return GenerativeModel(
      model: 'gemini-2.5-flash',
      apiKey: apiKey,
    );
  }

  // Handwritten Note OCR (verbatim extraction)
  Future<String> extractHandwrittenOcr(Uint8List imageBytes) async {
    final model = await _getModel();
    final prompt = TextPart("Extract all handwritten text verbatim without markdown alterations.");
    final imagePart = DataPart('image/jpeg', imageBytes);

    final response = await model.generateContent([
      Content.multi([prompt, imagePart])
    ]);
    return response.text ?? '';
  }

  // Meeting Minutes Generation
  Future<String> generateMeetingMinutes(String transcript) async {
    final model = await _getModel();
    final prompt = "Analyse the following transcript. Generate concise bullet points for key decisions, action items, and summaries.\\n\\nTranscript:\\n$transcript";

    final response = await model.generateContent([Content.text(prompt)]);
    return response.text ?? '';
  }
}`,
};

export const FlutterArchitectureDrawer: React.FC<FlutterArchitectureDrawerProps> = ({ onClose }) => {
  const [activeSnippet, setActiveSnippet] = useState<keyof typeof FLUTTER_CODE_SNIPPETS>('pubspec');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(FLUTTER_CODE_SNIPPETS[activeSnippet]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div
        id="flutter-architecture-modal"
        className="w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
              <Code className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Principal Flutter & Dart Architecture
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Production-ready Dart implementation for SQLite, AAC Record, Keystore, and Gemini API
              </p>
            </div>
          </div>
          <button
            id="close-flutter-modal-btn"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex flex-wrap items-center gap-2 px-6 pt-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-950/20">
          {[
            { id: 'fdroidGuide', label: 'F-Droid & Play Store Guide', icon: Cloud },
            { id: 'pubspec', label: 'pubspec.yaml', icon: Layers },
            { id: 'databaseHelper', label: 'database_helper.dart (SQLite)', icon: Database },
            { id: 'audioService', label: 'audio_recorder_service.dart (AAC)', icon: Mic },
            { id: 'geminiService', label: 'gemini_service.dart (AI & OCR)', icon: Sparkles },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSnippet(tab.id as any)}
                className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeSnippet === tab.id
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Code Content */}
        <div className="p-6 overflow-y-auto flex-1 bg-slate-950 text-slate-100 font-mono text-xs flex flex-col space-y-2">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-slate-400 text-[11px]">
            <span>Dart 3.2+ Architecture Reference</span>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-semibold"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied to Clipboard' : 'Copy Code'}
            </button>
          </div>
          <pre className="flex-1 overflow-x-auto leading-relaxed text-emerald-300 p-2">
            {FLUTTER_CODE_SNIPPETS[activeSnippet]}
          </pre>
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
