import { useState } from "react";
import axios from "../../axios";
import ScoresTable from "./ScoresTable";

export default function ScoringForm() {
  const [resultsPath, setResultsPath] = useState("");
  const [scoringMethod, setScoringMethod] = useState("vina");
  const [outputFolder, setOutputFolder] = useState("");
  const [status, setStatus] = useState("");
  const [showTable, setShowTable] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus("Running scoring function...");
    setShowTable(false);

    try {
      const response = await axios.post("/advanced/scoring", {
        results_path: resultsPath,
        scoring_method: scoringMethod,
        output_folder: outputFolder,
      });

      setStatus(`✅ Success: ${response.data.message}`);
      setShowTable(true);

    } catch (err) {
      console.error(err);
      setStatus(`❌ Error: ${err.response?.data?.detail || err.message || "Unexpected error"}`);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block font-medium mb-1">Results File or Folder Path</label>
          <input
            type="text"
            className="border border-gray-300 rounded px-3 py-2 w-full"
            value={resultsPath}
            onChange={(e) => setResultsPath(e.target.value)}
            placeholder="/path/to/results"
            required
          />
        </div>

        <div>
          <label className="block font-medium mb-1">Select Scoring Method</label>
          <select
            className="border border-gray-300 rounded px-4 py-2 w-full"
            value={scoringMethod}
            onChange={(e) => setScoringMethod(e.target.value)}
          >
            <option value="vina">Vina Score</option>
            <option value="rfscore">RF-Score</option>
            <option value="gnina">Gnina Score</option>
          </select>
        </div>

        <div>
          <label className="block font-medium mb-1">Output Folder</label>
          <input
            type="text"
            className="border border-gray-300 rounded px-3 py-2 w-full"
            value={outputFolder}
            onChange={(e) => setOutputFolder(e.target.value)}
            placeholder="/path/to/output"
            required
          />
        </div>

        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Run Scoring
        </button>

        {status && <p className="mt-2">{status}</p>}
      </form>

      {showTable && (
        <ScoresTable folderPath={outputFolder} scoringMethod={scoringMethod} />
      )}
    </>
  );
}
