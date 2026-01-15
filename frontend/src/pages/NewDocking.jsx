import { useState,  useRef } from "react";
import axios from 'axios';
import { useEffect } from "react";


export default function NewDocking() {
    const ligandFileRef = useRef(null);
    const receptorFileRef = useRef(null);

    const [basePath, setBasePath] = useState(localStorage.getItem("basePath") || "");
    const [showBasePathModal, setShowBasePathModal] = useState(
     !localStorage.getItem("hasSeenPathInfo")
    );

// we only need the arrays; if you still want a preview of “the first” file, you can derive it.
    const [ligandFiles,   setLigandFiles]   = useState([]);
    const [receptorFiles, setReceptorFiles] = useState([]);
    const [showAllLigands, setShowAllLigands] = useState(false);
    const [showAllReceptors, setShowAllReceptors] = useState(false);
    const [isBlindDocking, setIsBlindDocking] = useState(false);
    const [viewerMode, setViewerMode] = useState("cartoon");
    const [ligandPathStatus, setLigandPathStatus] = useState({ valid: true, reason: "", bad_part: "" });
     const [receptorPathStatus, setReceptorPathStatus] = useState({ valid: true, reason: "", bad_part: "" });
    const [terminalOutput, setTerminalOutput] = useState([]);
    const terminalRef = useRef(null);





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
    // After line ~50 (after other useState declarations)
    const [enablePlip, setEnablePlip] = useState(false);
    const [plipMaxPoses, setPlipMaxPoses] = useState(5);
    const [plipMaxWorkers, setPlipMaxWorkers] = useState(4);
    const [plipRemoveWaters, setPlipRemoveWaters] = useState(false);
    const [plipRemoveIons, setPlipRemoveIons] = useState(false);
    const [plipAddHydrogens, setPlipAddHydrogens] = useState(true);
    const [plipKeepHetero, setPlipKeepHetero] = useState(true);
    const [exhaustiveness, setExhaustiveness] = useState(8);
    const [topbest, setTopbest] = useState(10);
    const [cpuCores, setCpuCores] = useState(0); //0 = use all 
    const [isLoading, setIsLoading] = useState(false);
    const [errors, setErrors] = useState({});
    const [isInitialSet, setIsInitialSet] = useState(!!localStorage.getItem("basePath"));
    const [chunkMode, setChunkMode] = useState("no");
    const [systemCpu, setSystemCpu] = useState(1);
    const [userCpu, setUserCpu] = useState(1);
    const [vinaThreads, setVinaThreads] = useState(1);
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


// UPDATED: Block invalid characters from being typed (not just clean after)

const validatePathFormat = (path, setter) => {
  // Empty path
  if (!path || path.trim() === "") {
    setter({ 
      valid: false, 
      reason: "Path cannot be empty", 
      bad_part: "" 
    });
    return "";
  }

  let cleanedPath = path.trim();

  // Auto-fix: Add leading '/' if missing
  if (!cleanedPath.startsWith("/")) {
    cleanedPath = "/" + cleanedPath;
  }

  // Replace multiple consecutive slashes with single slash
  cleanedPath = cleanedPath.replace(/\/+/g, "/");

  // Must have at least one directory or file after /
  const parts = cleanedPath.split('/').filter(p => p.length > 0);
  
  if (parts.length === 0) {
    setter({ 
      valid: false, 
      reason: "Path must include directories/files (e.g., /home/user/folder)", 
      bad_part: "" 
    });
    return cleanedPath;
  }

  // Check for invalid characters
  const invalidChars = /[@#$%&*()+=<>:"|?*\x00-\x1F,\\]/;
  if (invalidChars.test(cleanedPath)) {
    setter({ 
      valid: false, 
      reason: "Path contains invalid characters (@#$%&*()+=<>:\"|?*,\\)", 
      bad_part: cleanedPath.match(invalidChars)[0]
    });
    return cleanedPath;
  }

  // Valid path format
  setter({ 
    valid: true, 
    reason: "", 
    bad_part: "" 
  });
  
  return cleanedPath;
};


// ✅ UPDATED VALIDATION WITH AUTO-SCROLL AND CPU CHECKS
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

  // CPU validation
  if (systemCpu <= 0) {
    newErrors.systemCpu = "System CPU must be greater than 0";
    if (!firstErrorField) firstErrorField = "cpu-section";
  }

  if (userCpu <= 0) {
    newErrors.userCpu = "User CPU must be greater than 0";
    if (!firstErrorField) firstErrorField = "cpu-section";
  }

  if (vinaThreads <= 0) {
    newErrors.vinaThreads = "Vina Threads must be greater than 0";
    if (!firstErrorField) firstErrorField = "cpu-section";
  }

  if (userCpu > systemCpu && systemCpu > 0) {
    newErrors.userCpu = "Cannot exceed system CPU count";
    if (!firstErrorField) firstErrorField = "cpu-section";
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



// Replace handleBlindDockingToggle (around line ~210)

const handleBlindDockingToggle = async (e) => {
  const checked = e.target.checked;
  setIsBlindDocking(checked);

  if (!checked) return;

  // Validate we have receptor data
  if (receptorFiles.length === 0 && !receptorPath) {
    alert("⚠️ Please select or enter receptor path first");
    setIsBlindDocking(false);
    return;
  }

  try {
    const formData = new FormData();
    
    // Send files if available (from Browse button)
    if (receptorFiles.length > 0) {
      receptorFiles.forEach((file) => {
        formData.append("receptor_files", file);
      });
    }
    
    // Send path if files not available (manual entry)
    if (receptorFiles.length === 0 && receptorPath) {
      formData.append("receptor_path", receptorPath);
    }

    console.log("🔍 Sending blind docking request...");
    console.log("Files:", receptorFiles.length);
    console.log("Path:", receptorPath);

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
    setIsBlindDocking(false);
    alert(
      "❌ Failed to compute blind docking box: " +
        (err.response?.data?.detail || err.message)
    );
  }
};

const cleanOutputPath = (path) => {
  if (!path) return "";

  // Remove illegal characters
  let cleaned = path.replace(/[?@,\\]+/g, "");

  // Replace multiple slashes with single slash
  cleaned = cleaned.replace(/\/+/g, "/");

  // Ensure absolute path starts with "/"
  if (!cleaned.startsWith("/")) {
    cleaned = "/" + cleaned;
  }

  return cleaned.trim();
};

const validateOutputFolder = () => {
  let cleaned = cleanOutputPath(outputFolder);

  // If cleaning changed it → auto-set the correction
  if (cleaned !== outputFolder) {
    setOutputFolder(cleaned);
  }

  // Now validate
  if (!cleaned) {
    setErrors((prev) => ({
      ...prev,
      outputFolder: "Please enter the full absolute output folder path.",
    }));

    scrollToOutput();
    return false;
  }

  if (!cleaned.startsWith("/")) {
    setErrors((prev) => ({
      ...prev,
      outputFolder: "Output path MUST start with '/'. Example: /home/user/results",
    }));

    scrollToOutput();
    return false;
  }

  // Valid
  setErrors((prev) => ({ ...prev, outputFolder: null }));
  return true;
};

const scrollToOutput = () => {
  const el = document.getElementById("output-section");
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
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


  // useEffect(() => {
  //   if (vinaThreads > 0 && userCpu > 0) {
  //     const maxWorkers = Math.max(1, Math.floor(userCpu / vinaThreads));
  //     const totalUsage = vinaThreads * maxWorkers;
  //     const isOverride = vinaThreads !== recommendedVina;
  //     const overrideTooHigh = vinaThreads > recommendedVina;

  //     setCpuRecommendation((prev) => ({
  //       ...prev,
  //       vinaCores: vinaThreads,
  //       maxWorkers,
  //       totalUsage,
  //       overrideWarning: isOverride,
  //       overrideDetail: isOverride
  //         ? `⚠️ You set Vina threads to ${vinaThreads} (recommended: ${recommendedVina}).` +
  //           (overrideTooHigh ? ` This may reduce parallel efficiency.` : ` You reduced the thread count below recommendation.`)
  //         : ""
  //     }));
  //   }
  // }, [vinaThreads]);

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
  // Add PLIP parameters
  formData.append("enable_plip", enablePlip ? "true" : "false");  // ← Convert to string!
  
  if (enablePlip) {
    formData.append("plip_max_poses", plipMaxPoses);
    formData.append("plip_max_workers", plipMaxWorkers);
    formData.append("plip_remove_waters", plipRemoveWaters ? "true" : "false");
    formData.append("plip_remove_ions", plipRemoveIons ? "true" : "false");
    formData.append("plip_add_hydrogens", plipAddHydrogens ? "true" : "false");
    formData.append("plip_keep_hetero", plipKeepHetero ? "true" : "false");
  } else {
    // Send defaults when PLIP is disabled
    formData.append("plip_max_poses", 5);
    formData.append("plip_max_workers", 4);
    formData.append("plip_remove_waters", "false");
    formData.append("plip_remove_ions", "false");
    formData.append("plip_add_hydrogens", "true");
    formData.append("plip_keep_hetero", "true");
  }


  return formData;
};

const startPollingJobWithPlip = (jobId, uploadJob) => {
  setShowTerminal(true);
  let plipStarted = false;

  const interval = setInterval(async () => {
    try {
      const res = await axios.get(`http://localhost:5006/run-status/${jobId}`);
      const data = res.data;

      setRunStatus(data.status);
      setRunProgress(data.progress);

      if (data.log_tail) {
        setTerminalOutput((prev) => [...prev, ...data.log_tail]);
      }

      // Check if docking finished
      if (data.status === "finished" && !plipStarted && enablePlip) {
        plipStarted = true;
        
        // Add separator in terminal
        setTerminalOutput((prev) => [
          ...prev,
          "\n" + "=".repeat(80),
          "🧬 DOCKING COMPLETE - STARTING PLIP ANALYSIS",
          "=".repeat(80) + "\n"
        ]);

        // Trigger PLIP analysis
        try {
          await runPlipAnalysis(uploadJob);
          
          setTerminalOutput((prev) => [
            ...prev,
            "\n" + "=".repeat(80),
            "✅ PLIP ANALYSIS COMPLETED!",
            "=".repeat(80) + "\n"
          ]);
        } catch (plipErr) {
          console.error("PLIP failed:", plipErr);
          setTerminalOutput((prev) => [
            ...prev,
            "\n❌ PLIP analysis failed: " + plipErr.message,
            "⚠️  Docking results are safe and available.\n"
          ]);
        }
        
        clearInterval(interval);
        setIsRunning(false);
        
        // Cleanup uploaded files
        if (uploadJob && uploadJob.job_id) {
          try {
            await axios.delete(`http://localhost:5006/cleanup/${uploadJob.job_id}`);
          } catch (err) {
            console.warn("Cleanup failed:", err);
          }
        }
      }

      // Handle docking failure or completion without PLIP
      if (data.status === "failed" || (data.status === "finished" && !enablePlip)) {
        clearInterval(interval);
        setIsRunning(false);
        
        // Cleanup uploaded files
        if (uploadJob && uploadJob.job_id) {
          try {
            await axios.delete(`http://localhost:5006/cleanup/${uploadJob.job_id}`);
          } catch (err) {
            console.warn("Cleanup failed:", err);
          }
        }
      }
    } catch (err) {
      clearInterval(interval);
      setIsRunning(false);
    }
  }, 1000);
};

const runPlipAnalysis = async (uploadJob) => {
  console.log("🧬 Starting PLIP analysis...");
  
  // Generate PLIP script with correct paths
  const plipForm = new FormData();
  
  // Use same receptor as docking
  plipForm.append("receptor_path", receptorPath);
  
  // Use docking OUTPUT as PLIP ligand input
  plipForm.append("ligand_path", outputFolder);
  
  // PLIP results go to subfolder
  const plipOutput = outputFolder.replace(/\/$/, '') + "/plip_analysis";
  plipForm.append("output_folder", plipOutput);
  
  plipForm.append("max_poses", plipMaxPoses);
  plipForm.append("max_workers", plipMaxWorkers);
  plipForm.append("remove_waters", plipRemoveWaters);
  plipForm.append("remove_ions", plipRemoveIons);
  plipForm.append("add_hydrogens", plipAddHydrogens);
  plipForm.append("keep_hetero", plipKeepHetero);

  // Generate PLIP script from server backend
  const plipScriptRes = await axios.post(
    "http://127.0.0.1:8000/plip/generate-script",
    plipForm,
    { responseType: "text" }
  );

  const plipScriptText = plipScriptRes.data;

  // Send PLIP script to local backend to execute
  const runPlipForm = new FormData();
  runPlipForm.append("script_content", plipScriptText);
  runPlipForm.append("upload_job_id", uploadJob?.job_id || "");

  const plipRunRes = await axios.post(
    "http://localhost:5006/run-script",
    runPlipForm,
    { timeout: 0 }
  );

  const plipJobId = plipRunRes.data.job_id;
  console.log("✅ PLIP job started:", plipJobId);

  // Poll PLIP progress
  return new Promise((resolve, reject) => {
    const plipPoll = setInterval(async () => {
      try {
        const status = await axios.get(`http://localhost:5006/run-status/${plipJobId}`);
        
        if (status.data.log_tail) {
          setTerminalOutput((prev) => [...prev, ...status.data.log_tail]);
        }

        if (status.data.status === "finished") {
          clearInterval(plipPoll);
          resolve();
        } else if (status.data.status === "failed") {
          clearInterval(plipPoll);
          reject(new Error("PLIP execution failed"));
        }
      } catch (err) {
        clearInterval(plipPoll);
        reject(err);
      }
    }, 2000);
  });
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

  const res = await axios.post("http://localhost:5006/upload-run-files", form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 0, // uploads can be large; avoid short timeouts
  });

  return res.data; // contains job_id, ligand_dir, receptor_dir
};

const handleRun = async () => {
  if (!validateForm()) return;
  if (!validateOutputFolder()) return;

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
      "http://localhost:5006/run-script",
      runForm,
      { timeout: 0 } // script can take a long time
    );

    const jobId = runRes.data.job_id;
    setRunJobId(jobId);

    alert("🚀 Docking started locally.");
    // 4) Start polling the local backend
    startPollingJobWithPlip(jobId, uploadJob);

    // Optional: poll for completion and then cleanup upload files

  } catch (err) {
    setIsRunning(false);
    console.error("Run failed", err);
    // If upload happened but run failed, try cleanup
    try {
      if (uploadJob && uploadJob.job_id) {
        await axios.delete(`http://localhost:5006/cleanup/${uploadJob.job_id}`);
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
      const res = await axios.get("http://localhost:5006/check-dependencies");

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
      `http://localhost:5006/install-dependency?name=${toolName}`
    );
    const installId = res.data.install_id;

    // poll every 2 sec
    const poll = setInterval(async () => {
      try {
        const status = await axios.get(
          `http://localhost:5006/install-status/${installId}`
        );

        setInstallLog(status.data.log_tail);

        if (status.data.status === "done") {
          clearInterval(poll);
          setInstallingTool(null);

          // re-check dependencies
          const res2 = await axios.get("http://localhost:5006/check-dependencies");
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
    if (!validateOutputFolder()) return;

    setIsLoading(true);

    const formData = buildFormData();

    // 🔍 DEBUG: Check PLIP state
    console.log("🔍 PLIP Enabled:", enablePlip);
    
    if (enablePlip) {
      // ========================================
      // PLIP IS CHECKED → Download ZIP
      // ========================================
      console.log("📦 Downloading ZIP (vsframework.py + plip_analysis.py)");
      
      const response = await axios.post(
        "http://127.0.0.1:8000/docking/generate-scripts-zip",
        formData,
        { responseType: "blob" }
      );

      const blob = new Blob([response.data], { type: "application/zip" });
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = "docking_scripts.zip";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      window.URL.revokeObjectURL(url);

      alert("✅ ZIP downloaded with both scripts!");
      
    } else {
      // ========================================
      // PLIP IS UNCHECKED → Download single file
      // ========================================
      console.log("📄 Downloading single file (vsframework.py only)");
      
      const response = await axios.post(
        "http://127.0.0.1:8000/docking/generate-script",
        formData,
        { responseType: "blob" }
      );

      const blob = new Blob([response.data], { type: "text/x-python" });
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = "vsframework.py";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      window.URL.revokeObjectURL(url);

      alert("✅ Single file downloaded (vsframework.py)!");
    }

    setIsLoading(false);
    
  } catch (err) {
    setIsLoading(false);
    console.error("❌ Script generation failed:", err);
    alert("❌ Failed to generate scripts: " + (err.response?.data?.detail || err.message));
  }
};


  return (
    <>
{showBasePathModal && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black-0.2">
    <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">

      <h3 className="text-xl font-bold mb-4 text-blue-700">📘 Path Usage Information</h3>

      <p className="text-gray-700 text-sm mb-4">
        Before using the docking tools, please read this:
      </p>

      <div className="bg-blue-50 p-3 rounded-md mb-4 text-sm text-gray-800 border border-blue-200">
        <strong>➡ To GENERATE a docking script (vsframework.py and Plip script): </strong>
        <br />
        Make sure ALL paths are FULL absolute paths:
        <br />• Ligand folder/file 
        <br />• Receptor folder/file  
        <br />• Output folder  
        <br />
        These will be written directly into your generated Python script.
      </div>
{/* 
      <div className="bg-green-50 p-3 rounded-md mb-4 text-sm text-gray-800 border border-green-200">
        <strong>➡ To RUN DOCKING NOW inside the frameworkvs:</strong>
        <br />
        Only ensure the <strong>output folder path</strong> is a valid full absolute path.
      </div> */}

      <p className="text-xs text-gray-500 mb-4">
        This information popup appears only on your first visit.  
        You can reopen it anytime using “🔄 Path Usage Information”.
      </p>

      <div className="flex justify-end">
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          onClick={() => {
            localStorage.setItem("hasSeenPathInfo", "true");
            setShowBasePathModal(false);
          }}
        >
          Close
        </button>
      </div>

    </div>
  </div>
)}

    {/* Change Path link - top right */}
    <div className="absolute top-24 right-8 z-10">
    <p
     className="text-sm text-blue-600 cursor-pointer underline hover:text-blue-800"
     onClick={() => setShowBasePathModal(true)}
    >
     🔄 Path Usage Information
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
        const inputValue = e.target.value;
        const cleanedValue = inputValue.replace(/[^a-zA-Z0-9/_.\-]/g, "");
        const correctedPath = validatePathFormat(cleanedValue, setLigandPathStatus);
        setLigandPath(correctedPath);
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
        const inputValue = e.target.value;
        const cleanedValue = inputValue.replace(/[^a-zA-Z0-9/_.\-]/g, "");

        // Live validate
        const correctedPath = validatePathFormat(cleanedValue, setReceptorPathStatus);
        setReceptorPath(correctedPath);
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
<div id="output-section" className="mb-8">
  <div className="flex justify-between mb-2">
    <label className="text-lg font-semibold text-blue-700">Output Folder</label>
    <span className="text-sm text-gray-500">Full absolute path required</span>
  </div>

  <input
    type="text"
    value={outputFolder}
    onChange={(e) => {
      const cleaned = cleanOutputPath(e.target.value);
      setOutputFolder(cleaned);
    }}
    placeholder="/home/username/results"
    className={`w-full p-3 border rounded-md shadow-sm 
      ${errors.outputFolder ? "border-red-500 bg-red-50" : "border-gray-300"} 
      focus:ring-2 focus:ring-blue-400`}
  />

  {errors.outputFolder && (
    <p className="text-red-500 text-sm mt-1">{errors.outputFolder}</p>
  )}
</div>


        {/* Grid Box */}
<div className="mb-8 p-4 bg-gray-50 rounded-md border border-gray-200">
  <div className="flex justify-between items-center mb-4">
    <h3 className="text-xl font-semibold text-blue-700"> Grid Box Parameters</h3>
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
    <div id="cpu-section" className="mb-10 bg-gray-50 p-6 border border-blue-200 rounded-lg">
      <h3 className="text-xl font-semibold text-blue-700 mb-4">⚙️ CPU & Vina Configuration</h3>
      
      {/* ⚠️ Warning banner if ANY value is 0 */}
      {(systemCpu <= 0 || userCpu <= 0 || vinaThreads <= 0) && (
        <div className="mb-4 p-4 bg-red-50 border-2 border-red-400 rounded-lg">
          <p className="text-red-700 font-bold flex items-center gap-2">
            <span className="text-2xl">⚠️</span> CPU Configuration Required
          </p>
          <ul className="text-sm text-red-600 mt-2 space-y-1">
            {systemCpu <= 0 && <li>• System CPU must be greater than 0</li>}
            {userCpu <= 0 && <li>• User CPU must be greater than 0</li>}
            {vinaThreads <= 0 && <li>• Vina Threads must be greater than 0</li>}
          </ul>
          <p className="text-xs text-red-500 mt-2">
            ⛔ Script generation will be blocked until all CPU settings are configured.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <label className="block font-medium text-gray-700">
            Total CPUs on Your System <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            className={`w-full p-3 mt-1 border rounded-md ${
              errors.systemCpu || systemCpu <= 0 
                ? "border-red-500 bg-red-50" 
                : "border-gray-300"
            }`}
            value={systemCpu}
            onChange={(e) => setSystemCpu(parseInt(e.target.value) || 0)}
            placeholder="e.g., 32"
            min="1"
          />
          {errors.systemCpu && (
            <p className="text-red-500 text-xs mt-1">{errors.systemCpu}</p>
          )}
        </div>

        <div>
          <label className="block font-medium text-gray-700">
            CPUs You Want to Use <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            className={`w-full p-3 mt-1 border rounded-md ${
              errors.userCpu || userCpu <= 0 
                ? "border-red-500 bg-red-50" 
                : "border-gray-300"
            }`}
            value={userCpu}
            onChange={(e) => setUserCpu(parseInt(e.target.value) || 0)}
            placeholder="e.g., 20"
            min="1"
          />
          {errors.userCpu && (
            <p className="text-red-500 text-xs mt-1">{errors.userCpu}</p>
          )}
        </div>
      </div>


      <div className="mt-4">
        <label className="block font-medium text-gray-700">
           Vina Threads per Task <span className="text-red-500">*</span>
        </label>
        <input
          type="number"
          className={`w-full p-3 mt-1 border rounded-md ${
            errors.vinaThreads || vinaThreads <= 0 
              ? "border-red-500 bg-red-50" 
              : "border-gray-300"
          }`}
          value={vinaThreads}
          onChange={(e) => setVinaThreads(parseInt(e.target.value) || 0)}
          min="1"
          placeholder="e.g., 4"
        />
        {errors.vinaThreads && (
          <p className="text-red-500 text-xs mt-1">{errors.vinaThreads}</p>
        )}
        <p className="text-sm text-gray-500 mt-1">
          Set the number of threads each AutoDock Vina task should use. 
          Example: If you select <b>CPUs</b> = 6 and <b>Vina Threads</b> per Task = 2, 
          then 3 docking tasks will run in parallel <b>(6 ÷ 2 = 3)</b>.
        </p>
      </div>
      {/* Resource allocation preview - only show when valid */}
      {systemCpu > 0 && userCpu > 0 && vinaThreads > 0 && (
        <div className="mt-6">
          <div className="text-gray-700 bg-white p-4 border border-green-300 rounded-md">
            <p className="mb-2 font-medium text-green-700"> Resource Allocation Preview:</p>
            <ul className="list-disc list-inside text-sm space-y-1">
              <li>Vina threads per task: <strong>{vinaThreads}</strong></li>
              <li>Parallel workers: <strong>{cpuRecommendation.maxWorkers}</strong></li>
              <li>Total expected CPU usage: <strong>{cpuRecommendation.totalUsage} / {userCpu}</strong></li>
            </ul>
            {cpuRecommendation.warning && (
              <p className="text-yellow-600 text-sm mt-2">⚠️ {cpuRecommendation.warning}</p>
            )}
            {cpuRecommendation.overrideWarning && (
              <p className="text-orange-600 text-sm mt-2">{cpuRecommendation.overrideDetail}</p>
            )}
          </div>
        </div>
      )}

      <div className="mt-4">
        <label className="block font-medium text-gray-700"> Vina score best top-N</label>
        <input
          type="number"
          className="w-full p-3 mt-1 border border-gray-300 rounded-md"
          value={topbest}
          onChange={(e) => setTopbest(parseInt(e.target.value))}
        />
        <p className="text-sm text-gray-500 mt-1">Please input the best score you want</p>
      </div>
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

        {/* PLIP Analysis Configuration */}
<div className="mb-8 p-6 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border-2 border-purple-200">
  <h3 className="text-xl font-semibold text-purple-700 mb-4"> PLIP Analysis (Optional)</h3>
  
  <div className="mb-4">
    <label className="flex items-center text-gray-700 font-medium">
      <input
        type="checkbox"
        className="mr-2 w-4 h-4"
        checked={enablePlip}
        onChange={(e) => setEnablePlip(e.target.checked)}
      />
      Enable PLIP Analysis
    </label>
    <p className="text-sm text-gray-500 mt-1 ml-6">
      Generate protein-ligand interaction profiling script alongside docking script
    </p>
  </div>

  {enablePlip && (
    <div className="space-y-4 ml-6 p-4 bg-white rounded-md border border-purple-100">
      
      {/* Max Poses */}
      <div>
        <label className="block font-medium text-gray-700 mb-1">
          Max Poses to Analyze (1-20)
        </label>
        <input
          type="number"
          min="0"
          max="20"
          value={plipMaxPoses}
          onChange={(e) => setPlipMaxPoses(Math.min(20, Math.max(0, parseInt(e.target.value) || 0)))}
          className="w-full p-3 border border-gray-300 rounded-md"
        />

      <p className="text-xs text-gray-500 mt-1">
        0 = analyze all poses. Set a value between 1–20 to limit analysis to the
        top-ranked poses per ligand.
    </p>
      </div>

      {/* Max Workers */}
      <div>
        <label className="block font-medium text-gray-700 mb-1">
          Parallel Workers
        </label>
        <input
          type="number"
          min="1"
          value={plipMaxWorkers}
          onChange={(e) => setPlipMaxWorkers(Math.max(1, parseInt(e.target.value) || 1))}
          className="w-full p-3 border border-gray-300 rounded-md"
        />
        <p className="text-xs text-gray-500 mt-1">
          Number of parallel workers for PLIP analysis
        </p>
      </div>

      {/* Boolean Options */}
      <div className="grid grid-cols-2 gap-4">
        <label className="flex items-center text-gray-700">
          <input
            type="checkbox"
            className="mr-2"
            checked={plipRemoveWaters}
            onChange={(e) => setPlipRemoveWaters(e.target.checked)}
          />
          Remove Waters
        </label>

        <label className="flex items-center text-gray-700">
          <input
            type="checkbox"
            className="mr-2"
            checked={plipRemoveIons}
            onChange={(e) => setPlipRemoveIons(e.target.checked)}
          />
          Remove Ions
        </label>

        <label className="flex items-center text-gray-700">
          <input
            type="checkbox"
            className="mr-2"
            checked={plipAddHydrogens}
            onChange={(e) => setPlipAddHydrogens(e.target.checked)}
          />
          Add Hydrogens
        </label>

        <label className="flex items-center text-gray-700">
          <input
            type="checkbox"
            className="mr-2"
            checked={plipKeepHetero}
            onChange={(e) => setPlipKeepHetero(e.target.checked)}
          />
          Keep Heteroatoms
        </label>
      </div>

    </div>
  )}
</div>




{/* Generate + Run Buttons */}
<div className="text-center mt-6">
  <button
    onClick={handleGenerateScript}
    disabled={isLoading || systemCpu <= 0 || userCpu <= 0 || vinaThreads <= 0}
    className={`bg-blue-600 hover:bg-blue-700 text-white py-3 px-8 rounded-full shadow-md transition-all ${
      (isLoading || systemCpu <= 0 || userCpu <= 0 || vinaThreads <= 0) ? "opacity-50 cursor-not-allowed" : ""
    }`}
  >
    {isLoading ? "Generating..." : "Generate Docking Script"}
  </button>
  
  {/* Warning message below button when disabled */}
  {(systemCpu <= 0 || userCpu <= 0 || vinaThreads <= 0) && !isLoading && (
    <p className="text-red-600 text-sm mt-3 font-medium">
      ⚠️ Please configure CPU settings above before generating the script
    </p>
  )}
</div>

</div>  {/* CLOSE INNER MAIN WRAPPER */}
</div>  {/* CLOSE PAGE WRAPPER */}


{/* Instructions Section */}
<div className="max-w-5xl mx-auto mt-6 mb-6 space-y-4">
  {/* Generate Script Instructions */}
  <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-400 rounded-xl shadow-md">
    <p className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
      <span className="text-xl">📝</span> Generate Script 
    </p>
    <ul className="text-xs text-gray-700 space-y-2 text-left">
      <li>✓ Click <strong>"Generate Docking Script"</strong> to download the script</li>
      <li>✓ PLease README.txt file in the Zip if you enable Plip</li>
      <li>✓ Run the script anywhere (local machine, another computer, cluster, etc.)</li>
      <li>✓ No need for the local backend - completely portable</li>
      <li>✓ Full control over execution environment</li>
    </ul>
  </div>
</div>

{/* Footer pinned to bottom */}
<footer className="relative z-10 text-center text-sm text-gray-600 py-4">
  © Combi-Lab VS 3.0 2025. All rights reserved.
</footer>

</>

  );
  
}