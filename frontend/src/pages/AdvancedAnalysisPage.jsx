import { useState } from "react";
import PlipForm from "../components/analysis/PlipForm";
import ScoringForm from "../components/analysis/ScoringForm";
import ResultsTable from "../components/analysis/ResultsTable";
import ConverterForm from "../components/analysis/ConverterForm";
import AlignReceptors from "../components/analysis/AlignReceptors";
import RFLScoreForm from "../components/analysis/RFLScoreForm";
import MolecularVisualization from "../components/analysis/MolecularVisualization"; 

import plipImg from "../assets/plip.png";
import scoringImg from "../assets/scoring1.jpg"; 
import rflImg from "../assets/rfl3.jpg";
import converterImg from "../assets/converter.jpg";
import alignImg from "../assets/align.jpg";
import visualizeImg from "../assets/visualize2.jpg"; 

export default function AdvancedAnalysisPage() {
  const [selectedAction, setSelectedAction] = useState("");
  const [clickedKey, setClickedKey] = useState(""); 
  const [csvPath, setCsvPath] = useState("");

  const getResultFilename = (method) =>
    ({
      rfscore: "rfscore_results.csv",
    }[method]);

  const actions = [
    {
      key: "visualize",
      title: "3D Molecular Visualization",
      desc: "Visualize docking results, analyze interactions, and explore structures in 3D.",
      img: visualizeImg,
      tags: ["3D", "plip", "interactive"],
    },
    {
      key: "plip",
      title: "PLIP Interaction Analysis",
      desc: "Analyze ligand–receptor interactions using PLIP.",
      img: plipImg,
      tags: ["protein", "ligand", "interactions"],
    },
    {
      key: "rfl-scoring",
      title: "RFL-Score ML Scoring function",
      desc: "Random Forest + Lasso ML scoring for pose rescoring.",
      img: rflImg,
      tags: ["ML", "scoring", "RFL+Lasso"],
    },
    {
      key: "scoring",
      title: "Traditional Scoring",
      desc: "Classical scoring functions for docking results.",
      img: scoringImg,
      tags: ["scoring", "docking", "vina"],
    },
    {
      key: "converter",
      title: "File Converter",
      desc: "Convert PDB, PDBQT, MOL2, CIF, SDF.",
      img: converterImg,
      tags: ["utility", "formats"],
    },

  ];

  const cardClick = (key) => {
    setClickedKey(key); 
    setTimeout(() => {
      setSelectedAction(key); 
    }, 300);
  };

  const handleBack = () => {
    setSelectedAction("");
    setClickedKey("");
    setCsvPath("");
  };

  return (
    <div className="bg-black-200 p-6 max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Advanced Analysis</h1>
      <span className="block mt-10 mb-6 text-4xl font-bold text-blue-700 dark:text-blue-400 tracking-tight">
        Advanced Analysis Tools
      </span>
      
      {/* ---------------- CARD GRID (2 cards per row) ---------------- */}
      {!selectedAction && (
        <div className="grid grid-cols-2 gap-6 mb-10 animate-fadeIn">
          {actions.map((a) => (
            <div
              key={a.key}
              onClick={() => cardClick(a.key)}
              className="card-animated-border relative cursor-pointer rounded-xl shadow-lg 
                         overflow-hidden border border-gray-300 bg-white
                         hover:-translate-y-1 hover:shadow-xl transition transform"
            >
              {/* ✓ Click animated border */}
              {clickedKey === a.key && (
                <span className="border-animation"></span>
              )}

              <div className="h-40 bg-gray-400">
                <img
                  src={a.img}
                  alt={a.title}
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="p-4">
                <h2 className="text-xl font-semibold">{a.title}</h2>
                <p className="text-gray-600 text-sm mt-1">{a.desc}</p>

                <div className="flex flex-wrap gap-2 mt-3">
                  {a.tags.map((t) => (
                    <span
                      key={t}
                      className="bg-blue-100 text-blue-700 px-2 py-1 text-xs rounded-full"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------------- SELECTED FORM ---------------- */}
      {selectedAction && (
        <div className="animate-fadeIn">
          <button
            onClick={handleBack}
            className="mb-6 px-4 py-2 bg-gray-200 hover:bg-blue-300 rounded-lg"
          >
            ← Back to Tools
          </button>

          {/* NEW: 3D Molecular Visualization */}
          {selectedAction === "visualize" && <MolecularVisualization />}
          
          {selectedAction === "plip" && <PlipForm />}
          
          {selectedAction === "rfl-scoring" && <RFLScoreForm />}
          
          {selectedAction === "scoring" && (
            <>
              <ScoringForm
                onSuccess={(folder, method) =>
                  setCsvPath(`${folder}/${getResultFilename(method)}`)
                }
              />

              {csvPath && (
                <div>
                  <h2 className="text-xl font-semibold mb-2">Scoring Results</h2>
                  <ResultsTable csvPath={csvPath} />
                </div>
              )}
            </>
          )}

          {selectedAction === "converter" && <ConverterForm />}
          {selectedAction === "align-receptors" && <AlignReceptors />}
        </div>
      )}

      <footer className="text-center text-sm text-gray-600 py-8">
        © Combi-Lab VS 3.0 2025. All rights reserved.
      </footer>
    </div>
  );
}
