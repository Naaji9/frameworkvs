import { useEffect, useRef } from "react";

interface ViewerProps {
  pdbqtContent: string;
  box?: {
    centerX: string;
    centerY: string;
    centerZ: string;
    sizeX: string;
    sizeY: string;
    sizeZ: string;
  };
}

declare global {
  interface Window {
    $3Dmol: any;
  }
}

export default function ThreeDMolViewer({ pdbqtContent, box }: ViewerProps) {
  const viewerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pdbqtContent || !viewerRef.current || !window.$3Dmol) return;

    const element = viewerRef.current;
    element.innerHTML = "";

    const viewer = window.$3Dmol.createViewer(element, {
      backgroundColor: "white",
    });

    viewer.addModel(pdbqtContent, "pdbqt");
    viewer.setStyle({}, { stick: {}, cartoon: { color: "spectrum" } });
    viewer.zoomTo();

    if (box) {
      const center = {
        x: parseFloat(box.centerX),
        y: parseFloat(box.centerY),
        z: parseFloat(box.centerZ),
      };
      const dimensions = {
        w: parseFloat(box.sizeX),
        h: parseFloat(box.sizeY),
        d: parseFloat(box.sizeZ),
      };

      viewer.addBox({
        center,
        dimensions,
        color: "red",
        opacity: 0.3,
        wireframe: true,
      });
    }

    viewer.render();
  }, [pdbqtContent, box]);

  return <div ref={viewerRef} style={{ width: "100%", height: "400px" }} />;
}

