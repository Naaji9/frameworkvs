import { useState,  useRef } from "react";
import axios from 'axios';
import { useEffect } from "react";


export default function NewDocking() {
    const ligandFileRef = useRef(null);
    const receptorFileRef = useRef(null);

    const [basePath, setBasePath] = useState(localStorage.getItem("basePath") || "");
    const [showBasePathModal, setShowBasePathModal] = useState(!localStorage.getItem("basePath"));

// we only need the arrays; if you still want a preview of “the first” file, you can derive it.
    const [ligandFiles,   setLigandFiles]   = useState([]);
    const [receptorFiles, setReceptorFiles] = useState([]);
    const [showAllLigands, setShowAllLigands] = useState(false);
    const [showAllReceptors, setShowAllReceptors] = useState(false);
    const [isBlindDocking, setIsBlindDocking] = useState(false);
    const [viewerMode, setViewerMode] = useState("cartoon");
    const [isRunning, setIsRunning] = useState(false);
    const [runJobId, setRunJobId] = useState(null);
    const runPollRef = useRef(null); // to keep interval id
    const [installingTool, setInstallingTool] = useState(null);
    const [ligandPathStatus, setLigandPathStatus] = useState({ valid: true, reason: "", bad_part: "" });
     const [receptorPathStatus, setReceptorPathStatus] = useState({ valid: true, reason: "", bad_part: "" });
    const [terminalOutput, setTerminalOutput] = useState([]);
    const [runProgress, setRunProgress] = useState(0);
    const [runStatus, setRunStatus] = useState("idle");
    const [installLog, setInstallLog] = useState("");
    const [showTerminal, setShowTerminal] = useState(false);
    const terminalRef = useRef(null);
    const [dependencies, setDependencies] = useState({
     vina: false,
     openbabel: false,
     mgltools: false,
     python: true,
     local_generator: false
    });





// (optional) keep single‑file refs for NGL preview:
    const ligandFile = ligandFiles[0] || null;
    const receptorFile = receptorFiles[0] || null;


    const [ligandPath, setLigandPath] = useState("");
    const [receptorPath, setReceptorPath] = useState("");
    const [outputFolder, setOutputFolder] = useState("");
    const [varyGridBox, setVaryGridBox] = useState(false);
    const [box, setBox] = useState({
      centerX: "", centerY: "", centerZ: "",
      sizeX: "", sizeY: "", sizeZ: "",  
      stepX: "", stepY: "", stepZ: "",
      countX: "", countY: "", countZ: ""
    });
    
    const [exhaustiveness, setExhaustiveness] = useState(8);
    const [topbest, setTopbest] = useState(10);
    const [cpuCores, setCpuCores] = useState(0); //0 = use all 
    const [isLoading, setIsLoading] = useState(false);
    const [errors, setErrors] = useState({});
    const [isInitialSet, setIsInitialSet] = useState(!!localStorage.getItem("basePath"));
    const [chunkMode, setChunkMode] = useState("no");
    const [systemCpu, setSystemCpu] = useState(0);
    const [userCpu, setUserCpu] = useState(0);
    const [vinaThreads, setVinaThreads] = useState(0);
    const [recommendedVina, setRecommendedVina] = useState(0);
    const [cpuRecommendation, setCpuRecommendation] = useState({
      vinaCores: 0,
      maxWorkers: 0,
      totalUsage: 0,
      warning: "",
      overrideWarning: false,
      overrideDetail: ""
    });




useEffect(() => {
  const storedPath = localStorage.getItem("basePath");
  if (storedPath) {
    setBasePath(storedPath);
    setIsInitialSet(true);
  }
}, []);

const handleBasePathConfirm = () => {
  if (basePath.trim() !== "") {
    localStorage.setItem("basePath", basePath.trim());
    setIsInitialSet(true);
    setShowBasePathModal(false);
  }
};

const resetBasePath = () => {
  const stored = localStorage.getItem("basePath") || "";
  setBasePath(stored);
  setShowBasePathModal(true);
};


const validatePathLive = async (path, setter) => {
  const safePath = normalizeEnteredPath(path);

  try {
    const res = await axios.get("http://127.0.0.1:8000/validate-path", {
      params: { path: safePath },
    });
    setter(res.data);
  } catch {
    setter({ valid: false, reason: "Backend unreachable", bad_part: "" });
  }
};

const normalizeEnteredPath = (p) => {
  if (!p.startsWith("/")) {
    return "/" + p;
  }
  return p;
};


// ✅ UPDATED VALIDATION WITH AUTO-SCROLL
const validateForm = () => {
  const newErrors = {};
  let firstErrorField = null;

  // ligand required
  if (!ligandFiles.length) {
    newErrors.ligandPath = "Please select at least one ligand file/folder";
    firstErrorField = "ligand-section";
  } else if (!ligandPath) {
    newErrors.ligandPath = "Ligand Path is required";
    firstErrorField = "ligand-section";
  }

  // receptor required
  if (!receptorFiles.length) {
    newErrors.receptorPath = "Please select at least one receptor file/folder";
    if (!firstErrorField) firstErrorField = "receptor-section";
  } else if (!receptorPath) {
    newErrors.receptorPath = "Receptor Path is required";
    if (!firstErrorField) firstErrorField = "receptor-section";
  }

  setErrors(newErrors);

  // 🔥 Auto-scroll to error
  if (firstErrorField) {
    const el = document.getElementById(firstErrorField);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    return false;
  }

  return Object.keys(newErrors).length === 0;
};

const renderHighlightedPath = (path, badPart) => {
  if (!badPart || badPart === "" || !path.includes(badPart)) return (
    <span className="text-green-600">{path}</span>
  );

  const [before, after] = path.split(badPart);

  return (
    <span>
      <span className="text-green-600">{before}</span>
      <span className="text-red-600 underline font-bold">{badPart}</span>
      <span className="text-green-600">{after}</span>
    </span>
  );
};



const handleBlindDockingToggle = async (e) => {
  const checked = e.target.checked;
  setIsBlindDocking(checked);

  if (!checked || receptorFiles.length === 0) return;

  try {
    const formData = new FormData();
    receptorFiles.forEach((file) => {
      formData.append("receptor_files", file);
    });

    const res = await axios.post(
      "http://127.0.0.1:8000/docking/calculate-blind-box",
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
      }
    );

    const { center_x, center_y, center_z, size_x, size_y, size_z } = res.data;

    setBox((prev) => ({
      ...prev,
      centerX: center_x,
      centerY: center_y,
      centerZ: center_z,
      sizeX: size_x,
      sizeY: size_y,
      sizeZ: size_z,
    }));

    alert("✅ Blind docking box calculated and set.");
  } catch (err) {
    console.error("Blind docking error:", err);
    alert(
      "❌ Failed to compute blind docking box: " +
        (err.response?.data?.detail || err.message)
    );
  }
};


