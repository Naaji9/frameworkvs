import { useState } from "react";

export default function VinaScoringUpload() {
  const [uploadMode, setUploadMode] = useState("single");
  const [files, setFiles] = useState([]);
  const [scoringDataList, setScoringDataList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: "affinity", direction: "asc" });
  const [viewMode, setViewMode] = useState("table");
  const [selectedFiles, setSelectedFiles] = useState([]);
  
  // NEW: Filter state
  const [filters, setFilters] = useState({
    minAffinity: -15,
    maxAffinity: 0,
    maxRMSD: 10,
    topN: null,
    showOnlyBest: false
  });

  const handleFileUpload = async (e) => {
    const uploadedFiles = Array.from(e.target.files);
    if (uploadedFiles.length === 0) return;

    setFiles(uploadedFiles);
    setError("");
    setLoading(true);

    try {
      const dataList = [];
      for (const file of uploadedFiles) {
        const text = await file.text();
        const scores = parseVinaOutput(text, file.name);
        dataList.push(scores);
      }
      setScoringDataList(dataList);
      setSelectedFiles(dataList.map((_, idx) => idx));
    } catch (err) {
      setError("Failed to parse file(s). Please ensure they are valid Vina output files.");
      setScoringDataList([]);
    } finally {
      setLoading(false);
    }
  };

  const parseVinaOutput = (text, fileName) => {
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
      fileName: fileName || "Unknown",
      timestamp: new Date().toISOString(),
      totalModels: models.length,
      models: models,
      bestAffinity: models.length > 0 ? Math.min(...models.map(m => m.affinity)) : null,
      avgAffinity: models.length > 0 ? models.reduce((sum, m) => sum + m.affinity, 0) / models.length : null
    };
  };

  // NEW: Filter logic
  const getFilteredData = (data) => {
    if (!data) return [];
    
    let filtered = data.models.filter(m => 
      m.affinity >= filters.minAffinity &&
      m.affinity <= filters.maxAffinity &&
      m.rmsdLower <= filters.maxRMSD
    );

    if (filters.showOnlyBest) {
      filtered = [filtered.sort((a, b) => a.affinity - b.affinity)[0]].filter(Boolean);
    }

    if (filters.topN && filters.topN > 0) {
      filtered = filtered.sort((a, b) => a.affinity - b.affinity).slice(0, filters.topN);
    }

    return filtered;
  };

  // NEW: Quick Insights
  const getQuickInsights = () => {
    if (scoringDataList.length === 0) return null;

    const allAffinities = scoringDataList.map(d => d.bestAffinity);
    const bestFile = scoringDataList.reduce((best, current) => 
      current.bestAffinity < best.bestAffinity ? current : best
    );
    const worstFile = scoringDataList.reduce((worst, current) => 
      current.bestAffinity > worst.bestAffinity ? current : worst
    );
    
    const avgAffinity = allAffinities.reduce((sum, val) => sum + val, 0) / allAffinities.length;
    const excellentCount = scoringDataList.filter(d => d.bestAffinity < -8).length;
    const goodCount = scoringDataList.filter(d => d.bestAffinity >= -8 && d.bestAffinity < -6).length;

    return {
      bestFile,
      worstFile,
      avgAffinity,
      excellentCount,
      goodCount,
      totalFiles: scoringDataList.length
    };
  };

  const sortData = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const getSortedModels = (data) => {
    if (!data) return [];
    
    const sorted = [...data.models].sort((a, b) => {
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
    if (scoringDataList.length === 0) return;

    let csvContent = "";

    if (uploadMode === "single") {
      const data = scoringDataList[0];
      csvContent = "Model,Binding Affinity (kcal/mol),RMSD l.b.,RMSD u.b.\n";
      data.models.forEach(m => {
        csvContent += `${m.model},${m.affinity.toFixed(2)},${m.rmsdLower.toFixed(3)},${m.rmsdUpper.toFixed(3)}\n`;
      });
    } else {
      csvContent = "File Name,Total Models,Best Affinity,Average Affinity\n";
      scoringDataList.forEach(data => {
        csvContent += `${data.fileName},${data.totalModels},${data.bestAffinity?.toFixed(2)},${data.avgAffinity?.toFixed(2)}\n`;
      });
    }

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vina_scoring_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadJSON = () => {
    if (scoringDataList.length === 0) return;

    const jsonData = JSON.stringify(scoringDataList, null, 2);
    const blob = new Blob([jsonData], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vina_scoring_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadReport = () => {
    if (scoringDataList.length === 0) return;

    let reportContent = `AUTODOCK VINA DOCKING RESULTS REPORT\n${"=".repeat(70)}\n\n`;
    reportContent += `Generated: ${new Date().toLocaleString()}\n`;
    reportContent += `Upload Mode: ${uploadMode === "single" ? "Single File" : "Multiple Files"}\n`;
    reportContent += `Total Files Analyzed: ${scoringDataList.length}\n\n`;

    scoringDataList.forEach((data, idx) => {
      reportContent += `${"=".repeat(70)}\n`;
      reportContent += `FILE ${idx + 1}: ${data.fileName}\n`;
      reportContent += `${"=".repeat(70)}\n\n`;
      reportContent += `Total Binding Modes: ${data.totalModels}\n`;
      reportContent += `Best Binding Affinity: ${data.bestAffinity?.toFixed(2)} kcal/mol\n`;
      reportContent += `Average Binding Affinity: ${data.avgAffinity?.toFixed(2)} kcal/mol\n\n`;
      
      reportContent += `${"Model".padEnd(10)}${"Affinity".padEnd(15)}${"RMSD l.b.".padEnd(15)}${"RMSD u.b.".padEnd(15)}\n`;
      reportContent += `${"".padEnd(10)}${"(kcal/mol)".padEnd(15)}${"(Å)".padEnd(15)}${"(Å)".padEnd(15)}\n`;
      reportContent += `${"-".repeat(55)}\n`;
      
      data.models.forEach(m => {
        reportContent += `${String(m.model).padEnd(10)}${m.affinity.toFixed(2).padEnd(15)}${m.rmsdLower.toFixed(3).padEnd(15)}${m.rmsdUpper.toFixed(3).padEnd(15)}\n`;
      });
      reportContent += `\n`;
    });

    const blob = new Blob([reportContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vina_report_${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleFileSelection = (idx) => {
    setSelectedFiles(prev => 
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    );
  };

  const SortIcon = ({ columnKey }) => {
    if (sortConfig.key !== columnKey) {
      return <span style={{ opacity: 0.3 }}>▼</span>;
    }
    return sortConfig.direction === "asc" ? <span>▲</span> : <span>▼</span>;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-xl p-8 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                AutoDock Vina Scoring Analysis
              </h1>
              <p className="text-gray-600">
                Advanced analysis with filters, insights, and export options
              </p>
            </div>
            <div className="text-5xl">📃</div>
          </div>

          {/* Upload Mode Toggle */}
          <div className="mb-6 flex gap-4">
            <button
              onClick={() => {
                setUploadMode("single");
                setFiles([]);
                setScoringDataList([]);
                setViewMode("table");
              }}
              className={`px-6 py-3 rounded-lg font-semibold transition-all ${
                uploadMode === "single"
                  ? "bg-indigo-600 text-white shadow-lg"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              📄 Single File Mode
            </button>
            <button
              onClick={() => {
                setUploadMode("multiple");
                setFiles([]);
                setScoringDataList([]);
                setViewMode("table");
              }}
              className={`px-6 py-3 rounded-lg font-semibold transition-all ${
                uploadMode === "multiple"
                  ? "bg-indigo-600 text-white shadow-lg"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              📁 Multiple Files Mode
            </button>
          </div>

          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-indigo-500 transition-colors">
            <div className="text-5xl mb-4">➜]</div>
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
                multiple={uploadMode === "multiple"}
              />
            </label>
            <p className="text-sm text-gray-500 mt-2">
              {uploadMode === "single" ? "Single PDBQT/PDB file" : "Multiple PDBQT/PDB files"}
            </p>
          </div>

          {files.length > 0 && (
            <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-gray-700 font-semibold mb-2">
                Selected file{files.length > 1 ? "s" : ""}:
              </p>
              <div className="space-y-1">
                {files.map((file, idx) => (
                  <p key={idx} className="text-sm text-gray-600">
                    • {file.name}
                  </p>
                ))}
              </div>
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

        {scoringDataList.length > 0 && !loading && (
          <>
            {/* NEW: Quick Insights Dashboard */}
            {scoringDataList.length > 1 && uploadMode === "multiple" && (() => {
              const insights = getQuickInsights();
              return (
                <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg shadow-xl p-6 mb-6">
                  <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <span>🎯</span> Quick Insights
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    
                    <div className="bg-white p-4 rounded-lg border-2 border-green-300 shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-2xl">🏆</span>
                        <p className="text-sm font-semibold text-gray-600">Best Compound</p>
                      </div>
                      <p className="text-xs text-gray-700 truncate mb-1">{insights.bestFile.fileName}</p>
                      <p className="text-2xl font-bold text-green-700">
                        {insights.bestFile.bestAffinity.toFixed(2)} kcal/mol
                      </p>
                    </div>

                    <div className="bg-white p-4 rounded-lg border-2 border-blue-300 shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-2xl">📊</span>
                        <p className="text-sm font-semibold text-gray-600">Average Affinity</p>
                      </div>
                      <p className="text-2xl font-bold text-blue-700">
                        {insights.avgAffinity.toFixed(2)} kcal/mol
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Across {insights.totalFiles} files</p>
                    </div>

                    <div className="bg-white p-4 rounded-lg border-2 border-purple-300 shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-2xl">⭐</span>
                        <p className="text-sm font-semibold text-gray-600">Quality Distribution</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm"><span className="font-bold text-green-700">{insights.excellentCount}</span> Excellent</p>
                        <p className="text-sm"><span className="font-bold text-blue-700">{insights.goodCount}</span> Good</p>
                        <p className="text-sm"><span className="font-bold text-yellow-700">{insights.totalFiles - insights.excellentCount - insights.goodCount}</span> Fair</p>
                      </div>
                    </div>

                    <div className="bg-white p-4 rounded-lg border-2 border-red-300 shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-2xl">⚠️</span>
                        <p className="text-sm font-semibold text-gray-600">Weakest Binder</p>
                      </div>
                      <p className="text-xs text-gray-700 truncate mb-1">{insights.worstFile.fileName}</p>
                      <p className="text-2xl font-bold text-red-700">
                        {insights.worstFile.bestAffinity.toFixed(2)} kcal/mol
                      </p>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* NEW: Filter Panel */}
            <div className="mb-6 p-6 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border-2 border-purple-200">
              <h3 className="text-lg font-bold text-gray-800 mb-4"> Filters & Options</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Min Affinity (kcal/mol)
                  </label>
                  <input
                    type="number"
                    value={filters.minAffinity}
                    onChange={(e) => setFilters({...filters, minAffinity: parseFloat(e.target.value)})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    step="0.5"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Max Affinity (kcal/mol)
                  </label>
                  <input
                    type="number"
                    value={filters.maxAffinity}
                    onChange={(e) => setFilters({...filters, maxAffinity: parseFloat(e.target.value)})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    step="0.5"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Max RMSD (Å)
                  </label>
                  <input
                    type="number"
                    value={filters.maxRMSD}
                    onChange={(e) => setFilters({...filters, maxRMSD: parseFloat(e.target.value)})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    step="0.5"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Show Top N Models
                  </label>
                  <select
                    value={filters.topN || "all"}
                    onChange={(e) => setFilters({...filters, topN: e.target.value === "all" ? null : parseInt(e.target.value)})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="all">All Models</option>
                    <option value="5">Top 5</option>
                    <option value="10">Top 10</option>
                    <option value="20">Top 20</option>
                  </select>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="showOnlyBest"
                  checked={filters.showOnlyBest}
                  onChange={(e) => setFilters({...filters, showOnlyBest: e.target.checked})}
                  className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                />
                <label htmlFor="showOnlyBest" className="text-sm font-medium text-gray-700">
                  Show only best pose per file
                </label>
              </div>

              <button
                onClick={() => setFilters({
                  minAffinity: -15,
                  maxAffinity: 0,
                  maxRMSD: 10,
                  topN: null,
                  showOnlyBest: false
                })}
                className="mt-4 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Reset Filters
              </button>
            </div>

            {/* Download Buttons */}
            <div className="bg-white rounded-lg shadow-xl p-6 mb-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4">📥 Export Options</h3>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={downloadCSV}
                  className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
                >
                  <span>⬇️</span> CSV
                </button>
                <button
                  onClick={downloadJSON}
                  className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <span>⬇️</span> JSON
                </button>
                <button
                  onClick={downloadReport}
                  className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  <span>⬇️</span> Full Report
                </button>
              </div>
            </div>

            {/* Table View */}
            <div className="space-y-6">
              {scoringDataList.map((data, fileIdx) => (
                <div key={fileIdx} className="bg-white rounded-lg shadow-xl p-8">
                  <div className="mb-6">
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">
                      {data.fileName}
                    </h2>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200">
                        <p className="text-sm text-gray-600 mb-1">Total Binding Modes</p>
                        <p className="text-2xl font-bold text-blue-700">{data.totalModels}</p>
                      </div>
                      <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg border border-green-200">
                        <p className="text-sm text-gray-600 mb-1">Best Affinity</p>
                        <p className="text-2xl font-bold text-green-700">
                          {data.bestAffinity?.toFixed(2)} kcal/mol
                        </p>
                      </div>
                      <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg border border-purple-200">
                        <p className="text-sm text-gray-600 mb-1">Avg Affinity</p>
                        <p className="text-2xl font-bold text-purple-700">
                          {data.avgAffinity?.toFixed(2)} kcal/mol
                        </p>
                      </div>
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
                          <th className="px-6 py-4 text-left font-semibold">Rank</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getFilteredData(data).length > 0 ? (
                          getSortedModels({...data, models: getFilteredData(data)}).map((model, idx) => {
                            const isBest = model.affinity === data.bestAffinity;
                            
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
                          })
                        ) : (
                          <tr>
                            <td colSpan="5" className="px-6 py-8 text-center text-gray-500">
                              No models match the current filters. Try adjusting your criteria.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>

            {/* Interpretation Guide */}
            <div className="bg-white rounded-lg shadow-xl p-6 mt-6">
              <h3 className="font-semibold text-gray-800 mb-3 text-lg"> Interpretation Guide</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <h4 className="font-semibold text-blue-900 mb-2">Binding Affinity</h4>
                  <p className="text-sm text-gray-700">
                    More negative values indicate stronger predicted binding. Typical range: -5 to -15 kcal/mol.
                    Values below -8 are considered excellent.
                  </p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                  <h4 className="font-semibold text-green-900 mb-2">RMSD (Root Mean Square Deviation)</h4>
                  <p className="text-sm text-gray-700">
                    Measures structural similarity to the best-scoring pose. Lower values indicate similar binding modes.
                  </p>
                </div>
                <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                  <h4 className="font-semibold text-purple-900 mb-2">Quality Scores</h4>
                  <p className="text-sm text-gray-700">
                    <span className="font-medium">Excellent:</span> &lt; -8 kcal/mol | 
                    <span className="font-medium"> Good:</span> -6 to -8 kcal/mol | 
                    <span className="font-medium"> Fair:</span> &gt; -6 kcal/mol
                  </p>
                </div>
                <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                  <h4 className="font-semibold text-yellow-900 mb-2">Best Practices</h4>
                  <p className="text-sm text-gray-700">
                    Consider both affinity and RMSD. Multiple similar poses (low RMSD) with good affinity suggest reliable predictions.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
