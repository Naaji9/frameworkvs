import React, { useState, useRef, useEffect } from 'react';
import axios from '../../axios';

const ALLOWED_EXT = ['pdb', 'pdbqt', 'mol2', 'sdf', 'cif'];

export default function ConverterForm() {
  // form state
  const [mode, setMode] = useState('single');
  const [type, setType] = useState('ligand');
  const [outputFormat, setOutputFormat] = useState('pdbqt');

  // Scientific options - Ligand
  const [addHydrogens, setAddHydrogens] = useState(true);
  const [hydrogenType, setHydrogenType] = useState('polar');
  const [mergeNonPolar, setMergeNonPolar] = useState(true);
  const [detectAromatic, setDetectAromatic] = useState(true);
  const [assignCharges, setAssignCharges] = useState(true);
  const [chargeMethod, setChargeMethod] = useState('gasteiger');
  const [mergeLonePairs, setMergeLonePairs] = useState(true);
  const [computeTorsdof, setComputeTorsdof] = useState(true);

  // Scientific options - Receptor
  const [removeWaters, setRemoveWaters] = useState(true);
  const [removeNonProtein, setRemoveNonProtein] = useState(true);
  const [phValue, setPhValue] = useState('');

  // Advanced options toggle
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Single file state
  const [singleFile, setSingleFile] = useState(null);
  const [singleName, setSingleName] = useState('');
  const singleFileRef = useRef(null);
  const [fileError, setFileError] = useState('');
  const [preview, setPreview] = useState(null);

  // Folder conversion state
  const [inputFolder, setInputFolder] = useState('');
  const [outputFolder, setOutputFolder] = useState('');
  const [scriptGenerated, setScriptGenerated] = useState(false);
  const [scriptInstructions, setScriptInstructions] = useState('');

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

  // Single conversion with auto-download
// Single conversion with auto-download
const convertSingle = async () => {
  if (!singleFile) {
    setInlineMessage('Please select or drop a file first.');
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
    formData.append('outputFormat', outputFormat);

    // Add scientific options
    formData.append('addHydrogens', addHydrogens);
    formData.append('hydrogenType', hydrogenType);
    formData.append('mergeNonPolar', mergeNonPolar);
    formData.append('detectAromatic', detectAromatic);
    formData.append('assignCharges', assignCharges);
    formData.append('chargeMethod', chargeMethod);
    formData.append('mergeLonePairs', mergeLonePairs);
    formData.append('computeTorsdof', computeTorsdof);
    formData.append('removeWaters', removeWaters);
    formData.append('removeNonProtein', removeNonProtein);
    
    // Only send pH if advanced settings are shown
    if (showAdvanced) {
      formData.append('phValue', phValue);
    }

    const res = await axios.post('/analysis/convert-single', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      responseType: 'blob',
      timeout: 180000,
    });


      clearInterval(timer);
      setProgress(100);

      // Auto-download the file
      const fileName = `${singleName.split('.')[0]}.${outputFormat}`;
      const blob = new Blob([res.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      setInlineMessage(`✅ Conversion complete! File downloaded as ${fileName}`);
      setResults({ converted: [fileName], failed: [], downloadedFile: fileName });

      saveToHistory({
        id: Date.now(),
        input: singleName,
        output: fileName,
        time: new Date().toISOString(),
        type,
        outputFormat,
      });
    } catch (err) {
      clearInterval(timer);
      setProgress(0);
      setInlineMessage('❌ Conversion failed.');
      setResults(null);
      setLogText(JSON.stringify(err?.response?.data || err.toString(), null, 2));
      setShowLog(true);
    } finally {
      setIsConverting(false);
    }
  };

  // Generate script for folder conversion
// Generate script for folder conversion
const generateScript = async () => {
  if (!inputFolder || !outputFolder) {
    setInlineMessage('Please provide both input and output folder paths.');
    return;
  }

  setInlineMessage('Generating conversion script...');
  setIsConverting(true);

  try {
    const params = {
      inputFolder,
      outputFolder,
      type,
      outputFormat,
      addHydrogens,
      hydrogenType,
      mergeNonPolar,
      detectAromatic,
      assignCharges,
      chargeMethod,
      mergeLonePairs,
      computeTorsdof,
      removeWaters,
      removeNonProtein
    };
    
    // Only add pH if advanced settings are shown
    if (showAdvanced) {
      params.phValue = phValue;
    }

    const queryString = new URLSearchParams(params).toString();
    const res = await axios.get(`/analysis/generate-script?${queryString}`, {
      responseType: 'blob',
    });


      // Auto-download script
      const blob = new Blob([res.data], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const scriptName = `vsconverter_${type}.py`;  
      a.download = scriptName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      setScriptGenerated(true);
      setInlineMessage(`✅ Script generated and downloaded: ${scriptName}`);
      
      // Set instructions
  // Set instructions
const instructions = `
📋 Instructions to use the Python script:

1. The script has been downloaded as: ${scriptName}
2. Run it directly with Python:
   python ${scriptName}
   or
   python3 ${scriptName}

⚠️ Requirements:
- Python 3.6 or higher
- AutoDockTools installed (pip install autodocktools)
- OpenBabel installed (conda install -c conda-forge openbabel)

✨ What the script does:
- Automatically checks if required tools are installed
- Processes all molecular files in: ${inputFolder}
- Converts to format: ${outputFormat}
- Type: ${type}
- Scientific options applied: ${addHydrogens ? 'Add hydrogens' : ''} ${assignCharges ? ', Assign charges' : ''}
- Shows progress with colored output
- Provides detailed summary at the end

💡 The script is cross-platform and works on Windows, Linux, and macOS!
      `.trim();
      
      setScriptInstructions(instructions);
      setResults({ scriptGenerated: true });
      
    } catch (err) {
      setInlineMessage('❌ Failed to generate script.');
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
    setScriptGenerated(false);
    setScriptInstructions('');
    
    if (mode === 'single') {
      convertSingle();
    } else {
      generateScript();
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setInlineMessage('✅ Copied to clipboard.');
      setTimeout(() => setInlineMessage(''), 2000);
    } catch (e) {
      setInlineMessage('❌ Could not copy.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-5xl mx-auto p-8 bg-gradient-to-br from-gray-50 to-blue-50 dark:from-slate-900 dark:to-slate-800 rounded-2xl shadow-2xl space-y-8 border border-blue-200 dark:border-slate-700">
      {/* Header */}
      <div className="flex items-center justify-between pb-6 border-b-2 border-blue-300 dark:border-slate-700">
        <div>
          <h2 className="text-2xl font-bold text-blue-700 dark:text-blue-400 tracking-tight">Molecular Converter</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">AutoDock tools & OpenBabel Integration</p>
        </div>
        <div className="flex items-center gap-3">
          
          <input
            id="dark-mode-toggle"
            type="checkbox"
            checked={darkMode}
            onChange={() => setDarkMode(!darkMode)}
            className="w-5 h-5 cursor-pointer"
          />
        </div>
      </div>

      {/* Main settings */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-5 border-2 border-blue-300 dark:border-blue-800 rounded-xl bg-white dark:bg-slate-800 shadow-lg hover:shadow-xl transition-shadow">
          <label className="block font-bold mb-3 text-gray-800 dark:text-gray-200 text-lg">🗁 Mode</label>
          <select 
            value={mode} 
            onChange={(e) => setMode(e.target.value)} 
            className="border-2 border-gray-300 dark:border-slate-600 rounded-lg px-4 py-3 w-full bg-white dark:bg-slate-700 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 font-medium"
          >
            <option value="single">Single File</option>
            <option value="folder">Folder (Generate Script)</option>
          </select>
        </div>

        <div className="p-5 border-2 border-blue-300 dark:border-blue-800 rounded-xl bg-white dark:bg-slate-800 shadow-lg hover:shadow-xl transition-shadow">
          <label className="block font-bold mb-3 text-gray-800 dark:text-gray-200 text-lg"> File Type</label>
          <select 
            value={type} 
            onChange={(e) => setType(e.target.value)} 
            className="border-2 border-gray-300 dark:border-slate-600 rounded-lg px-4 py-3 w-full bg-white dark:bg-slate-700 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 font-medium"
          >
            <option value="ligand">Ligand</option>
            <option value="receptor">Receptor</option>
          </select>
        </div>

        <div className="p-5 border-2 border-blue-300 dark:border-blue-800 rounded-xl bg-white dark:bg-slate-800 shadow-lg hover:shadow-xl transition-shadow">
          <label className="block font-bold mb-3 text-gray-800 dark:text-gray-200 text-lg"> Output Format</label>
          <select 
            value={outputFormat} 
            onChange={(e) => setOutputFormat(e.target.value)} 
            className="border-2 border-gray-300 dark:border-slate-600 rounded-lg px-4 py-3 w-full bg-white dark:bg-slate-700 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 font-medium"
          >
            <option value="pdbqt">PDBQT</option>
            <option value="pdb">PDB</option>
            <option value="mol2">MOL2</option>
            <option value="sdf">SDF</option>
          </select>
        </div>
      </div>

      {/* Scientific Options Section */}
      <div className="p-6 border-2 border-purple-300 dark:border-purple-700 rounded-xl bg-gradient-to-r from-purple-50 to-pink-50 dark:from-slate-800 dark:to-slate-700 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-purple-700 dark:text-purple-400"> Advance Options</h3>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="px-4 py-2 text-sm rounded-lg bg-purple-200 hover:bg-purple-300 dark:bg-purple-900/50 dark:hover:bg-purple-900/80 text-purple-800 dark:text-purple-200 font-semibold transition-colors"
          >
            {showAdvanced ? '▲ Hide Advanced' : '▼ Show Advanced'}
          </button>
        </div>

        {type === 'ligand' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 md:grid-cols-2 gap-4">
              <label className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-purple-200 dark:border-purple-800 cursor-pointer hover:bg-purple-50 dark:hover:bg-slate-700 transition-colors">
                <input
                  type="checkbox"
                  checked={addHydrogens}
                  onChange={(e) => setAddHydrogens(e.target.checked)}
                  className="w-5 h-5 cursor-pointer"
                />
                <span className="font-semibold text-gray-700 dark:text-gray-300">Add Hydrogens</span>
              </label>

              <label className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-purple-200 dark:border-purple-800 cursor-pointer hover:bg-purple-50 dark:hover:bg-slate-700 transition-colors">
                <input
                  type="checkbox"
                  checked={mergeNonPolar}
                  onChange={(e) => setMergeNonPolar(e.target.checked)}
                  className="w-5 h-5 cursor-pointer"
                />
                <span className="font-semibold text-gray-700 dark:text-gray-300">Merge Non-Polar Hydrogens</span>
              </label>

              <label className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-purple-200 dark:border-purple-800 cursor-pointer hover:bg-purple-50 dark:hover:bg-slate-700 transition-colors">
                <input
                  type="checkbox"
                  checked={detectAromatic}
                  onChange={(e) => setDetectAromatic(e.target.checked)}
                  className="w-5 h-5 cursor-pointer"
                />
                <span className="font-semibold text-gray-700 dark:text-gray-300">Detect Aromatic Carbons</span>
              </label>

              <label className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-purple-200 dark:border-purple-800 cursor-pointer hover:bg-purple-50 dark:hover:bg-slate-700 transition-colors">
                <input
                  type="checkbox"
                  checked={assignCharges}
                  onChange={(e) => setAssignCharges(e.target.checked)}
                  className="w-5 h-5 cursor-pointer"
                />
                <span className="font-semibold text-gray-700 dark:text-gray-300">Assign Gasteiger Charges</span>
              </label>

              <label className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-purple-200 dark:border-purple-800 cursor-pointer hover:bg-purple-50 dark:hover:bg-slate-700 transition-colors">
                <input
                  type="checkbox"
                  checked={mergeLonePairs}
                  onChange={(e) => setMergeLonePairs(e.target.checked)}
                  className="w-5 h-5 cursor-pointer"
                />
                <span className="font-semibold text-gray-700 dark:text-gray-300">Merge Lone Pairs</span>
              </label>

              <label className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-purple-200 dark:border-purple-800 cursor-pointer hover:bg-purple-50 dark:hover:bg-slate-700 transition-colors">
                <input
                  type="checkbox"
                  checked={computeTorsdof}
                  onChange={(e) => setComputeTorsdof(e.target.checked)}
                  className="w-5 h-5 cursor-pointer"
                />
                <span className="font-semibold text-gray-700 dark:text-gray-300">Compute Torsional DOF</span>
              </label>
            </div>

{showAdvanced && (
  <div className="mt-4 p-4 bg-white dark:bg-slate-800 rounded-lg border-2 border-purple-300 dark:border-purple-700">
    <h4 className="font-bold text-lg mb-3 text-purple-700 dark:text-purple-400">Advanced Settings</h4>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {type === 'ligand' ? (
        <>
          <div>
            <label className="block font-semibold mb-2 text-gray-700 dark:text-gray-300">Hydrogen Type</label>
            <select
              value={hydrogenType}
              onChange={(e) => setHydrogenType(e.target.value)}
              className="border-2 border-gray-300 dark:border-slate-600 rounded-lg px-4 py-2 w-full bg-white dark:bg-slate-700 text-gray-800 dark:text-gray-200"
            >
              <option value="polar">Polar Only</option>
              <option value="all">All Hydrogens</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold mb-2 text-gray-700 dark:text-gray-300">Charge Method</label>
            <select
              value={chargeMethod}
              onChange={(e) => setChargeMethod(e.target.value)}
              className="border-2 border-gray-300 dark:border-slate-600 rounded-lg px-4 py-2 w-full bg-white dark:bg-slate-700 text-gray-800 dark:text-gray-200"
            >
              <option value="gasteiger">Gasteiger</option>
              <option value="mmff94">MMFF94</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold mb-2 text-gray-700 dark:text-gray-300">
              pH Value
              <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">(Optional - for protonation state)</span>
            </label>
            <input
              type="number"
              step="0.1"
              value={phValue}
              onChange={(e) => setPhValue(e.target.value)}
              placeholder="e.g., 7.4"
              className="border-2 border-gray-300 dark:border-slate-600 rounded-lg px-4 py-2 w-full bg-white dark:bg-slate-700 text-gray-800 dark:text-gray-200"
            />
          </div>
        </>
      ) : (
        <div>
          <label className="block font-semibold mb-2 text-gray-700 dark:text-gray-300">
            pH Value
            <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">(Optional)</span>
          </label>
          <input
            type="number"
            step="0.1"
            value={phValue}
            onChange={(e) => setPhValue(e.target.value)}
            placeholder="e.g., 7.4"
            className="border-2 border-gray-300 dark:border-slate-600 rounded-lg px-4 py-2 w-full bg-white dark:bg-slate-700 text-gray-800 dark:text-gray-200"
          />
        </div>
      )}
    </div>
  </div>
)}
          </div>
        ) : (
          // Receptor options
          <div className="space-y-4">
            <div className="grid grid-cols-3 md:grid-cols-2 gap-4">
              <label className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-purple-200 dark:border-purple-800 cursor-pointer hover:bg-purple-50 dark:hover:bg-slate-700 transition-colors">
                <input
                  type="checkbox"
                  checked={addHydrogens}
                  onChange={(e) => setAddHydrogens(e.target.checked)}
                  className="w-5 h-5 cursor-pointer"
                />
                <span className="font-semibold text-gray-700 dark:text-gray-300">Add Polar Hydrogens</span>
              </label>

              <label className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-purple-200 dark:border-purple-800 cursor-pointer hover:bg-purple-50 dark:hover:bg-slate-700 transition-colors">
                <input
                  type="checkbox"
                  checked={removeWaters}
                  onChange={(e) => setRemoveWaters(e.target.checked)}
                  className="w-5 h-5 cursor-pointer"
                />
                <span className="font-semibold text-gray-700 dark:text-gray-300">Remove Water Molecules</span>
              </label>

              <label className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-purple-200 dark:border-purple-800 cursor-pointer hover:bg-purple-50 dark:hover:bg-slate-700 transition-colors">
                <input
                  type="checkbox"
                  checked={removeNonProtein}
                  onChange={(e) => setRemoveNonProtein(e.target.checked)}
                  className="w-5 h-5 cursor-pointer"
                />
                <span className="font-semibold text-gray-700 dark:text-gray-300">Remove Non-Protein Residues</span>
              </label>

              <label className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-purple-200 dark:border-purple-800 cursor-pointer hover:bg-purple-50 dark:hover:bg-slate-700 transition-colors">
                <input
                  type="checkbox"
                  checked={mergeNonPolar}
                  onChange={(e) => setMergeNonPolar(e.target.checked)}
                  className="w-5 h-5 cursor-pointer"
                />
                <span className="font-semibold text-gray-700 dark:text-gray-300">Merge Non-Polar Hydrogens</span>
              </label>

              <label className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-purple-200 dark:border-purple-800 cursor-pointer hover:bg-purple-50 dark:hover:bg-slate-700 transition-colors">
                <input
                  type="checkbox"
                  checked={mergeLonePairs}
                  onChange={(e) => setMergeLonePairs(e.target.checked)}
                  className="w-5 h-5 cursor-pointer"
                />
                <span className="font-semibold text-gray-700 dark:text-gray-300">Merge Lone Pairs</span>
              </label>
            </div>

            {showAdvanced && (
              <div className="mt-4 p-4 bg-white dark:bg-slate-800 rounded-lg border-2 border-purple-300 dark:border-purple-700">
                <h4 className="font-bold text-lg mb-3 text-purple-700 dark:text-purple-400">Advanced Settings</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold mb-2 text-gray-700 dark:text-gray-300">pH Value</label>
                    <input
                      type="number"
                      step="0.1"
                      value={phValue}
                      onChange={(e) => setPhValue(e.target.value)}
                      className="border-2 border-gray-300 dark:border-slate-600 rounded-lg px-4 py-2 w-full bg-white dark:bg-slate-700 text-gray-800 dark:text-gray-200"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* File selection - Single Mode */}
      {mode === 'single' ? (
        <div ref={dropRef} className="p-8 border-2 border-dashed border-blue-400 dark:border-blue-600 rounded-xl bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-slate-800 dark:to-slate-700 transition-colors duration-300 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-100 dark:hover:bg-slate-700">
          <input type="file" ref={singleFileRef} onChange={handleSingleSelect} className="hidden" />
          <div className="text-6xl mb-4">📄</div>
          <div className="text-xl text-gray-700 dark:text-gray-300 font-semibold mb-4">Drop file here or click Browse</div>
          <button 
            type="button" 
            onClick={() => singleFileRef.current.click()} 
            className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white px-8 py-3 rounded-lg shadow-lg transition-all duration-200 font-bold text-lg"
          >
             Browse File
          </button>
          {preview && (
            <div className="mt-6 p-5 border-2 border-green-400 dark:border-green-600 rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 flex items-center justify-between shadow-lg">
              <div>
                <div className="text-lg font-bold text-green-800 dark:text-green-300">✅ Selected File:</div>
                <div className="text-md text-gray-700 dark:text-gray-300 font-mono">{preview.name} ({preview.size})</div>
              </div>
              <button 
                type="button" 
                onClick={() => { setSingleFile(null); setPreview(null); }} 
                className="text-white bg-red-500 hover:bg-red-600 px-4 py-2 rounded-lg font-semibold transition-colors"
              >
                ❌ Remove
              </button>
            </div>
          )}
          {fileError && (
            <div className="mt-4 text-lg font-bold text-red-600 dark:text-red-400 p-4 bg-red-100 dark:bg-red-900/30 rounded-lg border-2 border-red-400">
              ⚠️ Error: {fileError}
            </div>
          )}
        </div>
      ) : (
        // Folder Mode - Script Generation
        <div className="p-6 border-2 border-green-300 dark:border-green-700 rounded-xl bg-gradient-to-r from-green-50 to-lime-50 dark:from-slate-800 dark:to-slate-700 shadow-lg space-y-4">
          <div className="text-center mb-4">
            <div className="text-5xl mb-2">🗁</div>
            <h3 className="text-2xl font-bold text-green-700 dark:text-green-400">Folder Conversion </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Generate a script to run conversions on your local machine</p>
          </div>

          <div>
            <label className="block font-bold mb-2 text-gray-800 dark:text-gray-200 text-lg"> Input Folder Path</label>
            <input
              type="text"
              value={inputFolder}
              onChange={(e) => setInputFolder(e.target.value)}
              placeholder="/absolute/path/to/input/folder (e.g., /home/user/molecules)"
              className="border-2 border-gray-300 dark:border-slate-600 rounded-lg px-4 py-3 w-full bg-white dark:bg-slate-700 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 font-mono"
            />
          </div>

          <div>
            <label className="block font-bold mb-2 text-gray-800 dark:text-gray-200 text-lg">Output Folder Path</label>
            <input
              type="text"
              value={outputFolder}
              onChange={(e) => setOutputFolder(e.target.value)}
              placeholder="/absolute/path/to/output/folder (e.g., /home/user/output)"
              className="border-2 border-gray-300 dark:border-slate-600 rounded-lg px-4 py-3 w-full bg-white dark:bg-slate-700 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 font-mono"
            />
          </div>
        </div>
      )}

      {/* Inline message */}
      {inlineMessage && (
        <div className="p-4 bg-gradient-to-r from-yellow-100 to-amber-100 dark:from-yellow-900/30 dark:to-amber-900/30 border-2 border-yellow-400 dark:border-yellow-600 rounded-xl text-lg text-yellow-900 dark:text-yellow-200 shadow-lg font-semibold">
          {inlineMessage}
        </div>
      )}

      {/* Progress */}
      {isConverting && (
        <div className="p-5 rounded-xl bg-gradient-to-r from-gray-100 to-slate-100 dark:from-slate-800 dark:to-slate-700 shadow-lg">
          <div className="w-full bg-gray-200 dark:bg-slate-600 rounded-full h-6 overflow-hidden shadow-inner">
            <div
              className="h-6 bg-gradient-to-r from-blue-500 via-purple-500 to-green-500 rounded-full transition-all duration-300 flex items-center justify-center text-white font-bold text-sm"
              style={{ width: `${progress}%` }}
            >
              {progress}%
            </div>
          </div>
          <div className="text-lg mt-3 font-bold text-gray-700 dark:text-gray-300 text-center">
            {mode === 'single' ? '⚙️ Converting...' : '📝 Generating script...'} {progress}%
          </div>
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-4 pt-6 border-t-2 border-gray-300 dark:border-slate-700">
        <button
          type="submit"
          disabled={isConverting}
          className="flex-1 bg-gradient-to-r from-blue-600 to-blue-600 hover:from-blue-700 hover:to-blue-700 text-white px-8 py-4 rounded-xl shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105 font-bold text-lg"
        >
          {isConverting ? '⏳ Processing...' : mode === 'single' ? ' Convert & Download' : ' Generate Script'}
        </button>
        <button
          type="button"
          onClick={() => {
            setSingleFile(null);
            setSingleName('');
            setPreview(null);
            setFileError('');
            setResults(null);
            setInlineMessage('');
            setLogText('');
            setProgress(0);
            setInputFolder('');
            setOutputFolder('');
            setScriptGenerated(false);
            setScriptInstructions('');
          }}
          className="px-8 py-4 bg-gradient-to-r from-gray-300 to-gray-400 hover:from-gray-400 hover:to-gray-500 dark:from-slate-700 dark:to-slate-600 dark:hover:from-slate-600 dark:hover:to-slate-500 text-gray-800 dark:text-gray-200 rounded-xl shadow-lg transition-all duration-200 font-bold text-lg"
        >
          🔄 Reset
        </button>
      </div>

      {/* Script Instructions */}
      {scriptGenerated && scriptInstructions && (
        <div className="mt-8 p-6 border-2 border-green-400 dark:border-green-600 rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 shadow-2xl">
          <h3 className="text-2xl font-bold text-green-700 dark:text-green-400 mb-4 flex items-center gap-2">
            <span>📜</span> How to Use Your Generated Script
          </h3>
          <pre className="p-4 bg-black/5 dark:bg-white/5 rounded-lg text-sm font-mono whitespace-pre-wrap border border-green-300 dark:border-green-700">
            {scriptInstructions}
          </pre>
          <button
            type="button"
            onClick={() => copyToClipboard(scriptInstructions)}
            className="mt-4 px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors"
          >
            📋 Copy Instructions
          </button>
        </div>
      )}

      {/* RESULTS for Single Mode */}
      {results && mode === 'single' && results.downloadedFile && (
        <div className="mt-8 p-6 border-2 border-green-400 dark:border-green-600 rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 shadow-2xl">
          <h3 className="text-2xl font-bold text-green-700 dark:text-green-400 mb-4 flex items-center gap-2">
            <span>✅</span> Conversion Complete
          </h3>
          <div className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-green-300 dark:border-green-700">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-lg text-gray-800 dark:text-gray-200">Downloaded File:</div>
                <div className="font-mono text-sm text-gray-600 dark:text-gray-400 mt-1">{results.downloadedFile}</div>
              </div>
              <div className="text-5xl"></div>
            </div>
          </div>
          <div className="mt-4 p-4 bg-blue-100 dark:bg-blue-900/30 rounded-lg border border-blue-300 dark:border-blue-700">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              <strong>💡 Tip:</strong> The file has been automatically downloaded to your default downloads folder. 
              Check your browser's download location if you can't find it.
            </p>
          </div>
        </div>
      )}

      {/* Logs */}
      <div className="pt-6 border-t-2 border-gray-300 dark:border-slate-700">
        <button 
          type="button" 
          onClick={() => setShowLog(!showLog)} 
          className="px-6 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg font-semibold text-gray-800 dark:text-gray-200 transition-colors"
        >
          {showLog ? '🔽 Hide Logs' : '🔼 Show Logs'}
        </button>
        {showLog && (
          <pre className="mt-4 p-4 bg-black dark:bg-slate-900 text-green-400 rounded-lg text-xs max-h-80 overflow-auto whitespace-pre-wrap font-mono border-2 border-gray-600 shadow-inner">
            {logText || '📝 No logs available.'}
          </pre>
        )}
      </div>
    </form>
  );
}
