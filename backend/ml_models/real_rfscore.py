# real_rfscore.py
import argparse
import os
import numpy as np
import joblib
from openbabel import openbabel as ob

# Atom types considered in RF-Score 
ATOM_TYPES = ["C", "N", "O", "F", "P", "S"]
CUTOFF = 12.0


def load_structure(path):
    conv = ob.OBConversion()
    conv.SetInFormat("pdbqt" if path.endswith("pdbqt") else "pdb")
    mol = ob.OBMol()
    conv.ReadFile(mol, path)
    atoms = [(atom.GetType(), atom.GetX(), atom.GetY(), atom.GetZ())
             for atom in ob.OBMolAtomIter(mol)]
    return atoms


def compute_rfscore_descriptor(ligand_atoms, receptor_atoms):
    desc = np.zeros(36)
    for i, a1 in enumerate(ATOM_TYPES):
        for j, a2 in enumerate(ATOM_TYPES):
            idx = i * 6 + j
            count = 0
            for _, x1, y1, z1 in filter(lambda a: a[0].startswith(a1), ligand_atoms):
                for _, x2, y2, z2 in filter(lambda a: a[0].startswith(a2), receptor_atoms):
                    dist = np.linalg.norm([x1 - x2, y1 - y2, z1 - z2])
                    if dist <= CUTOFF:
                        count += 1
            desc[idx] = count
    return desc


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Path to folder with docking results")
    parser.add_argument("--output", required=True, help="Path to save RF-Score results")
    parser.add_argument("--receptor", required=False, help="Optional: receptor path if single")
    args = parser.parse_args()

    os.makedirs(args.output, exist_ok=True)
    model = joblib.load("ml_models/pretrained_rfscore_model.joblib")

    results = ["Ligand,Receptor,RFScore"]

    for file in os.listdir(args.input):
        if file.endswith(".pdbqt"):
            ligand_path = os.path.join(args.input, file)
            receptor_path = args.receptor or os.path.join(args.input, "receptor.pdbqt")

            if not os.path.exists(receptor_path):
                print(f"❌ Skipping {file}: Receptor not found.")
                continue

            ligand_atoms = load_structure(ligand_path)
            receptor_atoms = load_structure(receptor_path)

            desc = compute_rfscore_descriptor(ligand_atoms, receptor_atoms).reshape(1, -1)
            score = model.predict(desc)[0]
            ligand_name = os.path.splitext(file)[0]
            receptor_name = os.path.splitext(os.path.basename(receptor_path))[0]
            results.append(f"{ligand_name},{receptor_name},{score:.2f}")

    output_file = os.path.join(args.output, "rfscore_results.csv")
    with open(output_file, "w") as f:
        f.write("\n".join(results))

    print(f"✅ RF-Score finished. Results written to: {output_file}")


if __name__ == "__main__":
    main()