const handleSubmit = async () => {
  if (!validateForm()) return;

  const ok = window.confirm(
    `⚠️ Confirm these paths:\n\nLigand: ${ligandPath}\nReceptor: ${receptorPath}\nOutput: ${outputFolder}\n\nContinue?`
  );
  if (!ok) return;

  setIsLoading(true);

  try {
    const formData = buildFormData();

    const response = await axios.post(
      "http://127.0.0.1:8000/docking/generate-script",
      formData,
      {
        responseType: "blob",
      }
    );

    const blob = new Blob([response.data], { type: "text/plain" });
    const url = window.URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "vsframework.py";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    window.URL.revokeObjectURL(url);

    alert("Script downloaded successfully!");
  } catch (e) {
    console.error("Generate script error:", e);
    alert("❌ Script generation failed.");
  }

  setIsLoading(false);
};




  useEffect(() => {
    if (systemCpu > 0 && userCpu > 0) {
      const budget = Math.min(systemCpu, userCpu);
      let vinaCores = 1;
      if (budget >= 32) vinaCores = 4;
      else if (budget >= 16) vinaCores = 3;
      else if (budget >= 8) vinaCores = 2;

      const maxWorkers = Math.max(1, Math.floor(budget / vinaCores));
      const totalUsage = vinaCores * maxWorkers;

      setRecommendedVina(vinaCores);
      setCpuRecommendation({
        vinaCores,
        maxWorkers,
        totalUsage,
        warning: userCpu > systemCpu ? `⚠️ You requested ${userCpu}, but only ${systemCpu} are available. Using ${budget}.` : "",
        overrideWarning: false,
        overrideDetail: ""
      });

      setVinaThreads(vinaCores);
    }
  }, [systemCpu, userCpu]);



useEffect(() => {
  if (terminalRef.current) {
    terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }
}, [terminalOutput]);


  useEffect(() => {
    if (vinaThreads > 0 && userCpu > 0) {
      const maxWorkers = Math.max(1, Math.floor(userCpu / vinaThreads));
      const totalUsage = vinaThreads * maxWorkers;
      const isOverride = vinaThreads !== recommendedVina;
      const overrideTooHigh = vinaThreads > recommendedVina;

      setCpuRecommendation((prev) => ({
        ...prev,
        vinaCores: vinaThreads,
        maxWorkers,
        totalUsage,
        overrideWarning: isOverride,
        overrideDetail: isOverride
          ? `⚠️ You set Vina threads to ${vinaThreads} (recommended: ${recommendedVina}).` +
            (overrideTooHigh ? ` This may reduce parallel efficiency.` : ` You reduced the thread count below recommendation.`)
          : ""
      }));
    }
  }, [vinaThreads]);

  // Build the same FormData used for both Generate and Run
const buildFormData = () => {
  const formData = new FormData();

  formData.append("ligand_folder", ligandPath);
  formData.append("receptor_folder", receptorPath);

  formData.append("center_x", box.centerX);
  formData.append("center_y", box.centerY);
  formData.append("center_z", box.centerZ);
  formData.append("size_x", box.sizeX);
  formData.append("size_y", box.sizeY);
  formData.append("size_z", box.sizeZ);

  if (varyGridBox) {
    formData.append("box_step_x", box.stepX);
    formData.append("box_step_y", box.stepY);
    formData.append("box_step_z", box.stepZ);
    formData.append("box_count_x", box.countX);
    formData.append("box_count_y", box.countY);
    formData.append("box_count_z", box.countZ);
  }

  formData.append("exhaustiveness", exhaustiveness);
  formData.append("user_cpu", userCpu);
  formData.append("vina_cores", vinaThreads);
  formData.append("topbest", topbest);
  formData.append("chunk_mode", chunkMode);
  formData.append("max_workers", cpuRecommendation.maxWorkers);

  formData.append("output_path", outputFolder || "outputs/vsframework.py");
  formData.append("blind_docking", isBlindDocking);

  return formData;
};

const startPollingJob = (jobId) => {
  setShowTerminal(true);   // ⬅️ open popup when polling starts

  const interval = setInterval(async () => {
    try {
      const res = await axios.get(`http://localhost:5005/run-status/${jobId}`);
      const data = res.data;

      setRunStatus(data.status);
      setRunProgress(data.progress);

      if (data.log_tail) {
        setTerminalOutput((prev) => [...prev, ...data.log_tail]);
      }

      if (data.status === "finished" || data.status === "failed") {
        clearInterval(interval);
      }
    } catch (err) {
      clearInterval(interval);
    }
  }, 1000);
};


// Add this helper near other functions
const uploadFilesToLocalBackend = async () => {
  // must have files selected via browse controls (ligandFiles and receptorFiles)
  if ((!ligandFiles || ligandFiles.length === 0) && (!receptorFiles || receptorFiles.length === 0)) {
    throw new Error("No files selected for upload.");
  }

  const form = new FormData();
  // send as "ligands" / "receptors" fields (supports multiple)
  ligandFiles.forEach((f) => form.append("ligands", f));
  receptorFiles.forEach((f) => form.append("receptors", f));

  const res = await axios.post("http://localhost:5005/upload-run-files", form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 0, // uploads can be large; avoid short timeouts
  });

  return res.data; // contains job_id, ligand_dir, receptor_dir
};

