import React, { useEffect, useRef } from "react";

export default function PlipViewer({ pdbUrl, height = 500 }) {
  const viewerRef = useRef(null);

  useEffect(() => {
    if (!window.$3Dmol) {
      console.error("3Dmol.js NOT loaded.");
      return;
    }

    const element = viewerRef.current;

    // Clear any previous viewer
    element.innerHTML = "";

    // Correct constructor for the version you're using
    const viewer = window.$3Dmol.createViewer(element, {
      defaultcolors: window.$3Dmol.rasmolElementColors,
      backgroundColor: "white",
    });

    window.$3Dmol.download(pdbUrl, viewer, {}, () => {
      // Protein
      viewer.setStyle(
        { hetflag: false },
        { cartoon: { color: "spectrum" } }
      );

      // Ligand
      viewer.setStyle(
        { hetflag: true, resn: ["LIG", "UNL", "MOL"] },
        { stick: { radius: 0.22, colorscheme: "element" } }
      );

      // Waters
      viewer.setStyle(
        { resn: "HOH" },
        { sphere: { radius: 0.5, color: "red" } }
      );

      // Metal ions
      viewer.setStyle(
        { elem: ["ZN", "MG", "MN", "CA", "FE"] },
        { sphere: { radius: 0.8, color: "magenta" } }
      );

      viewer.zoomTo();
      viewer.render();
    });
  }, [pdbUrl]);

  return (
    <div
      ref={viewerRef}
      style={{
        width: "100%",
        height: `${height}px`,
        borderRadius: "12px",
        background: "white",
      }}
    />
  );
}

