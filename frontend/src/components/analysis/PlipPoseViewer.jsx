import React, { useEffect, useState } from "react";
import PlipViewer from "./PlipViewer";

export default function PlipPoseViewer({ poses }) {
  const [selected, setSelected] = useState(0);

  if (!poses || poses.length === 0) {
    return <div className="text-gray-500 text-sm">No poses available.</div>;
  }

  const current = poses[selected];

  // Transform backend paths into accessible URLs
  const pdbUrl = current.complex_cleaned
    ? `/analysis/file?path=${encodeURIComponent(current.complex_cleaned)}`
    : `/analysis/file?path=${encodeURIComponent(current.complex_pdb)}`;

  const annotationUrl = current.json
    ? `/analysis/file?path=${encodeURIComponent(current.json)}`
    : null;

  return (
    <div className="mt-6 p-4 border rounded bg-gray-50">
      {/* Pose Selector */}
      <div className="mb-4">
        <label className="font-semibold mr-3">Select Pose:</label>
        <select
          value={selected}
          onChange={(e) => setSelected(parseInt(e.target.value))}
          className="border px-2 py-1 rounded"
        >
          {poses.map((pose, i) => (
            <option key={i} value={i}>
              Pose {pose.pose} {pose.error ? "(Error)" : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Viewer */}
      <PlipViewer
        pdbUrl={pdbUrl}
        annotationsUrl={annotationUrl}
        height={560}
      />

      {/* File Links */}
      <div className="mt-4 p-3 bg-white border rounded text-sm">
        <div><strong>Pose Folder:</strong> {current.folder}</div>
        {current.complex_cleaned && (
          <div>
            <a
              className="text-blue-600 underline"
              href={`/analysis/file?path=${encodeURIComponent(current.complex_cleaned)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Download Cleaned Complex PDB
            </a>
          </div>
        )}
        {current.json && (
          <div>
            <a
              className="text-blue-600 underline"
              href={`/analysis/file?path=${encodeURIComponent(current.json)}`}
              target="_blank"
            >
              View PLIP JSON
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