const handleRun = async () => {
  if (!validateForm()) return;

  setTerminalOutput([]);  // clear old logs
  setShowTerminal(true);  // show popup immediately
  setIsRunning(true);
  setRunStatus("queued");
  setRunProgress(0);

  let uploadJob = null;
  try {
    // 0) Upload browse-selected files to local backend
    uploadJob = await uploadFilesToLocalBackend();
    // uploadJob: { job_id, job_dir, ligand_dir, receptor_dir, ... }
    console.log("Uploaded files to local backend:", uploadJob);

    // 1) Build FormData for script generation but use backend paths for ligand/receptor
    // NOTE: keep output_path as user-entered outputFolder (unchanged)
    const genForm = new FormData();
    genForm.append("ligand_folder", uploadJob.ligand_dir);   // <-- backend path
    genForm.append("receptor_folder", uploadJob.receptor_dir); // <-- backend path

    genForm.append("center_x", box.centerX);
    genForm.append("center_y", box.centerY);
    genForm.append("center_z", box.centerZ);
    genForm.append("size_x", box.sizeX);
    genForm.append("size_y", box.sizeY);
    genForm.append("size_z", box.sizeZ);

    if (varyGridBox) {
      genForm.append("box_step_x", box.stepX);
      genForm.append("box_step_y", box.stepY);
      genForm.append("box_step_z", box.stepZ);
      genForm.append("box_count_x", box.countX);
      genForm.append("box_count_y", box.countY);
      genForm.append("box_count_z", box.countZ);
    }

    genForm.append("exhaustiveness", exhaustiveness);
    genForm.append("user_cpu", userCpu);
    genForm.append("vina_cores", vinaThreads);
    genForm.append("topbest", topbest);
    genForm.append("chunk_mode", chunkMode);
    genForm.append("max_workers", cpuRecommendation.maxWorkers);

    genForm.append("output_path", outputFolder || "outputs/vsframework.py");
    genForm.append("blind_docking", isBlindDocking);

    // 2) Ask SERVER backend to generate script TEXT but using backend paths
    const genRes = await axios.post(
      "http://127.0.0.1:8000/docking/generate-script-text",
      genForm
    );

    const scriptText = genRes.data.script_text;
    if (!scriptText) {
      throw new Error("Server backend did not return script text.");
    }

    // 3) Send script text to LOCAL backend to run it
    const runForm = new FormData();
    runForm.append("script_content", scriptText);

    // Optionally pass the upload job_id so the local backend could correlate
    runForm.append("upload_job_id", uploadJob.job_id || "");

    const runRes = await axios.post(
      "http://localhost:5005/run-script",
      runForm,
      { timeout: 0 } // script can take a long time
    );

    const jobId = runRes.data.job_id;
    setRunJobId(jobId);

    alert("🚀 Docking started locally.");
    // 4) Start polling the local backend
    startPollingJob(jobId);

    // Optional: poll for completion and then cleanup upload files
    const autoCleanup = setInterval(async () => {
      try {
        const st = await axios.get(`http://localhost:5005/run-status/${jobId}`);
        if (st.data && (st.data.status === "finished" || st.data.status === "failed" || st.data.status === "canceled")) {
          clearInterval(autoCleanup);
          // delete uploaded files now that the run is finished
          if (uploadJob && uploadJob.job_id) {
            try {
              await axios.delete(`http://localhost:5005/cleanup/${uploadJob.job_id}`);
              console.log("Upload job cleaned:", uploadJob.job_id);
            } catch (err) {
              console.warn("Failed to cleanup upload job:", err);
            }
          }
        }
      } catch (e) {
        clearInterval(autoCleanup);
      }
    }, 2000);

  } catch (err) {
    setIsRunning(false);
    console.error("Run failed", err);
    // If upload happened but run failed, try cleanup
    try {
      if (uploadJob && uploadJob.job_id) {
        await axios.delete(`http://localhost:5005/cleanup/${uploadJob.job_id}`);
      }
    } catch (cleanupErr) {
      console.warn("cleanup failed", cleanupErr);
    }
    alert("❌ Run failed: " + (err.response?.data?.detail || err.message));
  }
};


useEffect(() => {
  async function checkDeps() {
    try {
      const res = await axios.get("http://localhost:5005/check-dependencies");

      // backend might return { checks: {...} } or { vina: true, ... }
      const checks = (res.data && (res.data.checks || res.data)) || {};
      setDependencies(checks);
    } catch (e) {
      console.warn("Local backend not running.");
      // keep safe defaults but mark local backend absent by setting null or keeping defaults
      setDependencies({
        vina: false,
        openbabel: false,
        mgltools: false,
        python: true,
        local_generator: false
      });
    }
  }

  checkDeps();
}, []);


