import { useState } from "react";

export default function VinaScoringUpload() {
  const [file, setFile] = useState(null);
  const [scoringData, setScoringData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: "affinity", direction: "asc" });

  const handleFileUpload = async (e) => {
    const uploadedFile = e.target.files[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setError("");
    setLoading(true);

    try {
      const text = await uploadedFile.text();
      const scores = parseVinaOutput(text);
      setScoringData(scores);
    } catch (err) {
      setError("Failed to parse file. Please ensure it's a valid Vina output file.");
      setScoringData(null);
    } finally {
      setLoading(false);
    }
  };

  const parseVinaOutput = (text) => {
    const lines = text.split("\n");
    const models = [];
    let currentModel = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith("MODEL")) {
        const modelNum = line.match(/MODEL\s+(\d+)/)?.[1];
        currentModel = {
          model: parseInt(modelNum) || models.length + 1,
          affinity: null,
          rmsdLower: null,
          rmsdUpper: null,
          atoms: []
        };
      } else if (line.includes("REMARK VINA RESULT:")) {
        const parts = line.split(/\s+/);
        if (currentModel && parts.length >= 6) {
          currentModel.affinity = parseFloat(parts[3]);
          currentModel.rmsdLower = parseFloat(parts[4]);
          currentModel.rmsdUpper = parseFloat(parts[5]);
        }
      } else if (line.startsWith("ENDMDL") && currentModel) {
        models.push(currentModel);
        currentModel = null;
      } else if (line.startsWith("ATOM") && currentModel) {
        currentModel.atoms.push(line);
      }
    }

    return {
      fileName: file?.name || "Unknown",
      timestamp: new Date().toISOString(),
      totalModels: models.length,
      models: models,
      bestAffinity: models.length > 0 ? Math.min(...models.map(m => m.affinity)) : null
    };
  };

  const sortData = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const getSortedModels = () => {
    if (!scoringData) return [];
    
    const sorted = [...scoringData.models].sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];

      if (sortConfig.direction === "asc") {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    return sorted;
  };

  const downloadCSV = () => {
    if (!scoringData) return;

    const headers = ["Model", "Binding Affinity (kcal/mol)", "RMSD l.b.", "RMSD u.b."];
    const rows = scoringData.models.map(m => [
      m.model,
      m.affinity.toFixed(2),
      m.rmsdLower.toFixed(3),
      m.rmsdUpper.toFixed(3)
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vina_scoring_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPDF = () => {
    if (!scoringData) return;

    let pdfContent = `AUTODOCK VINA DOCKING RESULTS
${"=".repeat(60)}

File: ${scoringData.fileName}
Analysis Date: ${new Date(scoringData.timestamp).toLocaleString()}
Total Binding Modes: ${scoringData.totalModels}
Best Binding Affinity: ${scoringData.bestAffinity?.toFixed(2)} kcal/mol

${"=".repeat(60)}

BINDING MODES SUMMARY:

${"Model".padEnd(8)}${"Affinity".padEnd(15)}${"RMSD l.b.".padEnd(15)}${"RMSD u.b.".padEnd(15)}
${"".padEnd(8)}${"(kcal/mol)".padEnd(15)}${"(Å)".padEnd(15)}${"(Å)".padEnd(15)}
${"-".repeat(60)}
`;

    scoringData.models.forEach(m => {
      pdfContent += `${String(m.model).padEnd(8)}${m.affinity.toFixed(2).padEnd(15)}${m.rmsdLower.toFixed(3).padEnd(15)}${m.rmsdUpper.toFixed(3).padEnd(15)}\n`;
    });

    pdfContent += `
${"=".repeat(60)}

NOTES:
- Affinity: Predicted binding affinity in kcal/mol (more negative = stronger binding)
- RMSD l.b.: Root Mean Square Deviation lower bound from best mode
- RMSD u.b.: Root Mean Square Deviation upper bound from best mode
- Models are ranked by binding affinity
`;

    const blob = new Blob([pdfContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vina_docking_report_${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortIcon = ({ columnKey }) => {
    if (sortConfig.key !== columnKey) {
      return <span style={{ opacity: 0.3 }}>▼</span>;
    }
    return sortConfig.direction === "asc" ? <span>▲</span> : <span>▼</span>;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-xl p-8 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                AutoDock Vina Scoring Analysis
              </h1>
              <p className="text-gray-600">
                Upload your Vina docking result file (PDBQT format) for comprehensive scoring analysis
              </p>
            </div>
            <div className="text-5xl">📄</div>
          </div>

          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-indigo-500 transition-colors">
            <div className="text-5xl mb-4">⬆️</div>
            <label className="cursor-pointer">
              <span className="text-indigo-600 font-semibold hover:text-indigo-700">
                Click to upload
              </span>
              <span className="text-gray-600"> or drag and drop</span>
              <input
                type="file"
                className="hidden"
                accept=".pdbqt,.pdb"
                onChange={handleFileUpload}
              />
            </label>
            <p className="text-sm text-gray-500 mt-2">PDBQT or PDB files only</p>
          </div>

          {file && (
            <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-gray-700">
                <span className="font-semibold">Selected file:</span> {file.name}
              </p>
            </div>
          )}

          {error && (
            <div className="mt-4 p-4 bg-red-50 rounded-lg border border-red-200">
              <p className="text-sm text-red-700">❌ {error}</p>
            </div>
          )}

          {loading && (
            <div className="mt-6 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent"></div>
              <p className="mt-2 text-gray-600">Analyzing docking results...</p>
            </div>
          )}
        </div>

        {scoringData && !loading && (
          <div className="bg-white rounded-lg shadow-xl p-8">
            <div className="flex justify-between items-center mb-6">
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">Scoring Results</h2>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200">
                    <p className="text-sm text-gray-600 mb-1">Total Binding Modes</p>
                    <p className="text-2xl font-bold text-blue-700">{scoringData.totalModels}</p>
                  </div>
                  <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg border border-green-200">
                    <p className="text-sm text-gray-600 mb-1">Best Affinity</p>
                    <p className="text-2xl font-bold text-green-700">
                      {scoringData.bestAffinity?.toFixed(2)} kcal/mol
                    </p>
                  </div>
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg border border-purple-200">
                    <p className="text-sm text-gray-600 mb-1">Analysis Date</p>
                    <p className="text-sm font-semibold text-purple-700">
                      {new Date(scoringData.timestamp).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 ml-4">
                <button
                  onClick={downloadCSV}
                  className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
                >
                  <span>⬇️</span>
                  CSV
                </button>
                <button
                  onClick={downloadPDF}
                  className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  <span>⬇️</span>
                  Report
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white">
                    <th 
                      className="px-6 py-4 text-left font-semibold cursor-pointer hover:bg-indigo-700 transition-colors"
                      onClick={() => sortData("model")}
                    >
                      <div className="flex items-center gap-2">
                        Model
                        <SortIcon columnKey="model" />
                      </div>
                    </th>
                    <th 
                      className="px-6 py-4 text-left font-semibold cursor-pointer hover:bg-indigo-700 transition-colors"
                      onClick={() => sortData("affinity")}
                    >
                      <div className="flex items-center gap-2">
                        Binding Affinity (kcal/mol)
                        <SortIcon columnKey="affinity" />
                      </div>
                    </th>
                    <th 
                      className="px-6 py-4 text-left font-semibold cursor-pointer hover:bg-indigo-700 transition-colors"
                      onClick={() => sortData("rmsdLower")}
                    >
                      <div className="flex items-center gap-2">
                        RMSD l.b. (Å)
                        <SortIcon columnKey="rmsdLower" />
                      </div>
                    </th>
                    <th 
                      className="px-6 py-4 text-left font-semibold cursor-pointer hover:bg-indigo-700 transition-colors"
                      onClick={() => sortData("rmsdUpper")}
                    >
                      <div className="flex items-center gap-2">
                        RMSD u.b. (Å)
                        <SortIcon columnKey="rmsdUpper" />
                      </div>
                    </th>
                    <th className="px-6 py-4 text-left font-semibold">
                      Rank
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {getSortedModels().map((model, idx) => {
                    const isBest = model.affinity === scoringData.bestAffinity;
                    
                    return (
                      <tr
                        key={idx}
                        className={`border-b border-gray-200 hover:bg-gray-50 transition-colors ${
                          isBest ? "bg-green-50" : ""
                        }`}
                      >
                        <td className="px-6 py-4 font-medium text-gray-900">
                          {model.model}
                          {isBest && (
                            <span className="ml-2 text-xs bg-green-500 text-white px-2 py-1 rounded-full">
                              ⭐ Best
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`font-semibold ${
                            model.affinity < -8 ? "text-green-700" :
                            model.affinity < -6 ? "text-blue-700" :
                            "text-gray-700"
                          }`}>
                            {model.affinity.toFixed(2)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-700">
                          {model.rmsdLower.toFixed(3)}
                        </td>
                        <td className="px-6 py-4 text-gray-700">
                          {model.rmsdUpper.toFixed(3)}
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center justify-center w-8 h-8 bg-indigo-100 text-indigo-700 rounded-full font-semibold">
                            {idx + 1}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h3 className="font-semibold text-gray-800 mb-2">📊 Interpretation Guide:</h3>
              <ul className="text-sm text-gray-700 space-y-1">
                <li><span className="font-medium">Binding Affinity:</span> More negative values indicate stronger predicted binding (typical range: -5 to -15 kcal/mol)</li>
                <li><span className="font-medium">RMSD (Root Mean Square Deviation):</span> Measures structural similarity to the best-scoring pose</li>
                <li><span className="font-medium">l.b. (lower bound):</span> Minimum RMSD from the best mode</li>
                <li><span className="font-medium">u.b. (upper bound):</span> Maximum RMSD considering symmetry</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
