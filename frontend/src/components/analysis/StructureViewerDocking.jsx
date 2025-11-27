// frontend/src/components/analysis/StructureViewerDocking.jsx
import { useEffect, useRef, useState } from "react";

/**
 * Props:
 *  - receptorText: string (PDB/PDBQT text)
 *  - ligandText: string (PDB/PDBQT/MOL2 text)
 *  - poses: array of {name, text, affinity} (optional)
 *
 * This component will:
 *  - create a 3Dmol viewer
 *  - add receptor (cartoon) and ligand (stick)
 *  - detect interactions by distance and draw lines
 *  - zoom to ligand centroid (binding pocket)
 *  - expose a simple pose selector (if poses provided)
 */
export default function StructureViewerDocking({
  receptorText,
  ligandText,
  poses = [],
}) {
  const viewerRef = useRef(null);
  const [selectedPoseIndex, setSelectedPoseIndex] = useState(0);

  // compute centroid of atoms in a model (model is an array of atoms)
  const calcCentroid = (atoms) => {
    if (!atoms || atoms.length === 0) return null;
    let cx = 0,
      cy = 0,
      cz = 0;
    atoms.forEach((a) => {
      cx += a.x;
      cy += a.y;
      cz += a.z;
    });
    return { x: cx / atoms.length, y: cy / atoms.length, z: cz / atoms.length };
  };

  // draw interaction lines between ligand and receptor atoms (distance-based)
  const drawInteractions = (viewer, receptorAtoms, ligandAtoms) => {
    // threshold distances (Å)
    const hbondMax = 3.6; // H-bond / close contact threshold
    const contactMax = 4.2;

    const interactions = [];

    ligandAtoms.forEach((la) => {
      receptorAtoms.forEach((ra) => {
        const dx = la.x - ra.x;
        const dy = la.y - ra.y;
        const dz = la.z - ra.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist <= hbondMax) {
          // H-bond / close contact
          interactions.push({
            type: "hb",
            d: dist,
            start: { x: la.x, y: la.y, z: la.z },
            end: { x: ra.x, y: ra.y, z: ra.z },
            la,
            ra,
          });
        } else if (dist <= contactMax) {
          // hydrophobic / van der waals contact
          interactions.push({
            type: "contact",
            d: dist,
            start: { x: la.x, y: la.y, z: la.z },
            end: { x: ra.x, y: ra.y, z: ra.z },
            la,
            ra,
          });
        }
      });
    });

    // Draw lines: H-bond = yellow dashed, contact = green dashed
    interactions.forEach((it) => {
      viewer.addLine({
        start: it.start,
        end: it.end,
        dashed: true,
        color: it.type === "hb" ? "yellow" : "green",
        linewidth: 2,
      });
    });

    return interactions;
  };

  // main rendering effect
  useEffect(() => {
    if (!window.$3Dmol) {
      console.error("3Dmol.js not loaded. Add <script src='https://3Dmol.csb.pitt.edu/build/3Dmol-min.js'></script> to index.html");
      return;
    }

    // require receptor and ligand text
    if (!receptorText || !ligandText) return;

    const container = viewerRef.current;
    container.innerHTML = "";

    const viewer = window.$3Dmol.createViewer(container, {
      backgroundColor: "white",
      defaultcolors: window.$3Dmol.rasmolElementColors,
    });

    // add receptor model
    const receptorModelId = viewer.addModel(receptorText, "pdb"); // model 0
    // add ligand model (pose or uploaded ligand)
    const ligandModelId = viewer.addModel(poses.length ? poses[selectedPoseIndex].text : ligandText, "pdb"); // model 1

    // style receptor
    viewer.setStyle(receptorModelId, { cartoon: { color: "spectrum" } });

    // style ligand
    viewer.setStyle(ligandModelId, { stick: { radius: 0.2 } });

    // render to build internal atoms list
    viewer.render();

    // select atoms for computations
    const receptorAtoms = viewer.getModel(receptorModelId).selectedAtoms({});
    const ligandAtoms = viewer.getModel(ligandModelId).selectedAtoms({});

    // centroid -> zoom pocket
    const ligandCentroid = calcCentroid(ligandAtoms);
    if (ligandCentroid) {
      viewer.zoomTo({ center: ligandCentroid, radius: 8 });
    } else {
      viewer.zoomTo();
    }

    // draw interactions
    const interactions = drawInteractions(viewer, receptorAtoms, ligandAtoms);

    // add labels for distances for close interactions (a few)
    interactions.slice(0, 20).forEach((it, idx) => {
      const mid = {
        x: (it.start.x + it.end.x) / 2,
        y: (it.start.y + it.end.y) / 2,
        z: (it.start.z + it.end.z) / 2,
      };
      viewer.addLabel(it.d.toFixed(2) + " Å", {
        position: mid,
        backgroundColor: it.type === "hb" ? "rgba(255,215,0,0.9)" : "rgba(144,238,144,0.9)",
        fontSize: 12,
        fontColor: "#000000",
      });
    });

    viewer.render();

    // cleanup function
    return () => {
      try {
        viewer.clear();
        container.innerHTML = "";
      } catch (e) {}
    };
  }, [receptorText, ligandText, poses, selectedPoseIndex]);

  return (
    <div>
      {/* Pose selector (if poses provided) */}
      {poses && poses.length > 0 && (
        <div className="mb-3">
          <label className="font-semibold mr-2">Pose:</label>
          <select
            value={selectedPoseIndex}
            onChange={(e) => setSelectedPoseIndex(Number(e.target.value))}
            className="border rounded px-2 py-1"
          >
            {poses.map((p, i) => (
              <option key={i} value={i}>
                {p.name ?? `Pose ${i + 1}`} {p.affinity ? ` — ${p.affinity} kcal/mol` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* viewer container */}
      <div
        ref={viewerRef}
        style={{ width: "100%", height: "520px", border: "1px solid #e2e8f0", borderRadius: 8 }}
      />
    </div>
  );
}