useEffect(() => {
  if (!window.$3Dmol) {
    console.warn("3Dmol.js not loaded.");
    return;
  }

  const getFormat = (filename) => {
    const ext = filename.split(".").pop().toLowerCase();
    const map = { pdb: "pdb", pdbqt: "pdbqt", mol2: "mol2", sdf: "sdf", cif: "cif", xyz: "xyz" };
    return map[ext] || "pdb";
  };

  const element = document.getElementById("Viewer3D");
  if (!element) {
    console.warn("Viewer3D element not found");
    return;
  }

  const viewer = window.$3Dmol.createViewer(element, { backgroundColor: "white" });
  viewer.clear();
  viewer.resize();

  const smoothCenter = (target) => {
    try {
      viewer.zoomTo(target);
      viewer.zoom(0.1, 500);
      viewer.render();
    } catch (err) {
      console.warn("smoothCenter failed:", err);
    }
  };

  // FIXED: Make this function async
  const simplifyReceptor = async (text) => {
    try {
      // If file is small enough, return as-is
      if (text.length < 2_000_000 && text.split("\n").length < 15000) {
        return text;
      }

      console.log(`Processing large receptor file: ${text.length} chars, ${text.split('\n').length} lines`);
      
      const lines = text.split("\n");
      let processedLines = [];
      let lineCount = 0;
      
      // Process in chunks to avoid memory issues
      const chunkSize = 5000;
      for (let i = 0; i < lines.length; i += chunkSize) {
        const chunk = lines.slice(i, i + chunkSize);
        
        for (const line of chunk) {
          // Skip non-ATOM lines for large files
          if (!line.startsWith("ATOM") && !line.startsWith("HETATM")) continue;
          
          const atom = line.slice(12, 16).trim();
          const res = line.slice(17, 20).trim();
          
          // Remove hydrogen atoms
          if (atom.startsWith("H")) continue;
          
          // For very large structures, apply more aggressive filtering
          if (lines.length > 50000) {
            const simpleResidues = ["ALA","GLY","VAL","LEU","ILE","MET","PHE","TYR","TRP","PRO","SER","THR","CYS","ASN","GLN","LYS","ARG","HIS","ASP","GLU"];
            if (simpleResidues.includes(res)) {
              // Only keep backbone atoms for common residues
              if (["N","CA","C","O"].includes(atom)) {
                processedLines.push(line);
                lineCount++;
              }
            } else {
              // Keep all heavy atoms for uncommon residues
              processedLines.push(line);
              lineCount++;
            }
          } else {
            // For moderately large files, keep all heavy atoms
            processedLines.push(line);
            lineCount++;
          }
          
          // Safety limit for extremely large files
          if (lineCount > 100000) {
            console.warn("Reached safety limit of 100,000 atoms");
            break;
          }
        }
        
        // Give browser a chance to breathe - FIXED: now await works
        if (i % 20000 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
      
      console.log(`Simplified from ${lines.length} to ${processedLines.length} lines`);
      return processedLines.join("\n");
      
    } catch (error) {
      console.error("Error in simplifyReceptor:", error);
      // Return empty but valid structure if processing fails
      return "HEADER\nTITLE\nSimplified Structure\nEND";
    }
  };

  const simplifyLigand = (text) => {
    try {
      return text.split("\n").filter(line => {
        if (!line.startsWith("ATOM") && !line.startsWith("HETATM")) return false;
        return !line.slice(12,16).trim().startsWith("H");
      }).join("\n");
    } catch (error) {
      console.error("Error in simplifyLigand:", error);
      return text;
    }
  };

  const receptorModels = [];
  let lastFocusedModel = null;
  let loadingErrors = [];

  // FIXED: Improved file loading with better error handling
  const loadFiles = async () => {
    // Load receptors
    for (const file of receptorFiles) {
      try {
        if (file.size > 50 * 1024 * 1024) { // 50MB limit
          console.warn(`File ${file.name} is too large (${(file.size / 1024 / 1024).toFixed(2)}MB), skipping`);
          loadingErrors.push(`${file.name} is too large (>50MB)`);
          continue;
        }

        const text = await readFileAsText(file);
        const simplifiedText = await simplifyReceptor(text); // FIXED: await the async function
        
        if (!simplifiedText || simplifiedText.trim().length === 0) {
          console.warn(`No valid atoms found in ${file.name} after simplification`);
          continue;
        }

        const format = getFormat(file.name);
        const model = viewer.addModel(simplifiedText, format);
        receptorModels.push(model);

        if (viewerMode === "surface") {
          model.setStyle({}, { cartoon: { color: "spectrum" } });
        } else {
          model.setStyle({}, {
            cartoon: { color: "spectrum" },
            stick: { radius: 0.15, colorscheme: "element" }
          });
        }

        lastFocusedModel = model;
        
      } catch (err) {
        console.error("Error loading receptor:", file.name, err);
        loadingErrors.push(`Failed to load ${file.name}`);
      }
    }

    // Load ligands
    for (const file of ligandFiles) {
      try {
        const text = await readFileAsText(file);
        const simplifiedText = simplifyLigand(text);
        const format = getFormat(file.name);

        const model = viewer.addModel(simplifiedText, format);
        if (model.center) model.center();

        model.setStyle({}, {
          stick: { radius: 0.8, colorscheme: "element" },
          sphere: { scale: 0.4, colorscheme: "element" }
        });

        lastFocusedModel = model;
        
      } catch (err) {
        console.error("Error loading ligand:", file.name, err);
        loadingErrors.push(`Failed to load ligand ${file.name}`);
      }
    }

    // Add surface if needed
    if (viewerMode === "surface" && receptorModels.length > 0) {
      try {
        receptorModels.forEach((m) => {
          viewer.addSurface(
            window.$3Dmol.SurfaceType.MS,
            { opacity: 0.7, color: "skyblue" },
            m
          );
        });
      } catch (surfaceError) {
        console.warn("Could not generate surface:", surfaceError);
      }
    }

    // Add grid box
    try {
      const cx = parseFloat(box.centerX);
      const cy = parseFloat(box.centerY);
      const cz = parseFloat(box.centerZ);
      const sx = parseFloat(box.sizeX);
      const sy = parseFloat(box.sizeY);
      const sz = parseFloat(box.sizeZ);
      
      if ([cx,cy,cz,sx,sy,sz].every(v => !isNaN(v))) {
        viewer.addBox({
          center: { x: cx, y: cy, z: cz },
          dimensions: { w: sx, h: sy, d: sz },
          color: "yellow",
          opacity: 0.7
        });
      }
    } catch (boxError) {
      console.warn("Could not add box:", boxError);
    }

    // Final render
    viewer.render();
    if (lastFocusedModel) {
      smoothCenter(lastFocusedModel);
    } else if (receptorModels.length > 0) {
      smoothCenter(receptorModels[0]);
    } else {
      smoothCenter({});
    }

    // Show errors to user
    if (loadingErrors.length > 0) {
      console.warn("Loading errors:", loadingErrors);
      // You can display these errors to the user in your UI
      // setErrors(loadingErrors);
    }
  };

  // Helper function to read file as text with Promise
  const readFileAsText = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });
  };

  loadFiles();

}, [ligandFiles, receptorFiles, box, viewerMode]);















    const handleBoxFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target.result;
      const lines = content.split('\n');

      const values = {};
      lines.forEach(line => {
        const [key, val] = line.split('=');
        if (key && val) {
          values[key.trim()] = parseFloat(val.trim());
        }
      });

      setBox(prev => ({
        ...prev,
        centerX: values.center_x ?? prev.centerX,
        centerY: values.center_y ?? prev.centerY,
        centerZ: values.center_z ?? prev.centerZ,
        sizeX: values.size_x ?? prev.sizeX,
        sizeY: values.size_y ?? prev.sizeY,
        sizeZ: values.size_z ?? prev.sizeZ,
      }));

      if (values.exhaustiveness !== undefined) {
        setExhaustiveness(values.exhaustiveness);
      }

      alert("☑️ Box file loaded successfully.");
    };
    reader.readAsText(file);
  };
 
const installDependency = async (toolName) => {
  setInstallingTool(toolName);
  setInstallLog("Starting installation...");

  try {
    const res = await axios.post(
      `http://localhost:5005/install-dependency?name=${toolName}`
    );
    const installId = res.data.install_id;

    // poll every 2 sec
    const poll = setInterval(async () => {
      try {
        const status = await axios.get(
          `http://localhost:5005/install-status/${installId}`
        );

        setInstallLog(status.data.log_tail);

        if (status.data.status === "done") {
          clearInterval(poll);
          setInstallingTool(null);

          // re-check dependencies
          const res2 = await axios.get("http://localhost:5005/check-dependencies");
          setDependencies(res2.data.checks);

          alert(`✔ ${toolName} installed successfully.`);
        }

        if (status.data.status === "failed") {
          clearInterval(poll);
          setInstallingTool(null);
          alert(`❌ Failed to install ${toolName}`);
        }

      } catch (err) {
        clearInterval(poll);
      }
    }, 2000);

  } catch (err) {
    setInstallingTool(null);
    setInstallLog("Installation failed to start.");
  }
};

