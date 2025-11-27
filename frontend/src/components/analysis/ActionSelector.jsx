// src/components/analysis/ActionSelector.jsx
// src/components/analysis/ActionSelector.jsx

export default function ActionSelector({ selectedAction, setSelectedAction }) {
  return (
    <div>
      <label className="block mb-2 font-medium">Select Analysis Type:</label>

      <select
        className="border border-gray-300 rounded px-4 py-2 w-full"
        value={selectedAction}
        onChange={(e) => setSelectedAction(e.target.value)}
      >
        <option value="">-- Choose an option --</option>

        <option value="plip">PLIP Analysis</option>
        <option value="scoring">Scoring Functions</option>
        <option value="converter">Format Converter</option>
        <option value="align-receptors">Align Receptors</option>


      </select>
    </div>
  );
}

  
