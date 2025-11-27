// src/components/analysis/ScoresTable.jsx
import { useEffect, useState } from "react";
import Papa from "papaparse";
import api from "../../axios";

export default function ScoresTable({ folderPath, scoringMethod }) {
  const [data, setData] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const fileName =
      scoringMethod === "vina"
        ? "vina_scores.csv"
        : scoringMethod === "rfscore"
        ? "rfscore_results.csv"
        : "gnina_scores.sdf"; 

    const fetchCsv = async () => {
      try {
        const resp = await api.get("/advanced/scoring/csv", {
          params: { folder: folderPath, file: fileName },
          responseType: "blob",
        });

        const text = await resp.data.text();

        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => setData(results.data),
        });
      } catch (err) {
        console.error("Error loading CSV:", err);
        setError("❌ Could not load scores.");
      }
    };

    fetchCsv();
  }, [folderPath, scoringMethod]);

  if (error) return <p className="text-red-500">{error}</p>;
  if (data.length === 0) return <p>No scores found yet.</p>;

  return (
    <div className="mt-4 overflow-auto border rounded">
      <table className="min-w-full border-collapse">
        <thead className="bg-gray-200">
          <tr>
            {Object.keys(data[0]).map((col) => (
              <th key={col} className="px-4 py-2 border text-left">{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="hover:bg-gray-100">
              {Object.values(row).map((val, j) => (
                <td key={j} className="px-4 py-2 border">{val}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