const handleGenerateScript = async () => {
  try {
    if (!validateForm()) return;

    setIsLoading(true);

    const formData = buildFormData();

    const response = await axios.post(
      "http://127.0.0.1:8000/docking/generate-script",
      formData,
      { responseType: "blob" }   // 🔥 REQUIRED FOR DOWNLOAD
    );

    const blob = new Blob([response.data], { type: "text/plain" });
    const url = window.URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "vsframework.py";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    window.URL.revokeObjectURL(url);

    setIsLoading(false);
  } catch (err) {
    setIsLoading(false);
    console.error("Script generation failed:", err);
    alert("❌ Failed to generate script: " + (err.response?.data?.detail || err.message));
  }
};



  return (
    <>
      {showBasePathModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-black rounded-lg p-6 w-full max-w-md shadow-xl">
            <h3 className="text-xl font-bold mb-4 text-blue-700">📂 Set Your Base Directory</h3>
            <p className="text-sm text-gray-500 mb-3">
              Please enter the full folder path where your ligand and receptor files are stored.
              We'll use this to construct the full file paths in the generated script.
            </p>
            <input
              type="text"
              className="w-full p-3 border border-gray-300 rounded-md mb-4"
              value={basePath}
              onChange={(e) => setBasePath(e.target.value)}
              placeholder="/home/username/docking"
            />
            <p className="text-xs text-gray-400 mt-1">
              You can update this path anytime.
            </p>
            <div className="flex justify-end gap-4">
              <button
                className="bg-gray-300 px-4 py-2 rounded-md hover:bg-gray-400"
                onClick={() => setShowBasePathModal(false)}
              >
                Cancel
              </button>
              <button
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
                onClick={handleBasePathConfirm}
              >
                {basePath.trim() ? "Update" : "Confirm"}


              </button>
            </div>
          </div>
        </div>
      )}
    {/* Change Path link - top right */}
    <div className="absolute top-24 right-8 z-10">
    <p
      className="text-sm text-blue-600 cursor-pointer underline hover:text-blue-800"
      onClick={resetBasePath}
    >
      🔄 Change Base Path
    </p>
  </div>
    
    <div className="min-h-screen bg-gradient-to-br from-white to-blue-80 pt-28 pb-10 px-4">
      <div className="max-w-5xl mx-auto border-2 border-blue-400 dark:border-blue-700 bg-white/30 backdrop-blur-md rounded-2xl shadow-2xl p-8 sm:p-10 bg-white">


        <h2 className="text-3xl font-bold text-blue-700 text-center mb-8">
          {/* 🧬 */} New Docking Configuration 
        </h2>

{/* Ligand */}
<div id="ligand-section" className="mb-8">
  <div className="flex justify-between mb-2">
    <label className="text-lg font-semibold text-blue-700">🔗 Ligand Path</label>
    <span className="text-sm text-gray-500">Supported: .pdb, .mol2, .pdbqt, .sdf</span>
  </div>

  {/* Input + green/red icon */}
  <div className="relative mb-1">
    <input
      type="text"
      value={ligandPath}
      onChange={(e) => {
        const p = e.target.value.replace(/\/+/g, "/");
        setLigandPath(p);
        validatePathLive(p, setLigandPathStatus);
      }}
      placeholder="Paste ligand path or use browse below"
      className={`w-full p-3 border rounded-md shadow-sm transition-all ${
        ligandPathStatus.valid ? "border-green-500" : "border-red-500 bg-red-50"
      } focus:ring-2 focus:ring-blue-400`}
    />

    {/* ✓ or ✖ */}
    <span className="absolute right-3 top-3 text-lg">
      {ligandPathStatus.valid ? (
        <span className="text-green-600">✔</span>
      ) : (
        <span className="text-red-600">✖</span>
      )}
    </span>
  </div>


  {/* Error message */}
  {!ligandPathStatus.valid && (
    <p className="text-red-500 text-sm mt-1">{ligandPathStatus.reason}</p>
  )}

  {/* Hidden inputs */}
  <input
    type="file"
    accept=".pdb,.mol2,.pdbqt,.sdf"
    hidden
    ref={(el) => (window.ligandFileInput = el)}
    onChange={(e) => {
      const file = e.target.files[0];
      if (file) {
        
        const fullPath = file.path || `${basePath}/${file.name}`;
        setLigandPath(fullPath);
        setLigandFiles([file]); // Fix: wrap single file in array!
    
        //  Auto-set output folder if not already filled
        if (!outputFolder) {
          const parentDir = fullPath.substring(0, fullPath.lastIndexOf("/"));
          setOutputFolder(parentDir);

    
        }
      }
    }}
  />
  <input
    type="file"
    hidden
    webkitdirectory="true"
    directory=""
    ref={(el) => (window.ligandFolderInput = el)}
    onChange={(e) => {
      const files = e.target.files;
      if (files.length > 0) {
        const fileArray = Array.from(files);
        setLigandFiles(fileArray);

        //  Extract folder name from first file path
        const folderName = files[0].webkitRelativePath.split("/")[0];
  
        //  Construct full path from basePath
        const fullPath = `${basePath}/${folderName}`;
              //  Filter supported formats
        const validExts = [".pdbqt", ".pdb",".mol2", ".sdf"];
        const filtered = Array.from(files).filter(file =>
          validExts.includes(file.name.toLowerCase().slice(file.name.lastIndexOf(".")))
        );
        setLigandFiles(filtered);
  
        setLigandPath(fullPath);
  
        //  Optional: auto-fill output folder if empty
        if (!outputFolder) {
          setOutputFolder(fullPath);
        }
      }
    }}
  />

  <div className="flex gap-3 mt-3">
    <button
      onClick={() => window.ligandFileInput.click()}
      className="bg-blue-500 text-white px-4 py-2 rounded-md text-sm shadow hover:bg-blue-600"
    >
      📁 Browse File
    </button>
    <button
      onClick={() => window.ligandFolderInput.click()}
      className="bg-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm shadow hover:bg-gray-400"
    >
      📂 Browse Folder
    </button>
  </div>
</div>
<ul className="text-sm text-gray-500 mt-2">
  {(showAllLigands ? ligandFiles : ligandFiles.slice(0, 4)).map((f) => (
    <li key={f.name}>📄 {f.name}</li>
  ))}
</ul>

{ligandFiles.length > 3 && (
  <p
    onClick={() => setShowAllLigands(!showAllLigands)}
    className="text-blue-600 text-sm mt-1 cursor-pointer hover:underline"
  >
    {showAllLigands ? "Show Less ▲" : `Show All (${ligandFiles.length}) ▼`}
  </p>
)}



