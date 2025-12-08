import { useState, useRef, useEffect } from "react";

export default function PlipFormOnline() {
  const [recMode, setRecMode] = useState("file");
  const [ligMode, setLigMode] = useState("file");

  const [receptorFile, setReceptorFile] = useState(null);
  const [ligandFile, setLigandFile] = useState(null);
  
  const [receptorFolder, setReceptorFolder] = useState([]);
  const [ligandFolder, setLigandFolder] = useState([]);
  
  const [receptorSession, setReceptorSession] = useState("");
  const [ligandSession, setLigandSession] = useState("");

  const [outputFolder, setOutputFolder] = useState("");
  const [maxPoses, setMaxPoses] = useState(5);
  const [maxWorkers, setMaxWorkers] = useState(() => {
    const cores = navigator.hardwareConcurrency || 4;
    return Math.max(1, Math.min(16, Math.floor(cores / 2)));
  });
  const [localBackendUrl, setLocalBackendUrl] = useState("http://127.0.0.1:5005");
  const [detectedCores, setDetectedCores] = useState(() => navigator.hardwareConcurrency || 4);

  const recFileRef = useRef(null);
  const ligFileRef = useRef(null);
  const recFolderRef = useRef(null);
  const ligFolderRef = useRef(null);

  const [removeWaters, setRemoveWaters] = useState(false);
  const [removeIons, setRemoveIons] = useState(false);
  const [addHydrogens, setAddHydrogens] = useState(true);
  const [keepHetero, setKeepHetero] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [status, setStatus] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState(null);
  
  const [selectedPosesFor3D, setSelectedPosesFor3D] = useState([]);
  const [show3DViewer, setShow3DViewer] = useState(false);
  const [is3DLibLoaded, setIs3DLibLoaded] = useState(false);
  const viewerRefs = useRef({});

  const SERVER_BACKEND = "http://localhost:8000";

  useEffect(() => {
    const load3DmolScript = () => {
      if (window.$3Dmol) {
        console.log('[3D] 3Dmol.js already loaded');
        setIs3DLibLoaded(true);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://3Dmol.csb.pitt.edu/build/3Dmol-min.js';
      script.async = true;
      script.onload = () => {
        console.log('[3D] 3Dmol.js loaded successfully');
        setIs3DLibLoaded(true);
      };
      script.onerror = () => {
        console.error('[3D] Failed to load 3Dmol.js');
        alert('Failed to load 3D visualization library. Please refresh the page.');
      };
      document.body.appendChild(script);
    };

    load3DmolScript();
  }, []);

  const startFakeProgress = () => {
    setProgress(0);
    let v = 0;
    const t = setInterval(() => {
      v += Math.random() * 3 + 1;
      if (v >= 94) clearInterval(t);
      setProgress(Math.min(94, Math.round(v)));
    }, 500);
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

  const handleSubmit = async () => {
    if (recMode === "file" && !receptorFile) return alert("Select receptor file");
    if (recMode === "folder" && receptorFolder.length === 0) return alert("Select receptor folder");
    if (ligMode === "file" && !ligandFile) return alert("Select ligand file");
    if (ligMode === "folder" && ligandFolder.length === 0) return alert("Select ligand folder");
    if (!outputFolder) return alert("Missing output folder");

    setIsWorking(true);
    setResults(null);
    const timer = startFakeProgress();

    try {
      setStatus("📤 Uploading receptor to local machine...");
      const recFiles = recMode === "file" ? [receptorFile] : receptorFolder;
      const recUpload = await uploadToLocal(recFiles, "receptor");
      setReceptorSession(recUpload.session_id);

      setStatus("📤 Uploading ligand to local machine...");
      const ligFiles = ligMode === "file" ? [ligandFile] : ligandFolder;
      const ligUpload = await uploadToLocal(ligFiles, "ligand");
      setLigandSession(ligUpload.session_id);

      setStatus("🔧 Requesting PLIP analysis from server...");
      
      const jobData = new FormData();
      jobData.append("receptor_session", recUpload.session_id);
      jobData.append("ligand_session", ligUpload.session_id);
      jobData.append("output_folder", outputFolder);
      jobData.append("max_poses", maxPoses.toString());
      jobData.append("max_workers", maxWorkers.toString());
      jobData.append("local_backend_url", localBackendUrl);
      jobData.append("remove_waters", removeWaters ? "true" : "false");
      jobData.append("remove_ions", removeIons ? "true" : "false");
      jobData.append("add_hydrogens", addHydrogens ? "true" : "false");
      jobData.append("keep_hetero", keepHetero ? "true" : "false");

      const res = await fetch(`${SERVER_BACKEND}/analysis/plip/submit-job`, {
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
      setStatus("☑️ PLIP analysis completed successfully!");
      setResults(data);

    } catch (err) {
      clearInterval(timer);
      setProgress(0);
      const msg = err.message || "Unknown error";
      setStatus("Error: " + msg);
      alert("Error: " + msg);
    } finally {
      setIsWorking(false);
    }
  };

  const downloadFile = (poseFolder, filename) => {
    const fullPath = `${poseFolder}/${filename}`;
    window.open(`${localBackendUrl}/download?path=${encodeURIComponent(fullPath)}`, "_blank");
  };

  const toggle3DPoseSelection = (comboIdx, poseNum) => {
    const key = `${comboIdx}-${poseNum}`;
    setSelectedPosesFor3D(prev => {
      if (prev.includes(key)) {
        return prev.filter(p => p !== key);
      } else {
        if (prev.length >= 20) {
          alert("Maximum 20 poses can be selected for 3D visualization");
          return prev;
        }
        setShow3DViewer(false);
        viewerRefs.current = {};
        return [...prev, key];
      }
    });
  };

  const load3DStructure = async (viewerId, poseFolder) => {
    try {
      console.log(`[${viewerId}] Starting to load structure from: ${poseFolder}`);
      
      // Fetch PDB file
      const pdbPath = `${poseFolder}/complex.pdb`;
      console.log(`[${viewerId}] Fetching PDB from: ${pdbPath}`);
      const response = await fetch(`${localBackendUrl}/download?path=${encodeURIComponent(pdbPath)}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch PDB: ${response.status} ${response.statusText}`);
      }
      
      const pdbData = await response.text();
      console.log(`[${viewerId}] PDB data loaded, length: ${pdbData.length} chars`);
      
      if (!pdbData || pdbData.length < 100) {
        throw new Error('PDB data appears invalid or empty');
      }

      // Fetch interaction data
      const jsonPath = `${poseFolder}/interactions_all.json`;
      let interactions = [];
      try {
        console.log(`[${viewerId}] Fetching interactions from: ${jsonPath}`);
        const jsonResponse = await fetch(`${localBackendUrl}/download?path=${encodeURIComponent(jsonPath)}`);
        interactions = await jsonResponse.json();
        console.log(`[${viewerId}] Loaded ${interactions.length} interactions`);
      } catch (e) {
        console.warn(`[${viewerId}] No interaction data found:`, e);
      }

      // Initialize 3Dmol viewer
      const element = document.getElementById(viewerId);
      if (!element) {
        throw new Error(`Element ${viewerId} not found in DOM`);
      }
      
      console.log(`[${viewerId}] Element found, dimensions: ${element.offsetWidth}x${element.offsetHeight}`);

      const config = { backgroundColor: 'lightblue' };
      const viewer = window.$3Dmol.createViewer(element, config);
      
      if (!viewer) {
        throw new Error('Failed to create 3Dmol viewer');
      }
      
      console.log(`[${viewerId}] 3Dmol viewer created successfully`);

      // Add protein structure
      const model = viewer.addModel(pdbData, "pdb");
      console.log(`[${viewerId}] Model added, atoms: ${model.selectedAtoms({}).length}`);
      
      // Count ligand atoms (UNL is the standard ligand residue name in PLIP output)
      const ligandAtoms = model.selectedAtoms({ resn: 'UNL' });
      console.log(`[${viewerId}] Ligand atoms found: ${ligandAtoms.length}`);
      
      if (ligandAtoms.length === 0) {
        console.warn(`[${viewerId}] WARNING: No ligand atoms found! Check PDB file`);
      }
      
      // Style: Show ONLY binding pocket residues (within 5Å of ligand) as sticks
     // Layer 1: Show entire protein as transparent cartoon for context
      viewer.setStyle({ resn: { ne: 'UNL' } }, { 
        cartoon: { 
          color: 'lightgray',
          opacity: 0.3
        } 
      });
      
      // Layer 2: Highlight binding pocket residues (within 5Å) with sticks
      viewer.setStyle({ resn: { ne: 'UNL' }, within: { distance: 5, sel: { resn: 'UNL' } } }, { 
        cartoon: {
          color: 'spectrum',
          opacity: 0.7
        },
        stick: { 
          radius: 0.25, 
          colorscheme: 'Jmol' 
        } 
      });
      
      // Layer 3: Ligand - BRIGHT GREEN for maximum visibility
      viewer.setStyle({ resn: 'UNL' }, { 
        stick: { 
          radius: 0.4, 
          color: 'lime'
        },
        sphere: {
          radius: 0.5,
          color: 'green'
        }
      });
      
      console.log(`[${viewerId}] Styles applied`);

      // Highlight interactions with scientific colors matching PLIP diagram
      const interactionStyles = {
        'Hydrogen Bonds': { color: 'blue', radius: 0.10, dashed: true },
        'Hydrophobic Interactions': { color: 'gray', radius: 0.08, dashed: true },
        'Salt Bridges': { color: 'orange', radius: 0.12, dashed: false },
        'Pi Stacks': { color: 'green', radius: 0.12, dashed: true },
        'Pi Cation Interactions': { color: 'orange', radius: 0.10, dashed: true },
        'Halogen Bonds': { color: 'turquoise', radius: 0.10, dashed: true },
        'Water Bridges': { color: 'lightblue', radius: 0.08, dashed: true },
        'Metal Complexes': { color: 'purple', radius: 0.12, dashed: false }
      };

      // Render interactions
      if (interactions.length > 0) {
        console.log(`[${viewerId}] Rendering ${interactions.length} interactions...`);
        
        let renderedCount = 0;
        interactions.forEach((interaction, idx) => {
          const type = interaction.interaction_type || '';
          const style = interactionStyles[type] || { color: 'gray', radius: 0.08, dashed: true };
          
          // PLIP uses standard coordinate field names across all interaction types
          let start = null;
          let end = null;
          
          // Extract coordinates from PLIP's standard format
          if (interaction.ligcoo_x !== undefined && interaction.protcoo_x !== undefined) {
            start = { 
              x: parseFloat(interaction.ligcoo_x), 
              y: parseFloat(interaction.ligcoo_y), 
              z: parseFloat(interaction.ligcoo_z) 
            };
            end = { 
              x: parseFloat(interaction.protcoo_x), 
              y: parseFloat(interaction.protcoo_y), 
              z: parseFloat(interaction.protcoo_z) 
            };
          }
          
          const distance = interaction.dist || interaction.distance;
          
          // Draw interaction line if coordinates are valid
          if (start && end) {
            // Validate coordinates
            if (!isNaN(start.x) && !isNaN(start.y) && !isNaN(start.z) &&
                !isNaN(end.x) && !isNaN(end.y) && !isNaN(end.z)) {
              
              viewer.addCylinder({
                start: start,
                end: end,
                radius: style.radius,
                color: style.color,
                dashed: style.dashed,
                dashLength: style.dashed ? 0.2 : undefined
              });
              
              renderedCount++;
              
              // Add distance label in center
              if (distance) {
                const mid = {
                  x: (start.x + end.x) / 2,
                  y: (start.y + end.y) / 2,
                  z: (start.z + end.z) / 2
                };
                viewer.addLabel(parseFloat(distance).toFixed(2) + ' Å', {
                  position: mid,
                  backgroundColor: style.color,
                  backgroundOpacity: 0.8,
                  fontColor: 'white',
                  fontSize: 9,
                  borderThickness: 0
                });
              }
            } else {
              console.warn(`[${viewerId}] Invalid coordinates for interaction ${idx}:`, {start, end});
            }
          } else {
            console.warn(`[${viewerId}] Could not extract coordinates for interaction ${idx} (${type})`);
          }
        });
        
        console.log(`[${viewerId}] Successfully rendered ${renderedCount}/${interactions.length} interactions`);
      } else {
        console.log(`[${viewerId}] No interactions to render`);
      }

      // Zoom to ligand for best view
      console.log(`[${viewerId}] Zooming to ligand...`);
      if (ligandAtoms.length > 0) {
        viewer.zoomTo({ resn: 'UNL' });
      } else {
        viewer.zoomTo();
      }
      
      console.log(`[${viewerId}] Rendering scene...`);
      viewer.render();
      
      console.log(`[${viewerId}] ✅ 3D structure loaded successfully`);
      
      viewerRefs.current[viewerId] = viewer;
    } catch (error) {
      console.error(`❌ Failed to load 3D structure for ${viewerId}:`, error);
      alert(`Failed to load 3D structure for ${viewerId}: ${error.message}`);
    }
  };

  const init3DViewers = async () => {
    if (typeof window.$3Dmol === 'undefined') {
      alert('3Dmol.js library not loaded. Please refresh the page.');
      return;
    }
    
    setShow3DViewer(true);
    await new Promise(resolve => setTimeout(resolve, 200));
    
    for (const key of selectedPosesFor3D) {
      const [comboIdx, poseNum] = key.split('-');
      const combo = results.results[parseInt(comboIdx)];
      const pose = combo.poses.find(p => p.pose === parseInt(poseNum));
      if (pose) {
        await load3DStructure(`viewer-${key}`, pose.folder);
      }
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-8 bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl shadow-2xl space-y-8 border-2 border-blue-400">
      {/* HEADER */}
      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900 tracking-tight">🧬 PLIP Analysis</h2>
        <p className="text-gray-600">Protein-Ligand Interaction Profiler (Parallel Mode)</p>
        <div className="text-gray-500 text-sm mt-2">
          Supports: <span className="font-medium">.pdb, .pdbqt</span>
        </div>
        
        <div className="mt-4 p-4 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-400 rounded-xl shadow-md">
          <p className="text-sm font-bold text-gray-800 mb-2 flex items-center justify-center gap-2">
            <span className="text-xl">🔒</span> About Local Execution
          </p>
          <ul className="text-xs text-gray-700 space-y-1 text-left">
            <li>✓ Your files stay on YOUR computer</li>
            <li>✓ Files are NOT uploaded to the cloud</li>
            <li>✓ Results saved to your chosen folder</li>
            <li>✓ Local backend runs on your machine (port 5005)</li>
            <li>✓ Parallel processing for multiple combinations</li>
          </ul>
        </div>
      </div>

      {/* RECEPTOR */}
      <section className="space-y-2">
        <label className="font-semibold text-gray-700 text-lg"> Receptor</label>
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
      </section>

      {/* LIGAND */}
      <section className="space-y-2">
        <label className="font-semibold text-gray-700 text-lg"> Ligand</label>
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
                placeholder="Choose ligand file (.pdb, .pdbqt)"
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
                placeholder="Choose ligand folder"
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
      </section>

      {/* OUTPUT FOLDER */}
      <section>
        <label className="font-semibold text-gray-700 text-lg">📂 Output Folder</label>
        <input
          value={outputFolder}
          onChange={(e) => setOutputFolder(e.target.value)}
          className="w-full mt-2 px-4 py-2 border-2 border-gray-300 rounded-lg"
          placeholder="/absolute/path/to/output"
        />
      </section>

      {/* MAX POSES & WORKERS */}
      <div className="grid grid-cols-2 gap-4">
        <section className="bg-gradient-to-br from-blue-50 to-indigo-50 p-5 rounded-xl border-2 border-blue-300 shadow-md">
          <label className="font-semibold text-gray-800 text-lg flex items-center gap-2">
            🎯 Max Poses
          </label>
          <p className="text-sm text-gray-600 mt-2 mb-3">
            Poses to analyze per combination
          </p>
          <select value={maxPoses} onChange={(e) => setMaxPoses(parseInt(e.target.value))}
            className="w-full px-4 py-3 border-2 border-blue-300 rounded-lg bg-white font-medium text-lg">
            {[...Array(20)].map((_, i) => {
              const num = i + 1;
              return <option key={num} value={num}>{num}</option>;
            })}
          </select>
        </section>

        <section className="bg-gradient-to-br from-purple-50 to-pink-50 p-5 rounded-xl border-2 border-purple-300 shadow-md">
          <label className="font-semibold text-gray-800 text-lg flex items-center gap-2">
             Parallel Workers
          </label>
          <p className="text-sm text-gray-600 mt-2 mb-1">
            Simultaneous analyses (CPU cores)
          </p>
          <p className="text-xs text-blue-600 mb-3 font-medium">
            🖥️ Detected: {detectedCores} cores · Auto-set: {Math.floor(detectedCores / 2)} workers
          </p>
          <select value={maxWorkers} onChange={(e) => setMaxWorkers(parseInt(e.target.value))}
            className="w-full px-4 py-3 border-2 border-purple-300 rounded-lg bg-white font-medium text-lg">
            {[1,2,4,6,8,12,16].map(num => (
              <option key={num} value={num}>
                {num} worker{num > 1 ? 's' : ''} 
                {num === Math.floor(detectedCores / 2) ? ' (Recommended)' : ''}
              </option>
            ))}
          </select>
        </section>
      </div>

      {/* ADVANCED OPTIONS */}
      <section className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border-2 border-gray-300 overflow-hidden shadow-md">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-100 transition"
        >
          <div className="flex items-center gap-2">
            <span className="text-xl">⚙️</span>
            <h3 className="font-semibold text-gray-800 text-lg">Advanced Processing Options      <span className= "text-green-600" > Optimized </span> </h3>
          </div>
          <span className={`text-gray-600 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </button>
        
        {showAdvanced && (
          <div className="p-5 border-t-2 border-gray-200 bg-white">
            <div className="mb-6 p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg border-2 border-gray-200 cursor-pointer">
                <input type="checkbox" checked={removeWaters} onChange={(e) => setRemoveWaters(e.target.checked)} className="mt-1" />
                <div className="flex-1">
                  <div className="font-medium text-gray-800">Remove Waters</div>
                  <div className="text-xs text-gray-600 mt-1">Water-mediated interactions</div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg border-2 border-gray-200 cursor-pointer">
                <input type="checkbox" checked={removeIons} onChange={(e) => setRemoveIons(e.target.checked)} className="mt-1" />
                <div className="flex-1">
                  <div className="font-medium text-gray-800">Remove Ions</div>
                  <div className="text-xs text-gray-600 mt-1">Metal complexes</div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg border-2 border-gray-200 cursor-pointer">
                <input type="checkbox" checked={addHydrogens} onChange={(e) => setAddHydrogens(e.target.checked)} className="mt-1" />
                <div className="flex-1">
                  <div className="font-medium text-gray-800">Add Hydrogens</div>
                  <div className="text-xs text-gray-600 mt-1">Required for H-bonds</div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg border-2 border-gray-200 cursor-pointer">
                <input type="checkbox" checked={keepHetero} onChange={(e) => setKeepHetero(e.target.checked)} className="mt-1" />
                <div className="flex-1">
                  <div className="font-medium text-gray-800">Keep Heteroatoms</div>
                  <div className="text-xs text-gray-600 mt-1">Ligands & cofactors</div>
                </div>
              </label>
            </div>
          </div>
        )}
      </section>

      {/* SUBMIT */}
      <button
        onClick={handleSubmit}
        disabled={isWorking}
        className="w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-lg rounded-xl disabled:opacity-60 shadow-lg"
      >
        {isWorking ? "🔄 Running Analysis..." : "▶️ Run PLIP Analysis"}
      </button>

      {isWorking && (
        <div className="w-full bg-gray-200 h-3 rounded-full overflow-hidden">
          <div style={{ width: `${progress}%` }} className="h-3 bg-gradient-to-r from-green-400 via-blue-500 to-purple-500 transition-all" />
        </div>
      )}

      {status && (
        <div className={`text-center p-3 rounded-lg ${status.includes('Error') ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
          {status}
        </div>
      )}

      {/* RESULTS */}
      {results && results.results && results.results.length > 0 && (
        <section className="mt-6 space-y-6">
          {/* SUMMARY HEADER */}
          <div className="p-6 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border-2 border-green-400">
            <h3 className="font-bold text-2xl text-gray-800 mb-2">☑️ Analysis Complete</h3>
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

          {/* RESULTS BY COMBINATION */}
          <div className="space-y-6">
            <h3 className="font-bold text-xl text-gray-800 flex items-center gap-2">
               Detailed Results by Combination ({results.results.length})
            </h3>

            {results.results.map((combo, comboIdx) => (
              <div key={comboIdx} className="bg-white rounded-2xl border-2 border-gray-300 shadow-lg overflow-hidden">
                <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-xxl text-white">
                      🧬 {combo.receptor || 'Unknown'} × 💊 {combo.ligand || 'Unknown'}
                    </h4>
                    <div className="flex gap-4 text-white text-sm">
                      <div className="bg-white/20 px-3 py-1 rounded-full">
                        ☑️ Analyzed: {combo.poses_analyzed || 0}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  {!combo.poses || combo.poses.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <p className="text-lg">⚠️ No poses were analyzed for this combination</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {combo.poses.map((pose) => (
                        <div key={pose.pose} className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border-2 border-gray-300 overflow-hidden shadow hover:shadow-lg transition min-w-0">
                          <div className="bg-gradient-to-r from-indigo-500 to-blue-500 px-4 py-3 flex items-center justify-between">
                            <h5 className="font-bold text-white text-center text-lg">
                              🎯 Pose {pose.pose}
                            </h5>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={selectedPosesFor3D.includes(`${comboIdx}-${pose.pose}`)}
                                onChange={() => toggle3DPoseSelection(comboIdx, pose.pose)}
                                className="w-5 h-5 cursor-pointer"
                              />
                              <span className="text-white text-sm font-medium">3D</span>
                            </label>
                          </div>

                          <div className="p-4 space-y-3">
                            {pose.csv_files && pose.csv_files.length > 0 && (
                              <div>
                                <p className="font-semibold text-sm text-gray-700 mb-2">📊 CSV ({pose.csv_files.length})</p>
                                <div className="space-y-1">
                                  {pose.csv_files.map((file, i) => (
                                    <button
                                      key={i}
                                      onClick={() => downloadFile(pose.folder, file)}
                                      className="w-full px-3 py-2 bg-green-50 hover:bg-green-100 border border-green-300 rounded-lg text-xs text-left transition"
                                    >
                                      📄 {file}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {pose.json_files && pose.json_files.length > 0 && (
                              <div>
                                <p className="font-semibold text-sm text-gray-700 mb-2">🔷 JSON ({pose.json_files.length})</p>
                                <div className="space-y-1">
                                  {pose.json_files.map((file, i) => (
                                    <button
                                      key={i}
                                      onClick={() => downloadFile(pose.folder, file)}
                                      className="w-full px-3 py-2 bg-blue-50 hover:bg-blue-100 border border-blue-300 rounded-lg text-xs text-left transition"
                                    >
                                      📋 {file}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* 3D VISUALIZATION */}
          {selectedPosesFor3D.length > 0 && (
            <div className="mt-8 space-y-4">
              <div className="flex items-center justify-between bg-gradient-to-r from-purple-50 to-indigo-50 p-4 rounded-xl border-2 border-purple-300">
                <div>
                  <h3 className="font-bold text-2xl text-gray-800">🔬 3D Structure Viewer</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Selected {selectedPosesFor3D.length} pose{selectedPosesFor3D.length > 1 ? 's' : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  {!show3DViewer ? (
                    <button
                      onClick={init3DViewers}
                      className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold rounded-lg shadow-lg"
                    >
                      🚀 Load 3D Structures
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setShow3DViewer(false);
                        setSelectedPosesFor3D([]);
                        viewerRefs.current = {};
                      }}
                      className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-lg shadow-lg"
                    >
                      ✖️ Close Viewers
                    </button>
                  )}
                </div>
              </div>

              {show3DViewer && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {selectedPosesFor3D.map(key => {
                    const [comboIdx, poseNum] = key.split('-');
                    const combo = results.results[parseInt(comboIdx)];
                    const pose = combo.poses.find(p => p.pose === parseInt(poseNum));
                    
                    return (
                      <div key={key} className="bg-white rounded-xl border-2 border-purple-300 overflow-hidden shadow-lg">
                        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2">
                          <p className="text-white font-bold text-sm">
                            {combo.receptor} × {combo.ligand} - Pose {poseNum}
                          </p>
                        </div>
                        <div
                          id={`viewer-${key}`}
                          className="w-full h-96 bg-gray-50 relative"
                          style={{ position: 'relative' }}
                        />
                        <div className="p-3 bg-gradient-to-br from-gray-50 to-gray-100 border-t-2 border-gray-200">
                          <p className="text-xs text-gray-700 font-bold mb-3 flex items-center gap-2">
                            🖱️ Controls: <span className="font-normal">L-click: Rotate | Scroll: Zoom | R-click: Pan</span>
                          </p>
                          <div className="bg-white p-3 rounded-lg border border-gray-300">
                            <p className="text-xs font-bold text-gray-800 mb-2">🔬 Interaction Legend:</p>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="flex items-center gap-2">
                                <div className="w-4 h-0.5 bg-blue-500 border-t-2 border-dashed border-blue-600"></div>
                                <span className="font-medium">🔵 H-bonds</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-4 h-0.5 bg-gray-500 border-t-2 border-dashed border-gray-600"></div>
                                <span className="font-medium">⚫ Hydrophobic</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-4 h-1 bg-orange-500 rounded"></div>
                                <span className="font-medium">🟠 Salt bridges</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-4 h-0.5 bg-green-500 border-t-2 border-dashed border-green-600"></div>
                                <span className="font-medium">🟢 π-stacking</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-4 h-0.5 bg-cyan-400 border-t-2 border-dashed border-cyan-500"></div>
                                <span className="font-medium">🔷 Halogen bonds</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-4 h-1 bg-purple-500 rounded"></div>
                                <span className="font-medium">🟣 Metal complexes</span>
                              </div>
                            </div>
                            <div className="mt-3 pt-2 border-t border-gray-200">
                              <p className="text-xs text-gray-600">
                                <span className="font-semibold">Protein:</span> <span className="text-gray-400">Gray cartoon + colored sticks (binding site)</span>
                              </p>
                              <p className="text-xs text-gray-600 mt-1">
                                <span className="font-semibold">Ligand:</span> <span className="text-green-600 font-bold">Green ball-and-stick</span>
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
