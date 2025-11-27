import React, { useState, useRef, useEffect } from 'react';
import axios from '../../axios';

const ALLOWED_EXT = ['pdb', 'pdbqt', 'mol2', 'sdf', 'cif'];

function formatDefaultOutputFolder() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const date = `${yyyy}-${mm}-${dd}`;
  return `/home/$(user)/FrameworkVS_output/${date}`;
}

export default function ConverterForm() {
  // form state
  const [mode, setMode] = useState('single');
  const [type, setType] = useState('ligand');
  const [outputFormat, setOutputFormat] = useState('pdbqt');

  // preview + files
  const [previewContent, setPreviewContent] = useState('');
  const [previewMime, setPreviewMime] = useState('text/plain');
  const [selectedPreviewFile, setSelectedPreviewFile] = useState(null);

  const [singleFile, setSingleFile] = useState(null);
  const [singleName, setSingleName] = useState('');
  const singleFileRef = useRef(null);

  const [fileError, setFileError] = useState('');
  const [preview, setPreview] = useState(null);

  const [inputFolder, setInputFolder] = useState('');
  const [folderFiles, setFolderFiles] = useState([]);
  const folderInputRef = useRef(null);

  const [outputFolder, setOutputFolder] = useState('');
  useEffect(() => {
    if (!outputFolder) setOutputFolder(formatDefaultOutputFolder());
  }, []);

  // misc
  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState(null);
  const [logText, setLogText] = useState('');
  const [showLog, setShowLog] = useState(false);
  const [inlineMessage, setInlineMessage] = useState('');

  const HISTORY_KEY = 'fvs_converter_history_v1';
  const [history, setHistory] = useState([]);

  const DM_KEY = 'fvs_dark_mode_v1';
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(DM_KEY);
    if (saved) setDarkMode(saved === 'true');
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem(DM_KEY, darkMode ? 'true' : 'false');
  }, [darkMode]);

  useEffect(() => {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw) {
      try {
        setHistory(JSON.parse(raw));
      } catch {
        setHistory([]);
      }
    }
  }, []);

  // drag-drop
  const dropRef = useRef(null);
  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;

    const onDragOver = (e) => {
      e.preventDefault();
      el.classList.add('border-blue-500', 'bg-blue-50', 'dark:bg-slate-800/50');
    };

    const onDragLeave = (e) => {
      e.preventDefault();
      el.classList.remove('border-blue-500', 'bg-blue-50', 'dark:bg-slate-800/50');
    };

    const onDrop = (e) => {
      e.preventDefault();
      el.classList.remove('border-blue-500', 'bg-blue-50', 'dark:bg-slate-800/50');

      const f = e.dataTransfer.files[0];
      if (!f) return;

      const ext = f.name.split('.').pop().toLowerCase();
      if (!ALLOWED_EXT.includes(ext)) {
        setFileError(`Invalid file: .${ext} is not supported`);
        setPreview(null);
        setSingleFile(null);
        setSingleName('');
        return;
      }

      setFileError('');
      setSingleFile(f);
      setSingleName(f.name);

      setPreview({
        name: f.name,
        size: (f.size / 1024).toFixed(1) + ' KB',
        ext,
      });
    };

    el.addEventListener('dragover', onDragOver);
    el.addEventListener('dragleave', onDragLeave);
    el.addEventListener('drop', onDrop);

    return () => {
      el.removeEventListener('dragover', onDragOver);
      el.removeEventListener('dragleave', onDragLeave);
      el.removeEventListener('drop', onDrop);
    };
  }, []);

  // browse click
  const handleSingleSelect = (e) => {
    const f = e.target.files[0];
    if (!f) return;

    const ext = f.name.split('.').pop().toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      setFileError(`Invalid file: .${ext} is not allowed`);
      setPreview(null);
      setSingleFile(null);
      setSingleName('');
      return;
    }

    setFileError('');
    setSingleFile(f);
    setSingleName(f.name);

    setPreview({
      name: f.name,
      size: (f.size / 1024).toFixed(1) + ' KB',
      ext,
    });
  };

  // fake progress
  const startFakeProgress = () => {
    setProgress(0);
    let v = 0;
    const t = setInterval(() => {
      v += Math.random() * 8 + 4;
      if (v >= 95) clearInterval(t);
      setProgress(Math.min(95, Math.round(v)));
    }, 250);
    return t;
  };

  const saveToHistory = (entry) => {
    try {
      const cur = [entry, ...history].slice(0, 10);
      setHistory(cur);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(cur));
    } catch {}
  };

  // helper: fetch file text for preview
  const loadPreviewFromPath = async (path) => {
    if (!path) return;
    try {
      const res = await axios.get(`/analysis/file-text?path=${encodeURIComponent(path)}`);
      const txt = res.data;
      setPreviewContent(typeof txt === 'string' ? txt : JSON.stringify(txt));
      setPreviewMime('text/plain');
      setSelectedPreviewFile(path);
    } catch (e) {
      setPreviewContent('Could not load preview.');
      setPreviewMime('text/plain');
      setSelectedPreviewFile(null);
    }
  };

  // single conversion
  const convertSingle = async () => {
    if (!singleFile) {
      setInlineMessage('Please select or drop a file first.');
      return;
    }

    if (!outputFolder) {
      setInlineMessage('Output folder required.');
      return;
    }

    setInlineMessage('Starting conversion...');
    setIsConverting(true);
    const timer = startFakeProgress();
    setLogText('');

    try {
      const formData = new FormData();
      formData.append('file', singleFile);
      formData.append('type', type);
      formData.append('outputFolder', outputFolder);
      formData.append('outputFormat', outputFormat);

      const res = await axios.post('/analysis/convert', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 180000,
      });

      clearInterval(timer);
      setProgress(100);

      const out = res.data.output;
      const log = res.data.log || '';
      setResults({ converted: [out], failed: [] });
      setLogText(log);
      setShowLog(true);
      setInlineMessage(`Done: ${out}`);

      saveToHistory({
        id: Date.now(),
        input: singleName,
        output: out,
        time: new Date().toISOString(),
        type,
        outputFormat,
      });

      // load preview automatically
      await loadPreviewFromPath(out);
    } catch (err) {
      clearInterval(timer);
      setProgress(0);
      setInlineMessage('Conversion failed.');
      setResults(null);
      setLogText(JSON.stringify(err?.response?.data || err.toString(), null, 2));
      setShowLog(true);
    } finally {
      setIsConverting(false);
    }
  };

  // folder conversion
  const convertFolder = async () => {
    if (!outputFolder) {
      setInlineMessage('Output folder required.');
      return;
    }

    setInlineMessage('Starting folder conversion...');
    setIsConverting(true);
    setLogText('');
    const timer = startFakeProgress();

    try {
      const formData = new FormData();

      if (folderFiles.length > 0) {
        folderFiles.forEach((f) => formData.append('files', f));
      } else {
        if (!inputFolder) {
          clearInterval(timer);
          setIsConverting(false);
          setInlineMessage('Type input folder or upload files.');
          return;
        }
        formData.append('inputFolder', inputFolder);
      }

      formData.append('outputFolder', outputFolder);
      formData.append('outputFormat', outputFormat);
      formData.append('type', type);

      const res = await axios.post('/analysis/convert-folder', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 20 * 60 * 1000,
      });

      clearInterval(timer);
      setProgress(100);

      const converted = res.data.converted || [];
      const failed = res.data.failed || [];

      setResults({ converted, failed });
      setInlineMessage(`Converted: ${converted.length}, Failed: ${failed.length}`);
      setLogText(JSON.stringify(res.data, null, 2));
      setShowLog(true);

      if (converted.length > 0) {
        await loadPreviewFromPath(converted[0]);
      }
    } catch (err) {
      clearInterval(timer);
      setProgress(0);
      setInlineMessage('Error in folder conversion.');
      setResults(null);
      setLogText(JSON.stringify(err?.response?.data || err.toString(), null, 2));
      setShowLog(true);
    } finally {
      setIsConverting(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setResults(null);
    setProgress(0);
    setInlineMessage('');
    setPreviewContent('');
    if (mode === 'single') convertSingle();
    else convertFolder();
  };

  const downloadFileUrl = (filePath) =>
    `/analysis/file?path=${encodeURIComponent(filePath)}`;

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setInlineMessage('Copied to clipboard.');
      setTimeout(() => setInlineMessage(''), 2000);
    } catch (e) {
      setInlineMessage('Could not copy.');
    }
  };

  const handleSelectPreviewFile = (p) => {
    setSelectedPreviewFile(p);
    loadPreviewFromPath(p);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-gray-50 dark:bg-slate-900 space-y-8 max-w-4xl mx-auto p-8 rounded-2xl shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-slate-700">
        <h2 className="text-4xl font-bold text-blue-700 dark:text-blue-400 tracking-tight">Converter</h2>
        <div className="flex items-center gap-3">
          <label htmlFor="dark-mode-toggle" className="text-sm font-medium text-gray-600 dark:text-gray-300">Dark Mode</label>
          <input
            id="dark-mode-toggle"
            type="checkbox"
            checked={darkMode}
            onChange={() => setDarkMode(!darkMode)}
            className="toggle-checkbox"
          />
        </div>
      </div>

      {/* Main settings */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-4 border border-blue-200 dark:border-blue-800 rounded-lg bg-white dark:bg-slate-800 shadow-sm">
          <label className="block font-semibold mb-2 text-gray-700 dark:text-gray-300">Mode</label>
          <select value={mode} onChange={(e) => setMode(e.target.value)} className="border border-gray-300 dark:border-slate-700 rounded-lg px-4 py-2 w-full bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200">
            <option value="single">Single File</option>
            <option value="folder">Folder</option>
          </select>
        </div>

        <div className="p-4 border border-blue-200 dark:border-blue-800 rounded-lg bg-white dark:bg-slate-800 shadow-sm">
          <label className="block font-semibold mb-2 text-gray-700 dark:text-gray-300">File Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className="border border-gray-300 dark:border-slate-700 rounded-lg px-4 py-2 w-full bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200">
            <option value="ligand">Ligand</option>
            <option value="receptor">Receptor</option>
          </select>
        </div>

        <div className="p-4 border border-blue-200 dark:border-blue-800 rounded-lg bg-white dark:bg-slate-800 shadow-sm">
          <label className="block font-semibold mb-2 text-gray-700 dark:text-gray-300">Output Format</label>
          <select value={outputFormat} onChange={(e) => setOutputFormat(e.target.value)} className="border border-gray-300 dark:border-slate-700 rounded-lg px-4 py-2 w-full bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200">
            <option value="pdbqt">PDBQT</option>
            <option value="pdb">PDB</option>
            <option value="mol2">MOL2</option>
            <option value="sdf">SDF</option>
          </select>
        </div>
      </div>

      {/* File selection */}
      {mode === 'single' ? (
        <div ref={dropRef} className="p-8 border-2 border-dashed border-blue-400 dark:border-blue-600 rounded-xl bg-blue-50/50 dark:bg-slate-800/50 transition-colors duration-300 text-center cursor-pointer">
          <input type="file" ref={singleFileRef} onChange={handleSingleSelect} className="hidden" />
          <div className="text-lg text-gray-600 dark:text-gray-400 font-medium mb-4">Drop file here or click Browse.</div>
          <button type="button" onClick={() => singleFileRef.current.click()} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg shadow-md transition-colors duration-200 font-semibold">
            Browse File
          </button>
          {preview && (
            <div className="mt-6 p-4 border border-green-400 dark:border-green-600 rounded-lg bg-green-50 dark:bg-green-900/30 flex items-center justify-between shadow-inner text-left">
              <div>
                <div className="text-md font-semibold text-green-800 dark:text-green-300">Selected File:</div>
                <div className="text-sm text-gray-700 dark:text-gray-300">{preview.name} ({preview.size})</div>
              </div>
              <button type="button" onClick={() => { setSingleFile(null); setPreview(null); }} className="text-red-500 hover:text-red-700 font-semibold">Remove</button>
            </div>
          )}
          {fileError && <div className="mt-4 text-md font-semibold text-red-600 dark:text-red-400 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">Error: {fileError}</div>}
        </div>
      ) : (
        <div className="p-6 border rounded-lg bg-white dark:bg-slate-800 shadow-sm">
          <label className="block font-semibold mb-2 text-gray-700 dark:text-gray-300">Input Folder</label>
          <input
            type="text"
            value={inputFolder}
            onChange={(e) => setInputFolder(e.target.value)}
            placeholder="/path/to/folder"
            className="border border-gray-300 dark:border-slate-700 rounded-lg px-4 py-2 w-full dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
          />
          <div className="flex items-center gap-4 mt-4">

            <div className="text-md text-gray-600 dark:text-gray-400 font-medium"></div>
          </div>
          <input
            type="file"
            ref={folderInputRef}
            className="hidden"
            webkitdirectory="true"
            directory=""
            multiple
            onChange={(e) => setFolderFiles(Array.from(e.target.files))}
          />
        </div>
      )}

      {/* Output folder */}
      <div className="p-6 border rounded-lg bg-white dark:bg-slate-800 shadow-sm">
        <label className="block font-semibold mb-2 text-gray-700 dark:text-gray-300">Output Folder</label>
        <input
          type="text"
          value={outputFolder}
          onChange={(e) => setOutputFolder(e.target.value)}
          placeholder="Put absolute path here (e.g. /home/naji/output)"
          className="border border-gray-300 dark:border-slate-700 rounded-lg px-4 py-2 w-full dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
        />
      </div>

      {/* Inline message */}
      {inlineMessage && (
        <div className="p-4 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-400 rounded-lg text-md text-yellow-800 dark:text-yellow-200 shadow-sm">
          {inlineMessage}
        </div>
      )}

      {/* Progress */}
      <div className="p-4 rounded-lg bg-gray-100 dark:bg-slate-800">
        <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-4 overflow-hidden">
          <div
            className="h-4 bg-gradient-to-r from-blue-500 to-green-500 rounded-full"
            style={{ width: `${progress}%`, transition: 'width 0.3s ease-in-out' }}
          />
        </div>
        <div className="text-md mt-2 font-medium text-gray-600 dark:text-gray-400 text-center">{isConverting ? `Converting... ${progress}%` : 'Idle'}</div>
      </div>

      {/* Buttons */}
      <div className="flex gap-4 pt-4 border-t border-gray-200 dark:border-slate-700">
        <button
          type="submit"
          disabled={isConverting}
          className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg shadow-lg disabled:opacity-50 transition-all duration-200 transform hover:scale-105 font-semibold"
        >
          {isConverting ? 'Converting...' : 'Start Conversion'}
        </button>
        <button
          type="button"
          onClick={() => {
            setSingleFile(null);
            setSingleName('');
            setFolderFiles([]);
            setPreview(null);
            setFileError('');
            setResults(null);
            setInlineMessage('');
            setLogText('');
            setProgress(0);
            setPreviewContent('');
            setSelectedPreviewFile(null);
          }}
          className="bg-gray-200 hover:bg-gray-300 dark:bg-slate-700 dark:hover:bg-slate-600 px-8 py-3 rounded-lg transition-colors duration-200 font-semibold"
        >
          Reset
        </button>
   
      </div>

      {/* RESULTS + modern preview */}
      {results && (
        <div className="mt-8 space-y-6">
          <h3 className="font-bold text-2xl text-blue-700 dark:text-blue-400">Results</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-5 border rounded-lg bg-white dark:bg-slate-800 shadow-md">
              <div className="flex items-center justify-between mb-4">
                <div className="text-lg font-semibold text-green-700 dark:text-green-400">Converted Files</div>
                <div className="text-lg font-bold text-green-700 dark:text-green-400">{results.converted?.length || 0}</div>
              </div>
              <ul className="space-y-3 text-md">
                {results.converted?.map((p) => (
                  <li key={p} className="flex items-center justify-between gap-4 p-3 bg-gray-50 dark:bg-slate-700/50 rounded-md">
                    <div className="truncate font-mono text-sm">{p}</div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => handleSelectPreviewFile(p)} className="text-xs px-3 py-1 rounded-md bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/50 dark:hover:bg-blue-900/80 text-blue-800 dark:text-blue-200 font-medium">Preview</button>
                      <a href={downloadFileUrl(p)} download={p.split('/').pop()} className="text-xs px-3 py-1 rounded-md bg-green-100 hover:bg-green-200 dark:bg-green-900/50 dark:hover:bg-green-900/80 text-green-800 dark:text-green-200 font-medium">Download</a>
                      <button type="button" onClick={() => copyToClipboard(p)} className="text-xs px-3 py-1 rounded-md bg-gray-200 hover:bg-gray-300 dark:bg-slate-600 dark:hover:bg-slate-500 font-medium">Copy Path</button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-5 border rounded-lg bg-white dark:bg-slate-800 shadow-md">
              <div className="flex items-center justify-between mb-4">
                <div className="text-lg font-semibold text-red-700 dark:text-red-400">Failures</div>
                <div className="text-lg font-bold text-red-700 dark:text-red-400">{results.failed?.length || 0}</div>
              </div>
              <ul className="space-y-3 text-md text-red-600 dark:text-red-400">
                {results.failed?.length > 0 ? (
                  results.failed.map((f, i) => (
                    <li key={i} className="font-mono text-sm p-2 bg-red-50 dark:bg-red-900/20 rounded-md">{f.file}: {f.error}</li>
                  ))
                ) : (
                  <li className="text-md text-gray-500 dark:text-gray-400">No failures.</li>
                )}
              </ul>
            </div>
          </div>

          <div className="mt-8 p-6 border-2 border-blue-500 dark:border-blue-700 rounded-xl bg-gradient-to-br from-blue-50 to-green-50 dark:from-slate-800 dark:to-slate-900 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <div className="text-4xl">✨</div>
                <div>
                  <div className="font-bold text-2xl text-blue-800 dark:text-blue-300">Result Preview</div>
                  <div className="text-md text-gray-600 dark:text-gray-400">Click a file above to preview its content</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => { const el = document.getElementById('fvs-preview-box'); if (el) el.classList.toggle('whitespace-pre-wrap'); }} className="px-4 py-2 text-md rounded-lg bg-gray-200 hover:bg-gray-300 dark:bg-slate-700 dark:hover:bg-slate-600 font-medium">Toggle Wrap</button>
                <button type="button" onClick={() => { if (selectedPreviewFile) window.open(downloadFileUrl(selectedPreviewFile), '_blank'); }} disabled={!selectedPreviewFile} className="px-4 py-2 text-md rounded-lg bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/50 dark:hover:bg-blue-900/80 text-blue-800 dark:text-blue-200 disabled:opacity-50 font-medium">Open File</button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border text-md shadow-inner">
                <div className="font-semibold text-gray-600 dark:text-gray-300">File</div>
                <div className="truncate text-md mt-1 font-mono">{selectedPreviewFile || '—'}</div>
              </div>
              <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border text-md shadow-inner">
                <div className="font-semibold text-gray-600 dark:text-gray-300">Format</div>
                <div className="text-md mt-1 font-mono">{selectedPreviewFile ? selectedPreviewFile.split('.').pop() : '—'}</div>
              </div>
              <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border text-md shadow-inner">
                <div className="font-semibold text-gray-600 dark:text-gray-300">Lines</div>
                <div className="text-md mt-1 font-mono">{previewContent ? previewContent.split('\n').length : '—'}</div>
              </div>
              <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border text-md shadow-inner">
                <div className="font-semibold text-gray-600 dark:text-gray-300">Actions</div>
                <div className="flex gap-2 mt-1">
                  <button type="button" onClick={() => copyToClipboard(selectedPreviewFile || '')} className="text-xs px-3 py-1 rounded-md bg-gray-200 hover:bg-gray-300 dark:bg-slate-600 dark:hover:bg-slate-500 font-medium">Copy Path</button>
                  <button type="button" onClick={() => setPreviewContent('')} className="text-xs px-3 py-1 rounded-md bg-red-100 hover:bg-red-200 dark:bg-red-900/50 dark:hover:bg-red-900/80 text-red-800 dark:text-red-200 font-medium">Clear</button>
                </div>
              </div>
            </div>
            <div id="fvs-preview-box" className="p-4 bg-gray-100 dark:bg-slate-800 rounded-lg border border-gray-300 dark:border-slate-700 text-sm font-mono max-h-96 overflow-auto whitespace-pre-wrap">
              {previewContent || (<div className="text-gray-500 dark:text-gray-400">No preview loaded. Convert a file and click Preview.</div>)}
            </div>
          </div>
        </div>
      )}

      {/* Logs */}
      <div className="pt-6 border-t border-gray-200 dark:border-slate-700">
        <button type="button" onClick={() => setShowLog(!showLog)} className="underline text-md font-medium text-gray-600 dark:text-gray-400">
          {showLog ? 'Hide Logs' : 'Show Logs'}
        </button>
        {showLog && (
          <pre className="mt-4 p-4 bg-black/5 dark:bg-white/5 rounded-lg text-xs max-h-80 overflow-auto whitespace-pre-wrap font-mono">{logText || 'No logs.'}</pre>
        )}
      </div>

      {/* History */}
      <div className="pt-6 border-t border-gray-200 dark:border-slate-700">
        <h3 className="font-bold text-2xl text-blue-700 dark:text-blue-400 mb-4">History</h3>
        {history.length === 0 ? (
          <div className="text-md text-gray-500 dark:text-gray-400">No history yet.</div>
        ) : (
          history.map((h) => (
            <div key={h.id} className="p-4 border rounded-lg mt-3 bg-white dark:bg-slate-800 shadow-sm hover:shadow-md transition-shadow duration-200">
              <div className="text-lg font-medium truncate text-gray-800 dark:text-gray-200">{h.input} → {h.output}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{new Date(h.time).toLocaleString()}</div>
            </div>
          ))
        )}
      </div>
    </form>
  );
}