{/* Receptor */}
<div id="receptor-section" className="mb-8">
  <div className="flex justify-between mb-2">
    <label className="text-lg font-semibold text-blue-700">🧬 Receptor Path</label>
    <span className="text-sm text-gray-500">Supported: .pdb, .pdbqt, .cif</span>
  </div>

  {/* Input with real-time validation */}
  <div className="relative">
    <input
      type="text"
      value={receptorPath}
      onChange={(e) => {
        // CLEAN path: remove duplicate slashes
        const cleaned = e.target.value.replace(/\/+/g, "/");
        setReceptorPath(cleaned);

        // Live validate
        validatePathLive(cleaned, setReceptorPathStatus);
      }}
      placeholder="Paste receptor path or use browse below"
      className={`w-full p-3 pr-10 border rounded-md shadow-sm 
        ${receptorPathStatus.valid ? "border-green-500" : "border-red-500"} 
        focus:ring-2 focus:ring-blue-400`}
    />

    {/* VALID icon */}
    {receptorPathStatus.valid && receptorPath.length > 0 && (
      <span className="absolute right-3 top-3 text-green-600 text-xl">✓</span>
    )}

    {/* INVALID icon */}
    {!receptorPathStatus.valid && receptorPath.length > 0 && (
      <span className="absolute right-3 top-3 text-red-600 text-xl">✖</span>
    )}
  </div>

  {/* Error message */}
  {!receptorPathStatus.valid && (
    <p className="text-red-500 text-sm mt-1">{receptorPathStatus.reason}</p>
  )}

  {/* Hidden inputs */}
  <input
    type="file"
    accept=".pdb,.pdbqt,.cif"
    hidden
    ref={(el) => (window.receptorFileInput = el)}
    onChange={(e) => {
      const file = e.target.files[0];
      if (file) {
        setReceptorPath(`${basePath}/${file.name}`);
        setReceptorFiles([file]); //  Fix: wrap single file in array!
      }
    }}
    
  />
<input
  type="file"
  hidden
  webkitdirectory="true"
  directory=""
  ref={(el) => (window.receptorFolderInput = el)}
  onChange={(e) => {
    const files = e.target.files;
    if (files.length > 0) {
      const fileArray = Array.from(files);
      setReceptorFiles(fileArray);

      //  Extract folder name from first file path
      const folderName = files[0].webkitRelativePath.split("/")[0];

      //  Construct full path from basePath
      const fullPath = `${basePath}/${folderName}`;
            //  Filter supported formats
      const validExts = [".pdbqt", ".pdb", ".cif"];
      const filtered = Array.from(files).filter(file =>
        validExts.includes(file.name.toLowerCase().slice(file.name.lastIndexOf(".")))
      );
      setReceptorFiles(filtered);

      setReceptorPath(fullPath);

      //  Optional: auto-fill output folder if empty
      if (!outputFolder) {
        setOutputFolder(fullPath);
      }
    }
  }}
/>


  <div className="flex gap-3 mt-3">
    <button
      onClick={() => window.receptorFileInput.click()}
      className="bg-blue-500 text-white px-4 py-2 rounded-md text-sm shadow hover:bg-blue-600"
    >
      📁 Browse File
    </button>
    <button
      onClick={() => window.receptorFolderInput.click()}
      className="bg-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm shadow hover:bg-gray-400"
    >
      📂 Browse Folder
    </button>
    {/* <div className="flex justify-between mb-8">
      <span className="text-sm text-gray-500">Please use the browse button to see the structures in the 3D Viewer</span>
    </div> */}


  </div>
</div>
<ul className="text-sm text-gray-500 mt-2">
  {(showAllReceptors ? receptorFiles : receptorFiles.slice(0, 4)).map((f) => (
    <li key={f.name}>📄 {f.name}</li>
  ))}
</ul>

{receptorFiles.length > 3 && (
  <p
    onClick={() => setShowAllReceptors(!showAllReceptors)}
    className="text-blue-600 text-sm mt-1 cursor-pointer hover:underline"
  >
    {showAllReceptors ? "Show Less ▲" : `Show All (${receptorFiles.length}) ▼`}
  </p>
)}

        {/* Output Folder */}
        <div className="mb-8">
          <div className="flex justify-between mb-2">
            <label className="text-lg font-semibold text-blue-700"> Output Folder</label>
            <span className="text-sm text-gray-500">Default: backend/outputs</span>
          </div>
          <input
            type="text"
            value={outputFolder}
            onChange={(e) => setOutputFolder(e.target.value)}
            placeholder="Output Result path"
            className="w-full p-3 border rounded-md shadow-sm border-gray-300 focus:ring-2 focus:ring-blue-400"
          />
          {/* <div className="flex gap-3 mt-3">
            <button className="bg-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm shadow hover:bg-gray-400">📂 Browse Folder</button>
          </div> */}
        </div>

        {/* Grid Box */}
<div className="mb-8 p-4 bg-gray-50 rounded-md border border-gray-200">
  <div className="flex justify-between items-center mb-4">
    <h3 className="text-xl font-semibold text-blue-700">📦 Grid Box Parameters</h3>
    <span className="text-sm text-gray-400">Docking Box</span>
  </div>
      {/* 📦 Box file upload below grid box UI */}
      <div className="mt-4">
        <label className="block text-gray-600 mb-2 font-medium">📄 Load Box File (.txt)</label>
        <input
          type="file"
          accept=".txt"
          onChange={handleBoxFileUpload}
          className="p-2 rounded-md border border-gray-300 text-sm"
        />
        <p className="text-xs text-gray-500 mt-1">
          Format: center_x, center_y, center_z, size_x, size_y, size_z, exhaustiveness
        </p>
      </div>
      <div className="mb-4">
  <label className="flex items-center text-gray-700 font-medium">
<input
  type="checkbox"
  className="mr-2"
  checked={isBlindDocking}
  onChange={handleBlindDockingToggle}
/>
Blind Docking (auto-box over receptor surface)

  </label>
