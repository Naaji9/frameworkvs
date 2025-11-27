import React from "react";

export default function DocumentationPage() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-6"> FrameworkVS 3.0 – User Guide</h1>

      <p className="mb-4 text-lg">
        Welcome to the official user guide for <strong>FrameworkVS 3.0</strong>, your all-in-one
        platform for virtual screening, batch docking, and advanced analysis of
        protein-ligand interactions. This documentation is designed to help you fully understand
        and utilize every feature of the system, with interactive tips and visual aids.
      </p>

      <h2 className="text-xl font-semibold mt-6 mb-2">Table of Contents</h2>
      <ul className="list-disc list-inside text-base mb-6 space-y-1">
        <li>Introduction</li>
        <li>System Overview</li>
        <li>Home Page Navigation</li>
        <li>New Docking Setup</li>
        <li>Advanced Analysis Tools</li>
        <li>Tips and Troubleshooting</li>
        <li>❓ FAQ</li>
      </ul>

      <h2 className="text-xl font-semibold mt-6 mb-2">📌 How to Use</h2>
      <p className="mb-4">
        Use the links above to jump to the relevant sections. Each section includes detailed guidance,
        screenshots, and expected outputs. FrameworkVS 3.0 allows:
      </p>
      <ul className="list-disc list-inside mb-4 pl-4 text-base">
        <li>Uploading ligands and receptors as files or folders</li>
        <li>Running single or batch docking setups</li>
        <li>Setting and iterating grid box coordinates (box center, size, step)</li>
        <li>Generating ready-to-run scripts (`vsframework.py`)</li>
        <li>Real-time 3D visualization using NGL Viewer</li>
        <li>Automatic format conversion (.pdb, .mol2, .sdf, .cif → .pdbqt)</li>
        <li>Running advanced scoring with PLIP and machine learning models</li>
      </ul>

      <h2 className="text-xl font-semibold mt-6 mb-2">🖼️ Sample Screenshots</h2>
      <div className="space-y-4">
        <div>
          <p className="mb-1 font-medium">🔹 Navigation Bar Example</p>
          <img src="/images/1dabf360-5ca1-4fec-ba78-4a08f3975c60.png" alt="Navigation bar" className="border rounded shadow-md" />
        </div>
        <div>
          <p className="mb-1 font-medium">🔹 Interface Example – Analysis Panel</p>
          <img src="/images/ab78eba6-ec4b-4e7f-9e5e-95736b935d7d.png" alt="Analysis interface" className="border rounded shadow-md" />
        </div>
      </div>

      <p className="text-sm text-gray-500 mt-6">
        Full section breakdowns and interactive walkthroughs are being added. Stay tuned for more updates!
      </p>
                  {/* Footer pinned to bottom */}
      <footer className="relative z-10 text-center text-sm text-gray-600 py-4">
        © Combi-Lab VS 2025. All rights reserved.
      </footer>
    </div>
  );
}
