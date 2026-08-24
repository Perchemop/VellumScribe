import React, { useState } from 'react';
import {
  Database,
  Table,
  Terminal,
  Download,
  Upload,
  RotateCcw,
  X,
  Play,
  Check,
  FileCode,
  Layers,
  Search,
} from 'lucide-react';
import { SQLiteDatabase } from '../lib/storage';

interface SqliteInspectorModalProps {
  onClose: () => void;
  onDatabaseChanged: () => void;
}

const PRESET_QUERIES = [
  {
    name: 'All Notes with Event Titles (JOIN)',
    sql: 'SELECT * FROM notes JOIN events ON notes.event_id = events.id',
  },
  {
    name: 'Browse Audio Recordings Table',
    sql: 'SELECT * FROM recordings',
  },
  {
    name: 'Browse Transcripts Table',
    sql: 'SELECT * FROM transcripts',
  },
  {
    name: 'Browse Handwritten OCR Scans',
    sql: 'SELECT * FROM ocr_scans',
  },
  {
    name: 'Inspect Database Schema (sqlite_master)',
    sql: 'SELECT * FROM sqlite_master',
  },
];

export const SqliteInspectorModal: React.FC<SqliteInspectorModalProps> = ({
  onClose,
  onDatabaseChanged,
}) => {
  const [selectedTable, setSelectedTable] = useState<'events' | 'notes' | 'recordings' | 'transcripts' | 'ocr_scans'>('notes');
  const [sqlInput, setSqlInput] = useState('SELECT * FROM notes');
  const [queryResult, setQueryResult] = useState<{
    columns: string[];
    rows: any[][];
    message?: string;
  }>(() => SQLiteDatabase.executeSql('SELECT * FROM notes'));

  const [importStatus, setImportStatus] = useState<string | null>(null);

  const tables = [
    { name: 'events', count: SQLiteDatabase.getEvents().length },
    { name: 'notes', count: SQLiteDatabase.getNotes().length },
    { name: 'recordings', count: SQLiteDatabase.getRecordings().length },
    { name: 'transcripts', count: SQLiteDatabase.getTranscripts().length },
    { name: 'ocr_scans', count: SQLiteDatabase.getOcrScans().length },
  ];

  const handleSelectTable = (tbl: any) => {
    setSelectedTable(tbl);
    const sql = `SELECT * FROM ${tbl}`;
    setSqlInput(sql);
    setQueryResult(SQLiteDatabase.executeSql(sql));
  };

  const handleRunSql = () => {
    const res = SQLiteDatabase.executeSql(sqlInput);
    setQueryResult(res);
  };

  const handleExportDump = () => {
    const dump = SQLiteDatabase.exportFullDump();
    const blob = new Blob([dump], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `omninote_sqlite_dump_${Date.now()}.json`;
    a.click();
  };

  const handleImportDump = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        const ok = SQLiteDatabase.importFullDump(text);
        if (ok) {
          setImportStatus('SQLite database restored successfully!');
          onDatabaseChanged();
          handleSelectTable(selectedTable);
        } else {
          setImportStatus('Failed to parse SQLite dump file.');
        }
        setTimeout(() => setImportStatus(null), 3000);
      };
      reader.readAsText(file);
    }
  };

  const handleResetFactory = () => {
    if (window.confirm('Reset SQLite database to factory sample data?')) {
      SQLiteDatabase.resetToFactoryDefaults();
      onDatabaseChanged();
      handleSelectTable(selectedTable);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div
        id="sqlite-inspector-modal"
        className="w-full max-w-5xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                SQLite Relational Database & SQL Console
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Direct table inspection for events, notes, recordings, transcripts, and OCR scans
              </p>
            </div>
          </div>
          <button
            id="close-sqlite-modal-btn"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12">
          {/* Table Selector & Presets */}
          <div className="md:col-span-4 border-r border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/30 p-4 space-y-4 overflow-y-auto">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Primary Schema Tables (5)
              </h3>
              <div className="space-y-1.5">
                {tables.map((t) => (
                  <button
                    key={t.name}
                    id={`select-table-${t.name}`}
                    onClick={() => handleSelectTable(t.name)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-medium transition-all ${
                      selectedTable === t.name
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                    }`}
                  >
                    <span className="flex items-center gap-2 font-mono">
                      <Table className="w-3.5 h-3.5" />
                      {t.name}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        selectedTable === t.name
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                      }`}
                    >
                      {t.count} rows
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Presets */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Preset SQL Queries
              </h3>
              <div className="space-y-1.5">
                {PRESET_QUERIES.map((pq, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setSqlInput(pq.sql);
                      setQueryResult(SQLiteDatabase.executeSql(pq.sql));
                    }}
                    className="w-full text-left p-2 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-400 text-slate-700 dark:text-slate-300 transition-colors"
                  >
                    <div className="font-semibold text-slate-900 dark:text-slate-100">{pq.name}</div>
                    <div className="font-mono text-[10px] text-slate-400 truncate mt-0.5">{pq.sql}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Backup & Factory Reset Actions */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <button
                id="export-sqlite-dump-btn"
                onClick={handleExportDump}
                className="w-full flex items-center justify-center gap-1.5 p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                <Download className="w-3.5 h-3.5" />
                Export SQLite JSON Backup
              </button>

              <label className="w-full flex items-center justify-center gap-1.5 p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                Restore SQLite Dump
                <input type="file" accept=".json,.sqlite,.db" onChange={handleImportDump} className="hidden" />
              </label>

              <button
                onClick={handleResetFactory}
                className="w-full flex items-center justify-center gap-1.5 p-1.5 text-slate-400 hover:text-rose-600 text-xs font-medium"
              >
                <RotateCcw className="w-3 h-3" />
                Reset Sample Data
              </button>
            </div>
          </div>

          {/* Right SQL Editor & Table Grid */}
          <div className="md:col-span-8 p-6 flex flex-col overflow-y-auto space-y-4">
            {importStatus && (
              <div className="p-3 bg-emerald-50 text-emerald-800 text-xs font-semibold rounded-lg">
                {importStatus}
              </div>
            )}

            {/* SQL Query Box */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-indigo-500" />
                  SQL Command Input
                </span>
                <button
                  id="run-sql-btn"
                  onClick={handleRunSql}
                  className="flex items-center gap-1 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-xs font-semibold"
                >
                  <Play className="w-3 h-3 fill-current" />
                  Execute SQL
                </button>
              </div>
              <textarea
                value={sqlInput}
                onChange={(e) => setSqlInput(e.target.value)}
                rows={2}
                className="w-full p-2.5 bg-slate-950 text-emerald-400 font-mono text-xs rounded-xl border border-slate-800 focus:outline-hidden"
              />
            </div>

            {/* Table Grid Results */}
            <div className="flex-1 flex flex-col space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{queryResult.message || `${queryResult.rows.length} records`}</span>
                <span className="font-mono text-[10px]">WAL Mode • Foreign Keys Active</span>
              </div>

              <div className="flex-1 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto max-h-80 bg-white dark:bg-slate-900">
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                      {queryResult.columns.map((col, i) => (
                        <th key={i} className="p-2.5 font-bold whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {queryResult.rows.map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 text-slate-800 dark:text-slate-200"
                      >
                        {row.map((cell, cIdx) => (
                          <td key={cIdx} className="p-2.5 whitespace-pre-wrap max-w-xs truncate">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 text-xs text-slate-500">
          <span>Relational Engine: SQLite 3.42 (WASM / In-Memory Driver)</span>
          <button onClick={onClose} className="px-4 py-1.5 bg-slate-900 text-white rounded-lg font-semibold">
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
