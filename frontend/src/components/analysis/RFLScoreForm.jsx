import { useState, useRef, useEffect } from "react";

export default function RFLScoreForm() {
  // File input modes
  const [recMode, setRecMode] = useState("file");
  const [ligMode, setLigMode] = useState("file");
  const [executionMode, setExecutionMode] = useState("run"); // "run" or "download"

  // Path inputs for generate mode
  const [receptorPath, setReceptorPath] = useState("");
  const [ligandPath, setLigandPath] = useState("");
  const [fastaPath, setFastaPath] = useState("");

  // Single file inputs
  const [receptorFile, setReceptorFile] = useState(null);
  const [ligandFile, setLigandFile] = useState(null);
  
  // Folder inputs
  const [receptorFolder, setReceptorFolder] = useState([]);
  const [ligandFolder, setLigandFolder] = useState([]);
  
  // NEW: Optional FASTA files (if user wants to provide)
  const [fastaMode, setFastaMode] = useState("auto"); // "auto" or "manual"
  const [fastaFile, setFastaFile] = useState(null);
  const [fastaFolder, setFastaFolder] = useState([]);
  
  // Session IDs from uploads
  const [receptorSession, setReceptorSession] = useState("");
  const [ligandSession, setLigandSession] = useState("");
  const [fastaSession, setFastaSession] = useState("");

  // Configuration
  const [outputFolder, setOutputFolder] = useState("");
  const [maxWorkers, setMaxWorkers] = useState(() => {
    const cores = navigator.hardwareConcurrency || 4;
    return Math.max(1, Math.min(16, Math.floor(cores / 2)));
  });
  const [localBackendUrl, setLocalBackendUrl] = useState("http://127.0.0.1:5005");
  const [detectedCores, setDetectedCores] = useState(() => navigator.hardwareConcurrency || 4);

  // File refs
  const recFileRef = useRef(null);
  const ligFileRef = useRef(null);
  const recFolderRef = useRef(null);
  const ligFolderRef = useRef(null);
  const fastaFileRef = useRef(null);
  const fastaFolderRef = useRef(null);

  // Advanced options
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [mlModel, setMlModel] = useState("rfl_score");
  const [generatePlots, setGeneratePlots] = useState(true);
  const [generateFeatureCSV, setGenerateFeatureCSV] = useState(false);
  const [featureSelection, setFeatureSelection] = useState("auto");
  
  // NEW: Max poses to score
  const [maxPoses, setMaxPoses] = useState(5);

  // Status & Results
  const [status, setStatus] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState(null);

  // Output history
  const [outputHistory, setOutputHistory] = useState(() => {
    const saved = localStorage.getItem('rfl_output_history');
    return saved ? JSON.parse(saved) : [];
  });

  const SERVER_BACKEND = "https://backend-strzdw.fly.dev";

  // Save output history
  useEffect(() => {
    localStorage.setItem('rfl_output_history', JSON.stringify(outputHistory));
  }, [outputHistory]);

  const startFakeProgress = () => {
    setProgress(0);
    let v = 0;
    const t = setInterval(() => {
      v += Math.random() * 2 + 0.5;
      if (v >= 94) clearInterval(t);
      setProgress(Math.min(94, Math.round(v)));
    }, 800);
    return t;
  };

  const uploadToLocal = async (files, type) => {
    const fd = new FormData();
    files.forEach(f => fd.append("files", f));
    fd.append("file_type", type);

    const res = await fetch(`${localBackendUrl}/upload-files`, {
      method: "POST",
      body: fd
    });

    if (!res.ok) throw new Error(`Upload failed: ${await res.text()}`);
    return await res.json();
  };

  const handleOutputFolderChange = (value) => {
    setOutputFolder(value);
    if (value.trim() && !outputHistory.includes(value.trim())) {
      setOutputHistory(prev => [value.trim(), ...prev].slice(0, 10));
    }
  };
const handleGenerateScript = async () => {
  // Validation for paths
  if (recMode === "file" && !receptorPath.trim()) return alert("Enter receptor file path");
  if (recMode === "folder" && !receptorPath.trim()) return alert("Enter receptor folder path");
  if (ligMode === "file" && !ligandPath.trim()) return alert("Enter ligand/pose file path");
  if (ligMode === "folder" && !ligandPath.trim()) return alert("Enter ligand/pose folder path");
  if (!outputFolder) return alert("Missing output folder");
  
  setIsWorking(true);
  setStatus("📝 Generating standalone script...");
  
  try {
    // Request script generation with paths
    const jobData = new FormData();
    jobData.append("receptor_path", receptorPath);
    jobData.append("receptor_mode", recMode);
    jobData.append("ligand_path", ligandPath);
    jobData.append("ligand_mode", ligMode);
    jobData.append("output_folder", outputFolder);
    jobData.append("max_workers", maxWorkers.toString());
    jobData.append("local_backend_url", localBackendUrl);
    jobData.append("ml_model", mlModel);
    jobData.append("generate_plots", generatePlots ? "true" : "false");
    jobData.append("generate_feature_csv", generateFeatureCSV ? "true" : "false");
    jobData.append("feature_selection", featureSelection);
    jobData.append("max_poses", maxPoses.toString());
    jobData.append("generate_only", "true");
    
    if (fastaMode === "manual" && fastaPath.trim()) {
      jobData.append("fasta_path", fastaPath);
      jobData.append("fasta_mode", "manual");
    } else {
      jobData.append("fasta_mode", "auto");
    }
    
    const res = await fetch(`${SERVER_BACKEND}/analysis/rfl-score/submit-job`, {
      method: "POST",
      body: jobData
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(errorText);
    }
    
    const data = await res.json();
    
    // Download the script
    if (data.script_content) {
      const blob = new Blob([data.script_content], { type: 'text/x-python' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rfl_score_analysis_${Date.now()}.py`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      setStatus("✅ Script downloaded successfully! Run it on your local machine or cluster.");
    } else {
      throw new Error("No script content received");
    }
    
  } catch (err) {
    const msg = err.message || "Unknown error";
    setStatus("❌ Error: " + msg);
    alert("Error: " + msg);
  } finally {
    setIsWorking(false);
  }
};
  const handleSubmit = async () => {
    // Validation
    if (recMode === "file" && !receptorFile) return alert("Select receptor file");
    if (recMode === "folder" && receptorFolder.length === 0) return alert("Select receptor folder");
    if (ligMode === "file" && !ligandFile) return alert("Select ligand/pose file");
    if (ligMode === "folder" && ligandFolder.length === 0) return alert("Select ligand/pose folder");
    if (!outputFolder) return alert("Missing output folder");
    
    setIsWorking(true);
    setResults(null);
    const timer = startFakeProgress();
    
    try {
      // Upload receptor files
      setStatus("📤 Uploading receptor to local machine...");
      const recFiles = recMode === "file" ? [receptorFile] : receptorFolder;
      const recUpload = await uploadToLocal(recFiles, "receptor");
      setReceptorSession(recUpload.session_id);
      
      // Upload ligand/pose files
      setStatus(" Uploading ligand/poses to local machine...");
      const ligFiles = ligMode === "file" ? [ligandFile] : ligandFolder;
      const ligUpload = await uploadToLocal(ligFiles, "ligand");
      setLigandSession(ligUpload.session_id);
      
      // Upload FASTA files if provided
      let fastaUploadResult = null;
      if (fastaMode === "manual" && (fastaFile || fastaFolder.length > 0)) {
        setStatus(" Uploading FASTA sequences...");
        const fastaFiles = fastaFile ? [fastaFile] : fastaFolder;
        fastaUploadResult = await uploadToLocal(fastaFiles, "fasta");
        setFastaSession(fastaUploadResult.session_id);
      }
      
      // Submit job to server backend
      setStatus(" Requesting RFL-Score ML analysis from server...");
      
      const jobData = new FormData();
      jobData.append("receptor_session", recUpload.session_id);
      jobData.append("ligand_session", ligUpload.session_id);
      jobData.append("output_folder", outputFolder);
      jobData.append("max_workers", maxWorkers.toString());
      jobData.append("local_backend_url", localBackendUrl);
      jobData.append("ml_model", mlModel);
      jobData.append("generate_plots", generatePlots ? "true" : "false");
      jobData.append("generate_feature_csv", generateFeatureCSV ? "true" : "false");
      jobData.append("feature_selection", featureSelection);
      jobData.append("max_poses", maxPoses.toString()); // NEW
      
      // Optional FASTA session
      if (fastaUploadResult) {
        jobData.append("fasta_session", fastaUploadResult.session_id);
        jobData.append("fasta_mode", "manual");
      } else {
        jobData.append("fasta_mode", "auto");
      }
      
      const res = await fetch(`${SERVER_BACKEND}/analysis/rfl-score/submit-job`, {
        method: "POST",
        body: jobData
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText);
      }
      
      const data = await res.json();
      clearInterval(timer);
      setProgress(100);
      setStatus("✅ RFL-Score ML analysis completed successfully!");
      setResults(data);
      
    } catch (err) {
      clearInterval(timer);
      setProgress(0);
      const msg = err.message || "Unknown error";
      setStatus("❌ Error: " + msg);
      alert("Error: " + msg);
    } finally {
      setIsWorking(false);
    }
  };

  const downloadFile = (filePath) => {
    window.open(`${localBackendUrl}/download?path=${encodeURIComponent(filePath)}`, "_blank");
  };

return (
  <div className="max-w-6xl mx-auto p-8 bg-gradient-to-br from-purple-50 to-indigo-100 rounded-2xl shadow-2xl space-y-8 border-2 border-blue-800">
    {/* HEADER */}
    <div className="text-center">
      <h2 className="text-3xl font-bold text-gray-900 tracking-tight"> RFL-Score ML Scoring</h2>
      <p className="text-gray-600">Random Forest + Lasso Regression for Binding Affinity Prediction</p>
      <div className="text-gray-500 text-sm mt-2">
        Supports: <span className="font-medium">.pdb, .pdbqt (docking poses)</span>
      </div>
{/* INSTALLATION REQUIRED NOTICE */}
<div className="mt-6 p-5 bg-gradient-to-r from-orange-50 to-red-50 border-2 border-red-700 rounded-xl shadow-lg space-y-4">
  
  <p className="text-base font-bold text-gray-900 flex items-center justify-center gap-2">
    <span className="text-2xl">⚠️</span>
    Installation Required
  </p>

  <p className="text-sm text-gray-800 text-center">
    Before using this tool, you must download and install RFL-Score locally:
  </p>

  <div className="flex justify-center">
    <a
      href="https://github.com/combilab-furg/rfl-score_v1"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold rounded-lg shadow-md transition-all transform hover:scale-105"
    >
      📦 Download & Install RFL-Score from GitHub
      <span className="text-lg">→</span>
    </a>
  </div>

  <p className="text-xs text-gray-600 text-center">
    Follow the installation instructions in the repository README
  </p>

</div>

      
      <div className="mt-4 p-4 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-400 rounded-xl shadow-md">
        <p className="text-sm font-bold text-gray-800 mb-2 flex items-center justify-center gap-2">
          ℹ️ About Local Execution
        </p>
        <ul className="text-xs text-gray-700 space-y-1 text-left">
          <li>✓ Your docking results stay on YOUR computer</li>
          <li>✓ Files are NOT uploaded to the cloud</li>
          <li>✓ ML scoring runs locally with 723 molecular features</li>
          <li>✓ Results include Vina vs ML comparison tables</li>
          <li>✓ Parallel processing for multiple pose files</li>
          <li>✓ Local backend runs on your machine (port 5005)</li>
           <li> ✓ IF YOU WANT RUN NOW download the local backend from <a href="https://github.com/combilab-furg/local_backend" target="_blank" rel="noopener noreferrer"   
                   style={{ color: "#1a73e8", textDecoration: "underline" }}> GitHub </a> </li>
          
        </ul>
      </div>
    </div>

    {/* EXECUTION MODE SELECTOR - NOW FIRST */}
    <section className="bg-gradient-to-r from-blue-50 to-indigo-50 p-5 rounded-xl border-2 border-blue-400 shadow-md">
      <label className="font-semibold text-gray-800 text-lg mb-3 block"> Execution Mode</label>
      <div className="grid grid-cols-2 gap-4">
        <label className={`flex items-center gap-3 p-5 rounded-lg border-2 cursor-pointer transition ${
          executionMode === "run" 
            ? 'bg-purple-100 border-purple-500 shadow-md' 
            : 'bg-white border-gray-300 hover:border-purple-300'
        }`}>
          <input 
            type="radio" 
            name="executionMode"
            value="run"
            checked={executionMode === "run"}
            onChange={(e) => setExecutionMode(e.target.value)}
            className="w-5 h-5"
          />
          <div className="flex-1">
            <div className="font-bold text-gray-800 text-lg"> Run Now</div>
            <div className="text-sm text-gray-600 mt-1">Execute immediately on this machine</div>
            <div className="text-xs text-gray-500 mt-1">Files will be uploaded and processed</div>
          </div>
        </label>

        <label className={`flex items-center gap-3 p-5 rounded-lg border-2 cursor-pointer transition ${
          executionMode === "download" 
            ? 'bg-green-100 border-green-500 shadow-md' 
            : 'bg-white border-gray-300 hover:border-green-300'
        }`}>
          <input 
            type="radio" 
            name="executionMode"
            value="download"
            checked={executionMode === "download"}
            onChange={(e) => setExecutionMode(e.target.value)}
            className="w-5 h-5"
          />
          <div className="flex-1">
            <div className="font-bold text-gray-800 text-lg"> Generate Script</div>
            <div className="text-sm text-gray-600 mt-1">Download standalone Python script</div>
            <div className="text-xs text-gray-500 mt-1">For cluster or remote execution</div>
          </div>
        </label>
      </div>
    </section>

    {/* RECEPTOR - CONDITIONAL RENDERING */}
    <section className="space-y-2">
      <label className="font-semibold text-gray-700 text-lg"> Receptor (Protein)</label>
      
      {executionMode === "run" ? (
        // FILE UPLOAD MODE
        <>
          <div className="flex gap-2">
            <select
              value={recMode}
              onChange={(e) => {
                setRecMode(e.target.value);
                setReceptorFile(null);
                setReceptorFolder([]);
              }}
              className="px-3 py-2 border-2 border-gray-300 rounded-lg bg-white"
            >
              <option value="file">Browse File</option>
              <option value="folder">Browse Folder</option>
            </select>

            {recMode === "file" ? (
              <>
                <input
                  readOnly
                  value={receptorFile ? receptorFile.name : ""}
                  className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg bg-gray-50"
                  placeholder="Choose receptor file (.pdb, .pdbqt)"
                />
                <button
                  type="button"
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                  onClick={() => recFileRef.current.click()}
                >
                  Browse
                </button>
                <input
                  ref={recFileRef}
                  type="file"
                  className="hidden"
                  accept=".pdb,.pdbqt"
                  onChange={(e) => setReceptorFile(e.target.files[0])}
                />
              </>
            ) : (
              <>
                <input
                  readOnly
                  value={receptorFolder.length > 0 ? `📁 ${receptorFolder.length} files` : ""}
                  className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg bg-gray-50"
                  placeholder="Choose receptor folder"
                />
                <button
                  type="button"
                  className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600"
                  onClick={() => recFolderRef.current.click()}
                >
                  Browse Folder
                </button>
                <input
                  ref={recFolderRef}
                  type="file"
                  className="hidden"
                  webkitdirectory=""
                  multiple
                  onChange={(e) => setReceptorFolder(Array.from(e.target.files))}
                />
              </>
            )}
          </div>
        </>
      ) : (
        // PATH INPUT MODE
        <>
          <div className="flex gap-2">
            <select
              value={recMode}
              onChange={(e) => {
                setRecMode(e.target.value);
                setReceptorPath("");
              }}
              className="px-3 py-2 border-2 border-gray-300 rounded-lg bg-white"
            >
              <option value="file">File Path</option>
              <option value="folder">Folder Path</option>
            </select>

            <input
              value={receptorPath}
              onChange={(e) => setReceptorPath(e.target.value)}
              className="flex-1 px-4 py-2 border-2 border-green-300 rounded-lg bg-white"
              placeholder={recMode === "file" 
                ? "Absolute path to receptor file (e.g., /home/user/receptor.pdb)" 
                : "Absolute path to receptor folder (e.g., /home/user/receptors/)"}
            />
          </div>
          <p className="text-xs text-gray-600 mt-1">
            💡 Enter the absolute path on the machine where the script will run
          </p>
        </>
      )}
    </section>

    {/* LIGAND/POSES - CONDITIONAL RENDERING */}
    <section className="space-y-2">
      <label className="font-semibold text-gray-700 text-lg"> Ligand Poses (from Docking)</label>
      <p className="text-xs text-gray-500">Upload docking result files (.pdbqt with multiple poses)</p>
      
      {executionMode === "run" ? (
        // FILE UPLOAD MODE
        <>
          <div className="flex gap-2">
            <select
              value={ligMode}
              onChange={(e) => {
                setLigMode(e.target.value);
                setLigandFile(null);
                setLigandFolder([]);
              }}
              className="px-3 py-2 border-2 border-gray-300 rounded-lg bg-white"
            >
              <option value="file">Browse File</option>
              <option value="folder">Browse Folder</option>
            </select>

            {ligMode === "file" ? (
              <>
                <input
                  readOnly
                  value={ligandFile ? ligandFile.name : ""}
                  className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg bg-gray-50"
                  placeholder="Choose pose file (.pdbqt)"
                />
                <button
                  type="button"
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                  onClick={() => ligFileRef.current.click()}
                >
                  Browse
                </button>
                <input
                  ref={ligFileRef}
                  type="file"
                  className="hidden"
                  accept=".pdb,.pdbqt"
                  onChange={(e) => setLigandFile(e.target.files[0])}
                />
              </>
            ) : (
              <>
                <input
                  readOnly
                  value={ligandFolder.length > 0 ? `📁 ${ligandFolder.length} files` : ""}
                  className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg bg-gray-50"
                  placeholder="Choose pose folder"
                />
                <button
                  type="button"
                  className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600"
                  onClick={() => ligFolderRef.current.click()}
                >
                  Browse Folder
                </button>
                <input
                  ref={ligFolderRef}
                  type="file"
                  className="hidden"
                  webkitdirectory=""
                  multiple
                  onChange={(e) => setLigandFolder(Array.from(e.target.files))}
                />
              </>
            )}
          </div>
        </>
      ) : (
        // PATH INPUT MODE
        <>
          <div className="flex gap-2">
            <select
              value={ligMode}
              onChange={(e) => {
                setLigMode(e.target.value);
                setLigandPath("");
              }}
              className="px-3 py-2 border-2 border-gray-300 rounded-lg bg-white"
            >
              <option value="file">File Path</option>
              <option value="folder">Folder Path</option>
            </select>

            <input
              value={ligandPath}
              onChange={(e) => setLigandPath(e.target.value)}
              className="flex-1 px-4 py-2 border-2 border-green-300 rounded-lg bg-white"
              placeholder={ligMode === "file" 
                ? "Absolute path to ligand file (e.g., /home/user/ligand_poses.pdbqt)" 
                : "Absolute path to ligand folder (e.g., /home/user/ligands/)"}
            />
          </div>
          <p className="text-xs text-gray-600 mt-1">
            💡 Enter the absolute path on the machine where the script will run
          </p>
        </>
      )}
    </section>

    {/* OPTIONAL FASTA SECTION - CONDITIONAL */}
    <section className="space-y-2 bg-yellow-50 p-4 rounded-xl border-2 border-yellow-700">
      <div className="flex items-center justify-between">
        <label className="font-semibold text-gray-700 text-lg">
           Protein Sequence (FASTA) - Optional
        </label>
        <select
          value={fastaMode}
          onChange={(e) => {
            setFastaMode(e.target.value);
            setFastaFile(null);
            setFastaFolder([]);
            setFastaPath("");
          }}
          className="px-3 py-2 border-2 border-yellow-400 rounded-lg bg-white text-sm"
        >
          <option value="auto">Auto-extract from PDB</option>
          <option value="manual">Upload FASTA manually</option>
        </select>
      </div>
      
      <p className="text-xs text-gray-600">
        {fastaMode === "auto" 
          ? "✓ Sequence will be auto-extracted from receptor structure" 
          : executionMode === "run"
          ? "Upload FASTA files if auto-extraction might fail"
          : "Enter FASTA file/folder path if auto-extraction might fail"}
      </p>

      {fastaMode === "manual" && (
        executionMode === "run" ? (
          // FILE UPLOAD MODE
          <div className="flex gap-2 mt-2">
            <select
              value={fastaFile ? "file" : fastaFolder.length > 0 ? "folder" : "file"}
              onChange={(e) => {
                if (e.target.value === "folder") {
                  setFastaFile(null);
                } else {
                  setFastaFolder([]);
                }
              }}
              className="px-3 py-2 border-2 border-gray-300 rounded-lg bg-white"
            >
              <option value="file">Browse File</option>
              <option value="folder">Browse Folder</option>
            </select>

            {(!fastaFolder.length) ? (
              <>
                <input
                  readOnly
                  value={fastaFile ? fastaFile.name : ""}
                  className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg bg-gray-50"
                  placeholder="Choose FASTA file (.fasta, .fa)"
                />
                <button
                  type="button"
                  className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600"
                  onClick={() => fastaFileRef.current.click()}
                >
                  Browse
                </button>
                <input
                  ref={fastaFileRef}
                  type="file"
                  className="hidden"
                  accept=".fasta,.fa,.faa,.txt"
                  onChange={(e) => setFastaFile(e.target.files[0])}
                />
              </>
            ) : (
              <>
                <input
                  readOnly
                  value={fastaFolder.length > 0 ? `📁 ${fastaFolder.length} files` : ""}
                  className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg bg-gray-50"
                  placeholder="Choose FASTA folder"
                />
                <button
                  type="button"
                  className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600"
                  onClick={() => fastaFolderRef.current.click()}
                >
                  Browse Folder
                </button>
                <input
                  ref={fastaFolderRef}
                  type="file"
                  className="hidden"
                  webkitdirectory=""
                  multiple
                  onChange={(e) => setFastaFolder(Array.from(e.target.files))}
                />
              </>
            )}
          </div>
        ) : (
          // PATH INPUT MODE
          <div className="mt-2">
            <input
              value={fastaPath}
              onChange={(e) => setFastaPath(e.target.value)}
              className="w-full px-4 py-2 border-2 border-green-300 rounded-lg bg-white"
              placeholder="Absolute path to FASTA file or folder (e.g., /home/user/sequences.fasta)"
            />
            <p className="text-xs text-gray-600 mt-1">
              💡 Enter the absolute path on the machine where the script will run
            </p>
          </div>
        )
      )}
    </section>

    {/* OUTPUT FOLDER */}
    <section>
      <label className="font-semibold text-gray-700 text-lg">🗁 Output Folder</label>
      <input
        value={outputFolder}
        onChange={(e) => handleOutputFolderChange(e.target.value)}
        list="output-history"
        className="w-full mt-2 px-4 py-2 border-2 border-gray-300 rounded-lg"
        placeholder="/absolute/path/to/output (e.g., /home/user/rfl_results)"
      />
      <datalist id="output-history">
        {outputHistory.map((path, idx) => (
          <option key={idx} value={path} />
        ))}
      </datalist>
      {outputHistory.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setOutputHistory([]);
            localStorage.removeItem('rfl_output_history');
          }}
          className="text-xs text-red-600 hover:text-red-800 mt-1"
        >
          Clear history
        </button>
      )}
    </section>

    {/* PARALLEL WORKERS */}
    <section className="bg-gradient-to-br from-indigo-50 to-purple-50 p-5 rounded-xl border-2 border-indigo-300 shadow-md">
      <label className="font-semibold text-gray-800 text-lg flex items-center gap-2">
         Parallel Workers
      </label>
      <p className="text-sm text-gray-600 mt-2 mb-1">
        Simultaneous ML analyses (CPU cores)
      </p>
      <p className="text-xs text-blue-600 mb-3 font-medium">
        🖥️ Detected: {detectedCores} cores · Auto-set: {Math.floor(detectedCores / 2)} workers
      </p>
      <select 
        value={maxWorkers} 
        onChange={(e) => setMaxWorkers(parseInt(e.target.value))}
        className="w-full px-4 py-3 border-2 border-indigo-300 rounded-lg bg-white font-medium text-lg"
      >
        {[1,2,4,6,8,12,16].map(num => (
          <option key={num} value={num}>
            {num} worker{num > 1 ? 's' : ''} 
            {num === Math.floor(detectedCores / 2) ? ' (Recommended)' : ''}
          </option>
        ))}
      </select>
    </section>

    {/* ADVANCED OPTIONS */}
    <section className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border-2 border-gray-300 overflow-hidden shadow-md">
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-100 transition"
      >
        <div className="flex items-center gap-2">
          <span className="text-xl">⚙️</span>
          <h3 className="font-semibold text-gray-800 text-lg">Advanced ML Options</h3>
        </div>
        <span className={`text-gray-600 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>
      
      {showAdvanced && (
        <div className="p-5 border-t-2 border-gray-200 bg-white space-y-4">
          {/* Local Backend URL */}
          <div className="p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
            <label className="font-semibold text-gray-800 flex items-center gap-2 mb-2">
              <span className="text-lg">🖥️</span> Local Backend URL
            </label>
            <input
              value={localBackendUrl}
              onChange={(e) => setLocalBackendUrl(e.target.value)}
              className="w-full px-4 py-2 border-2 border-blue-300 rounded-lg"
              placeholder="http://127.0.0.1:5005"
            />
          </div>

          {/* Max Poses to Score */}
          <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border-2 border-green-300">
            <label className="font-semibold text-gray-800 flex items-center gap-2 mb-2">
               Max Poses to Score per Ligand
            </label>
            <p className="text-xs text-gray-600 mb-3">
              Limit number of poses to score (lower = faster, higher = more complete)
            </p>
            <select
              value={maxPoses}
              onChange={(e) => setMaxPoses(parseInt(e.target.value))}
              className="w-full px-4 py-2 border-2 border-green-400 rounded-lg font-medium"
            >
              <option value={1}>Top 1 pose only (fastest)</option>
              <option value={3}>Top 3 poses (quick)</option>
              <option value={5}>Top 5 poses (recommended)</option>
              <option value={10}>Top 10 poses (thorough)</option>
              <option value={20}>Top 20 poses (very thorough)</option>
              <option value={0}>All poses (slowest, most complete)</option>
            </select>
            <p className="text-xs text-gray-500 mt-2">
              ⚡ Estimated time per ligand: ~{maxPoses === 0 ? "varies" : maxPoses * 30}-{maxPoses === 0 ? "varies" : maxPoses * 60} seconds
            </p>
          </div>

          {/* ML Model Selection */}
          {/* <div>
            <label className="font-semibold text-gray-700 mb-2 block">ML Model</label>
            <select
              value={mlModel}
              onChange={(e) => setMlModel(e.target.value)}
              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg"
            >
              <option value="rfl_score">RFL-Score (Random Forest + Lasso)</option>
              <option value="rf_score">RF-Score (Random Forest only)</option>
            </select>
          </div> */}

          {/* Feature Selection */}
          {/* <div>
            <label className="font-semibold text-gray-700 mb-2 block">Feature Selection Method</label>
            <select
              value={featureSelection}
              onChange={(e) => setFeatureSelection(e.target.value)}
              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg"
            >
              <option value="auto">Auto (LassoCV)</option>
              <option value="all">All Features (no selection)</option>
              <option value="custom">Custom Threshold</option>
            </select>
          </div> */}

          {/* Output Options */}
          <div className="grid grid-cols-2 gap-4">
            <label className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg border-2 border-gray-200 cursor-pointer">
              <input 
                type="checkbox" 
                checked={generatePlots} 
                onChange={(e) => setGeneratePlots(e.target.checked)} 
                className="mt-1" 
              />
              <div className="flex-1">
                <div className="font-medium text-gray-800">Generate Plots</div>
                <div className="text-xs text-gray-600 mt-1">Comparison charts</div>
              </div>
            </label>

            <label className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg border-2 border-gray-200 cursor-pointer">
              <input 
                type="checkbox" 
                checked={generateFeatureCSV} 
                onChange={(e) => setGenerateFeatureCSV(e.target.checked)} 
                className="mt-1" 
              />
              <div className="flex-1">
                <div className="font-medium text-gray-800">Export Features</div>
                <div className="text-xs text-gray-600 mt-1">Feature matrix CSV</div>
              </div>
            </label>
          </div>
        </div>
      )}
    </section>

   {/* ACTION BUTTON */}
    <div className="space-y-3">
      {executionMode === "run" ? (
        <button
          onClick={handleSubmit}
          disabled={isWorking}
          className="w-full px-6 py-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-lg rounded-xl disabled:opacity-60 shadow-lg transition"
        >
          {isWorking ? "🔄 Running ML Analysis..." : " Run RFL-Score ML Scoring"}
        </button>
      ) : (
        <button
          onClick={handleGenerateScript}
          disabled={isWorking}
          className="w-full px-6 py-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold text-lg rounded-xl disabled:opacity-60 shadow-lg transition"
        >
          {isWorking ? "📝 Generating Script..." : " Download Standalone Script"}
        </button>
      )}
    </div>

    {/* PROGRESS BAR */}
    {isWorking && (
      <div className="w-full bg-gray-200 h-3 rounded-full overflow-hidden">
        <div 
          style={{ width: `${progress}%` }} 
          className="h-3 bg-gradient-to-r from-purple-400 via-indigo-500 to-blue-500 transition-all" 
        />
      </div>
    )}

    {/* STATUS MESSAGE */}
    {status && (
      <div className={`text-center p-3 rounded-lg ${
        status.includes('Error') || status.includes('❌') 
          ? 'bg-red-100 text-red-700' 
          : 'bg-blue-100 text-blue-700'
      }`}>
        {status}
      </div>
    )}

    {/* RESULTS SECTION */}
    {results && results.results && results.results.length > 0 && (
      <section className="mt-8 space-y-6">
        {/* SUMMARY HEADER */}
        <div className="p-6 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border-2 border-green-400">
          <h3 className="font-bold text-2xl text-gray-800 mb-2">✅ ML Scoring Complete</h3>
          <p className="text-sm text-gray-600 mb-4">📁 {results.job_dir || 'N/A'}</p>
          
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-lg shadow text-center">
              <p className="text-xs text-gray-500 font-semibold mb-1">Total Combinations</p>
              <p className="text-3xl font-bold text-gray-800">{results.total_combinations || 0}</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow text-center">
              <p className="text-xs text-gray-500 font-semibold mb-1">Successful</p>
              <p className="text-3xl font-bold text-green-600">{results.successful || 0}</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow text-center">
              <p className="text-xs text-gray-500 font-semibold mb-1">Failed</p>
              <p className="text-3xl font-bold text-red-600">{results.failed || 0}</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow text-center">
              <p className="text-xs text-gray-500 font-semibold mb-1">Time (sec)</p>
              <p className="text-3xl font-bold text-blue-600">{results.execution_time_seconds || 0}</p>
            </div>
          </div>
        </div>

        {/* DETAILED RESULTS */}
        <div className="space-y-6">
          <h3 className="font-bold text-xl text-gray-800 flex items-center gap-2">
            📊 ML Scoring Results ({results.results.length} combination{results.results.length > 1 ? 's' : ''})
          </h3>

          {results.results.map((combo, idx) => (
            <div key={idx} className="bg-white rounded-2xl border-2 border-purple-300 shadow-lg overflow-hidden">
              {/* Combination Header */}
              <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-4">
                <h4 className="font-bold text-xl text-white">
                  🧬 {combo.receptor || 'Unknown'} × 💊 {combo.ligand || 'Unknown'}
                </h4>
                <p className="text-white text-sm mt-1">
                  Poses analyzed: {combo.poses_analyzed || 0}
                </p>
              </div>

              {/* Comparison Table */}
              {combo.comparison_table && combo.comparison_table.length > 0 && (
                <div className="p-6">
                  <h5 className="font-bold text-lg text-gray-800 mb-4">📈 Vina vs ML Score Comparison</h5>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-gradient-to-r from-purple-100 to-indigo-100">
                          <th className="px-4 py-3 text-left font-bold text-gray-800 border border-gray-300">Pose</th>
                          <th className="px-4 py-3 text-left font-bold text-gray-800 border border-gray-300">Vina Score</th>
                          <th className="px-4 py-3 text-left font-bold text-gray-800 border border-gray-300">Vina Rank</th>
                          <th className="px-4 py-3 text-left font-bold text-gray-800 border border-gray-300">ML Score</th>
                          <th className="px-4 py-3 text-left font-bold text-gray-800 border border-gray-300">ML Rank</th>
                          <th className="px-4 py-3 text-left font-bold text-gray-800 border border-gray-300">Δ Rank</th>
                        </tr>
                      </thead>
                      <tbody>
                        {combo.comparison_table.map((row, rowIdx) => (
                          <tr key={rowIdx} className={`${row.ml_rank === 1 ? 'bg-green-50 font-bold' : 'bg-white'} hover:bg-gray-50`}>
                            <td className="px-4 py-3 border border-gray-300">{row.pose}</td>
                            <td className="px-4 py-3 border border-gray-300">{row.vina_score?.toFixed(2) || 'N/A'}</td>
                            <td className="px-4 py-3 border border-gray-300">{row.vina_rank}</td>
                            <td className="px-4 py-3 border border-gray-300 text-purple-700 font-semibold">
                              {row.ml_score?.toFixed(2) || 'N/A'}
                            </td>
                            <td className="px-4 py-3 border border-gray-300 text-purple-700 font-semibold">
                              {row.ml_rank} {row.ml_rank === 1 ? '🏆' : ''}
                            </td>
                            <td className={`px-4 py-3 border border-gray-300 ${
                              row.rank_change > 0 ? 'text-green-600' : row.rank_change < 0 ? 'text-red-600' : 'text-gray-600'
                            }`}>
                              {row.rank_change > 0 ? '+' : ''}{row.rank_change}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Download Files */}
              <div className="p-6 bg-gray-50 border-t-2 border-gray-200">
                <h5 className="font-bold text-lg text-gray-800 mb-3">📥 Download Results</h5>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {combo.output_files?.map((file, fileIdx) => (
                    <button
                      key={fileIdx}
                      onClick={() => downloadFile(file.path)}
                      className="px-4 py-3 bg-white hover:bg-blue-50 border-2 border-blue-300 rounded-lg text-sm text-left transition flex items-center gap-2"
                    >
                      <span className="text-lg">
                        {file.name.endsWith('.csv') ? '📊' : 
                         file.name.endsWith('.png') ? '📈' : 
                         file.name.endsWith('.pdb') ? '🧬' : '📄'}
                      </span>
                      <span className="flex-1 truncate">{file.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    )}
  </div>
);
}
