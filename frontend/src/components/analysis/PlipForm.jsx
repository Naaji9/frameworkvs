import { useState, useRef } from "react";
import axios from "../../axios";
// import PlipPoseViewer from "./PlipPoseViewer.jsx";

export default function PlipFormAdvanced() {
  const [recMode, setRecMode] = useState("path");
  const [ligMode, setLigMode] = useState("path");

  const [receptorPath, setReceptorPath] = useState("");
  const [ligandPath, setLigandPath] = useState("");

  const [receptorFile, setReceptorFile] = useState(null);
  const [ligandFile, setLigandFile] = useState(null);

  const [outputFolder, setOutputFolder] = useState("");

  const recRef = useRef(null);
  const ligRef = useRef(null);

  const [removeWaters, setRemoveWaters] = useState(true);
  const [removeIons, setRemoveIons] = useState(false);
  const [addHydrogens, setAddHydrogens] = useState(false);
  const [keepHetero, setKeepHetero] = useState(true);

  const [status, setStatus] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState(null);

  const startFakeProgress = () => {
    setProgress(0);
    let v = 0;
    const t = setInterval(() => {
      v += Math.random() * 8 + 3;
      if (v >= 94) clearInterval(t);
      setProgress(Math.min(94, Math.round(v)));
    }, 250);
    return t;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (recMode === "path" && !receptorPath) return alert("Missing receptor path");
    if (ligMode === "path" && !ligandPath) return alert("Missing ligand path");
    if (recMode === "browse" && !receptorFile) return alert("Select receptor file");
    if (ligMode === "browse" && !ligandFile) return alert("Select ligand file");
    if (!outputFolder) return alert("Missing output folder");

    setIsWorking(true);
    setResults(null);

    const timer = startFakeProgress();
    setStatus("Submitting PLIP job…");

    try {
      const fd = new FormData();

      if (recMode === "browse") fd.append("receptor_file", receptorFile);
      else fd.append("receptor_path", receptorPath);

      if (ligMode === "browse") fd.append("ligand_file", ligandFile);
      else fd.append("ligand_path", ligandPath);

      fd.append("output_folder", outputFolder);

      fd.append("remove_waters", removeWaters);
      fd.append("remove_ions", removeIons);
      fd.append("add_hydrogens", addHydrogens);
      fd.append("keep_hetero", keepHetero);

      const res = await axios.post("/analysis/plip", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 600000,
      });

      clearInterval(timer);
      setProgress(100);
      setStatus("PLIP finished");
      setResults(res.data);

    } catch (err) {
      clearInterval(timer);
      setProgress(0);
      setIsWorking(false);
      const msg = err?.response?.data?.detail || err.message;
      setStatus("PLIP error: " + msg);
      return;
    }

    setIsWorking(false);
  };

  const openFile = (p) => {
    if (!p) return;
    window.open(`/analysis/file?path=${encodeURIComponent(p)}`, "_blank");
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-4xl mx-auto p-8 bg-gray-200 rounded-2xl shadow-lg space-y-8 border border-blue-400"
    >
      <h2 className="text-3xl font-bold text-black-900 tracking-tight">
        PLIP — Advanced Interaction Analysis
      </h2>

      <div className="text-gray-500 text-sm">
        Supports: <span className="font-medium ml-1">.pdb, .pdbqt</span>
      </div>

      {/* RECEPTOR */}
      <section className="space-y-2">
        <label className="font-semibold text-gray-700 text-lg">Receptor</label>
        <div className="flex gap-2 items-center">
          <select
            value={recMode}
            onChange={(e) => setRecMode(e.target.value)}
            className="px-3 py-2 border rounded-lg bg-gray-50"
          >
            <option value="path">Path</option>
            <option value="browse">Browse</option>
          </select>

          {recMode === "path" ? (
            <input
              value={receptorPath}
              onChange={(e) => setReceptorPath(e.target.value)}
              className="flex-1 px-4 py-2 border rounded-lg"
              placeholder="/absolute/path/to/receptor.pdbqt"
            />
          ) : (
            <>
              <input
                readOnly
                value={receptorFile ? receptorFile.name : ""}
                className="flex-1 px-4 py-2 border rounded-lg bg-gray-50"
                placeholder="Choose receptor file"
              />
              <button
                type="button"
                className="px-4 py-2 bg-blue-200 rounded-lg hover:bg-yellow-400"
                onClick={() => recRef.current.click()}
              >
                Browse
              </button>
              <input
                ref={recRef}
                type="file"
                className="hidden"
                accept=".pdb,.pdbqt"
                onChange={(e) => setReceptorFile(e.target.files[0])}
              />
            </>
          )}
        </div>
      </section>

      {/* LIGAND */}
      <section className="space-y-2">
        <label className="font-semibold text-gray-700 text-lg">Ligand</label>
        <div className="flex gap-2 items-center">
          <select
            value={ligMode}
            onChange={(e) => setLigMode(e.target.value)}
            className="px-3 py-2 border rounded-lg bg-gray-50"
          >
            <option value="path">Path</option>
            <option value="browse">Browse</option>
          </select>

          {ligMode === "path" ? (
            <input
              value={ligandPath}
              onChange={(e) => setLigandPath(e.target.value)}
              className="flex-1 px-4 py-2 border rounded-lg"
              placeholder="/absolute/path/to/ligand.pdbqt"
            />
          ) : (
            <>
              <input
                readOnly
                value={ligandFile ? ligandFile.name : ""}
                className="flex-1 px-4 py-2 border rounded-lg bg-gray-50"
                placeholder="Choose ligand file"
              />
              <button
                type="button"
                className="px-4 py-2 bg-blue-200 rounded-lg hover:bg-yellow-400"
                onClick={() => ligRef.current.click()}
              >
                Browse
              </button>
              <input
                ref={ligRef}
                type="file"
                className="hidden"
                accept=".pdb,.pdbqt"
                onChange={(e) => setLigandFile(e.target.files[0])}
              />
            </>
          )}
        </div>
      </section>

      {/* OUTPUT */}
      <section>
        <label className="font-semibold text-gray-700 text-lg">Output Folder</label>
        <input
          value={outputFolder}
          onChange={(e) => setOutputFolder(e.target.value)}
          className="w-full mt-2 px-4 py-2 border rounded-lg"
          placeholder="/absolute/path/to/output"
        />
      </section>

      {/* OPTIONS */}
      <section className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl border">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={removeWaters} onChange={(e) => setRemoveWaters(e.target.checked)} />
          Remove waters
        </label>

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={removeIons} onChange={(e) => setRemoveIons(e.target.checked)} />
          Remove ions
        </label>

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={addHydrogens} onChange={(e) => setAddHydrogens(e.target.checked)} />
          Add hydrogens
        </label>

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={keepHetero} onChange={(e) => setKeepHetero(e.target.checked)} />
          Keep heteroatoms
        </label>
      </section>

      {/* SUBMIT */}
      <section className="space-y-3">
        <button
          disabled={isWorking}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl disabled:opacity-60 transition"
        >
          {isWorking ? "Running…" : "Run PLIP"}
        </button>

        <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
          <div style={{ width: `${progress}%` }} className="h-2 bg-green-500 transition-all" />
        </div>

        <div className="text-sm text-gray-500">{status}</div>
      </section>

      {/* RESULTS */}
      {results && (
        <section className="mt-6 p-4 bg-gray-50 rounded-xl border">
          <h3 className="font-semibold text-lg">Results — Job {results.job}</h3>
          <p className="text-sm text-gray-600">Outdir: {results.outdir}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {results.results?.diagram && (
              <div className="p-3 bg-white rounded-xl border">
                <img
                  src={`/analysis/file?path=${encodeURIComponent(results.results.diagram)}`}
                  alt="diagram"
                  className="w-full rounded"
                />
              </div>
            )}

            <div className="p-3 bg-white rounded-xl border">
              <h4 className="font-medium">Files</h4>
              <ul className="mt-2 space-y-1 text-sm">
                {results.results?.json && (
                  <li>
                    <button className="text-blue-600 underline" onClick={() => openFile(results.results.json)}>
                      JSON
                    </button>
                  </li>
                )}

                {results.results?.report && (
                  <li>
                    <button className="text-blue-600 underline" onClick={() => openFile(results.results.report)}>
                      Summary
                    </button>
                  </li>
                )}

                {results.results?.raw && (
                  <li>
                    <button className="text-blue-600 underline" onClick={() => openFile(results.results.raw)}>
                      Raw
                    </button>
                  </li>
                )}
              </ul>
            </div>
          </div>

          {/* 3D Pose Viewer
          {results.poses && results.poses.length > 0 && (
            <section className="mt-6">
              <PlipPoseViewer poses={results.poses} />
            </section>
          )} */}
        </section>
      )}
    </form>
  );
}