</div>

  {/* Initial Box Center */}
  <div className="mb-4">
    <label className="block text-gray-600 mb-2 font-medium">Initial Box Center</label>
    <div className="grid grid-cols-3 gap-3">
      <input
        type="number"
        placeholder="X"
        value={box.centerX}
        onChange={(e) => setBox({...box, centerX: e.target.value})}
        className="p-3 rounded-md bg-gray-100 border border-gray-300 placeholder-gray-400"
      />
      <input
        type="number"
        placeholder="Y"
        value={box.centerY}
        onChange={(e) => setBox({...box, centerY: e.target.value})}
        className="p-3 rounded-md bg-gray-100 border border-gray-300 placeholder-gray-400"
      />
      <input
        type="number"
        placeholder="Z"
        value={box.centerZ}
        onChange={(e) => setBox({...box, centerZ: e.target.value})}
        className="p-3 rounded-md bg-gray-100 border border-gray-300 placeholder-gray-400"
      />
    </div>
  </div>

  {/* Box Size */}
  <div className="mb-4">
    <label className="block text-gray-600 mb-2 font-medium">Box Size</label>
    <div className="grid grid-cols-3 gap-3">
      <input
        type="number"
        placeholder="X"
        value={box.sizeX}
        onChange={(e) => setBox({...box, sizeX: e.target.value})}
        className="p-3 rounded-md bg-gray-100 border border-gray-300 placeholder-gray-400"
      />
      <input
        type="number"
        placeholder="Y"
        value={box.sizeY}
        onChange={(e) => setBox({...box, sizeY: e.target.value})}
        className="p-3 rounded-md bg-gray-100 border border-gray-300 placeholder-gray-400"
      />
      <input
        type="number"
        placeholder="Z"
        value={box.sizeZ}
        onChange={(e) => setBox({...box, sizeZ: e.target.value})}
        className="p-3 rounded-md bg-gray-100 border border-gray-300 placeholder-gray-400"
      />
    </div>
  </div>

  {/* Grid box vary checkbox */}
  <div className="flex items-start flex-col gap-4">
  <label className="flex items-center text-gray-600 font-medium">
    <input
      type="checkbox"
      id="varyGridBox"
      className="mr-2"
      checked={varyGridBox}
      onChange={(e) => setVaryGridBox(e.target.checked)}
    />
    Do you want the grid box to vary?
  </label>

  {varyGridBox && (
    <div className="w-full space-y-4">

      {/* Box Step */}
      <div>
        <label className="block text-gray-600 mb-2 font-medium">Box Step (Δx, Δy, Δz)</label>
        <div className="grid grid-cols-3 gap-3">
          <input type="number" placeholder="X" value={box.stepX} onChange={(e) => setBox({...box, stepX: e.target.value})} className="p-3 rounded-md border border-gray-300" />
          <input type="number" placeholder="Y" value={box.stepY} onChange={(e) => setBox({...box, stepY: e.target.value})} className="p-3 rounded-md border border-gray-300" />
          <input type="number" placeholder="Z" value={box.stepZ} onChange={(e) => setBox({...box, stepZ: e.target.value})} className="p-3 rounded-md border border-gray-300" />
        </div>
      </div>

      {/* Box Count */}
      <div>
        <label className="block text-gray-600 mb-2 font-medium">Box Count (Nx, Ny, Nz)</label>
        <div className="grid grid-cols-3 gap-3">
          <input type="number" placeholder="Count X" value={box.countX} onChange={(e) => setBox({...box, countX: e.target.value})} className="p-3 rounded-md border border-gray-300" />
          <input type="number" placeholder="Count Y" value={box.countY} onChange={(e) => setBox({...box, countY: e.target.value})} className="p-3 rounded-md border border-gray-300" />
          <input type="number" placeholder="Count Z" value={box.countZ} onChange={(e) => setBox({...box, countZ: e.target.value})} className="p-3 rounded-md border border-gray-300" />
        </div>
      </div>

    </div>
  )}
</div>
</div>





<div className="mt-10 bg-gray-10 border border-blue-200 p-6 rounded-lg text-center">
  <strong>🔬 Structure Viewer</strong>

  {/* 👇 Add visualization control buttons here */}
  <div className="flex justify-center gap-3 mt-3">
    <button
      className={`px-4 py-2 rounded-md text-sm shadow ${
        viewerMode === "atoms" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-800"
      }`}
      onClick={() => setViewerMode("atoms")}
    >
      All Atoms
    </button>
    <button
      className={`px-4 py-2 rounded-md text-sm shadow ${
        viewerMode === "surface" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-800"
      }`}
      onClick={() => setViewerMode("surface")}
    >
      CRT. sticks
    </button>
  </div>

  <div 
    id="Viewer3D" 
    className="w-full h-96 mt-4 rounded-md shadow-inner" 
    style={{ background: "white" }} 
  />
</div>



{/* ⚙️ Vina Exhaustiveness */}
<div className="mb-8">
  <label className="block text-lg font-semibold text-blue-700">⚙️ Vina Exhaustiveness</label>
  <input
    type="number"
    value={exhaustiveness}
    onChange={(e) => setExhaustiveness(e.target.value)}
    className="w-full p-3 border rounded-md shadow-sm border-gray-300 focus:ring-2 focus:ring-blue-400 mt-2"
  />
</div>

{/* ⚙️ CPU & Vina Configuration */}
    <div className="mb-10 bg-gray-50 p-6 border border-blue-200 rounded-lg">
      <h3 className="text-xl font-semibold text-blue-700 mb-4">⚙️ CPU & Vina Configuration</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <label className="block font-medium text-gray-700">Total CPUs on Your System</label>
          <input
            type="number"
            className="w-full p-3 mt-1 border border-gray-300 rounded-md"
            value={systemCpu}
            onChange={(e) => setSystemCpu(parseInt(e.target.value))}
            placeholder="e.g., 32"
          />
        </div>

        <div>
          <label className="block font-medium text-gray-700">CPUs You Want to Use</label>
          <input
            type="number"
            className="w-full p-3 mt-1 border border-gray-300 rounded-md"
            value={userCpu}
            onChange={(e) => setUserCpu(parseInt(e.target.value))}
            placeholder="e.g., 20"
          />
        </div>
      </div>

      {/* {cpuRecommendation.vinaCores > 0 && (
        <div className="mt-6">
          <div className="text-gray-700 bg-white p-4 border border-green-300 rounded-md">
            <p className="mb-1 font-medium">☑️ Recommendation:</p>
            <ul className="list-disc list-inside text-sm">
              <li>Vina threads per task: {cpuRecommendation.vinaCores}</li>
              <li>Parallel workers: {cpuRecommendation.maxWorkers}</li>
              <li>Total expected CPU usage: {cpuRecommendation.totalUsage} / {userCpu}</li>
            </ul>
            {cpuRecommendation.warning && (
              <p className="text-yellow-600 text-sm mt-2">{cpuRecommendation.warning}</p>
            )}
            {cpuRecommendation.overrideWarning && (
              <p className="text-red-600 text-sm mt-2">{cpuRecommendation.overrideDetail}</p>
            )}
          </div> */}

          <div className="mt-4">
            <label className="block font-medium text-gray-700">🧪 Vina Threads per Task (optional override)</label>
            <input
              type="number"
              className="w-full p-3 mt-1 border border-gray-300 rounded-md"
              value={vinaThreads}
              onChange={(e) => setVinaThreads(parseInt(e.target.value))}
            />
            <p className="text-sm text-gray-500 mt-1">Set the number of threads each AutoDock Vina task should use. Example : If you select <b>CPUs</b> = 6 and <b>Vina Threads</b> per Task = 2, then 3 docking tasks will run in parallel <b>(6 ÷ 2 = 3).</b>.</p>
          </div>

          <div>
            <label className="block font-medium text-gray-700">🧪 Vina score best top-N </label>
            <input
              type="number"
              className="w-full p-3 mt-1 border border-gray-300 rounded-md"
              value={topbest}
              onChange={(e) => setTopbest(parseInt(e.target.value))}
              
            />
            <p className="text-sm text-gray-500 mt-1">Please input the best score you want </p>
          {/* </div> */}  
        </div> 
      {/* )} */}
    </div>


        {/*  Ligand Chunking */}
        <div className="mb-6">
          <label className="block text-lg font-semibold text-blue-700"> Ligand Chunking</label>
          <select
            value={chunkMode}
            onChange={(e) => setChunkMode(e.target.value)}
            className="w-full p-3 border rounded-md shadow-sm border-gray-300 focus:ring-2 focus:ring-blue-400 mt-2"
          >
            <option value="yes">Yes (CHUNK_SIZE = 1000)</option>
            <option value="no">No (process all ligands together)</option>
          </select>
          <p className="text-sm text-gray-500 mt-1">
            Chunking is helpful for large ligand sets to improve stability and performance.
            <br />
            <strong>Recommended:</strong> Use (<em>Yes</em>) if you are docking more than <strong>1000 ligands</strong>. For small datasets (under <strong>999 ligands</strong>), it’s safe to disable chunking (<em>No</em>).
          </p>
        </div>

        

