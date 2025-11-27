import { useEffect, useState } from "react";
import axios from "../../axios";

export default function ResultsTable({ csvPath }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    const loadCSV = async () => {
      try {
        const res = await axios.get("/analysis/file?path=" + csvPath);
        const text = res.data;

        const lines = text.trim().split("\n");
        const header = lines[0].split(",");

        const data = lines.slice(1).map((line) => {
          const values = line.split(",");
          const row = {};

          header.forEach((h, i) => {
            row[h] = values[i];
          });

          return row;
        });

        setRows(data);
      } catch (err) {
        console.error("Failed to load CSV:", err);
      }
    };

    loadCSV();
  }, [csvPath]);

  if (rows.length === 0) return <p>No results found.</p>;

  const columns = Object.keys(rows[0]);

  return (
    <div className="overflow-x-auto border rounded">
      <table className="min-w-full text-sm text-left">
        <thead className="bg-gray-200">
          <tr>
            {columns.map((col) => (
              <th key={col} className="px-3 py-2 font-semibold border-r">
                {col}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-t hover:bg-gray-50">
              {columns.map((col) => (
                <td key={col} className="px-3 py-2">
                  {row[col]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