<div className="bg-white p-4 rounded shadow mt-6">
  <h3 className="font-bold text-lg mb-2">🧩 Dependency Installer</h3>

  {!dependencies.vina && (
    <button 
      className="bg-blue-600 text-white px-4 py-2 rounded"
      onClick={() => installDependency("vina")}
    >
      Install AutoDock Vina
    </button>
  )}

  {!dependencies.openbabel && (
    <button 
      className="bg-green-600 text-white px-4 py-2 rounded ml-2"
      onClick={() => installDependency("openbabel")}
    >
      Install OpenBabel
    </button>
  )}

  {installingTool && (
    <pre className="bg-black text-green-400 p-3 mt-3 rounded max-h-52 overflow-y-auto">
      {installLog}
    </pre>
  )}
</div>



{/* Generate + Run Buttons */}
<div className="text-center mt-6">
  <button
    onClick={handleGenerateScript}
    disabled={isLoading}
    className={`bg-blue-600 hover:bg-blue-700 text-white py-3 px-8 rounded-full shadow-md ${
      isLoading ? "opacity-50" : ""
    }`}
  >
    {isLoading ? "Generating..." : "Generate Docking Script"}
  </button>

  <button
    onClick={handleRun}
    disabled={isLoading || isRunning}
    className={`bg-green-600 hover:bg-green-700 text-white py-3 px-6 rounded-full shadow-md ml-4 ${
      isRunning ? "opacity-50" : ""
    }`}
  >
    {isRunning ? `Running... (${runProgress}%)` : "▶️ Run Docking Now"}
  </button>
</div>



{/* Status bar when running */}
{isRunning && (
  <div className="mt-3 text-center">
    <div className="text-sm text-gray-700">Status: {runStatus}</div>

    <div className="w-full max-w-md mx-auto bg-gray-300 h-2 rounded mt-2">
      <div
        style={{ width: `${runProgress}%` }}
        className="h-2 bg-green-600 rounded"
      ></div>
    </div>
  </div>
)}

{showTerminal && (
  <div
    style={{
      marginTop: "30px",
      padding: "0",
      borderRadius: "6px",
      border: "2px solid #444",
      overflow: "hidden",
      fontFamily: "monospace",
      background: "#111",
      width: "100%"
    }}
  >

    {/* HEADER */}
    <div
      style={{
        background: "#222",
        color: "#fff",
        padding: "8px 10px",
        fontWeight: "bold",
        borderBottom: "2px solid #333",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}
    >
      <span>🖥 Terminal Output</span>

      <button
        onClick={() => setShowTerminal(false)}
        style={{
          background: "none",
          border: "none",
          color: "red",
          fontSize: "16px",
          cursor: "pointer"
        }}
      >
        ✖
      </button>
    </div>

    {/* TERMINAL BODY */}
    <div
      ref={terminalRef}
      style={{
        background: "#5E2750",
        color: "#eee",
        height: "250px",
        padding: "10px",
        overflowY: "auto",
        whiteSpace: "pre-wrap",
        fontSize: "14px"
      }}
    >
      {terminalOutput.map((line, idx) => (
        <div
          key={idx}
          style={{
            color: line.includes("Error") || line.includes("❌") ? "#ff4d4d" : "#eee"
          }}
        >
          {line}
        </div>
      ))}
    </div>

    {/* MAIN STATUS */}
    <div
      style={{
        background: "#222",
        color: "#ccc",
        padding: "10px",
        borderTop: "2px solid #333",
        fontSize: "13px"
      }}
    >
      Status: {runStatus}
    </div>

    {/* PROGRESS BAR */}
    <div
      style={{
        width: "100%",
        height: "8px",
        background: "#333"
      }}
    >
      <div
        style={{
          width: `${runProgress ?? 0}%`,
          height: "100%",
          background: "#4caf50",
          transition: "width 0.3s ease"
        }}
      />
    </div>

    {/* LIVE STATUS LINE */}
    <div
      style={{
        padding: "8px 10px",
        background: "#111",
        color: "#4caf50",
        fontFamily: "monospace",
        fontSize: "14px",
        borderTop: "1px solid #333"
      }}
    >
      {runStatus === "running" &&
        `⏳ Docking in progress… ${runProgress ?? 0}% completed`}
      {runStatus === "queued" &&
        "📦 Job queued, preparing environment…"}
      {runStatus === "finished" &&
        "✅ Docking finished successfully!"}
      {runStatus === "failed" &&
        "❌ Docking failed. Check logs above."}
    </div>

  </div>
)}


</div>  {/* CLOSE INNER MAIN WRAPPER */}
</div>  {/* CLOSE PAGE WRAPPER */}

{/* Footer pinned to bottom */}
<footer className="relative z-10 text-center text-sm text-gray-600 py-4">
  © Combi-Lab VS 3.0 2025. All rights reserved.
</footer>

</>

  );
  
}
