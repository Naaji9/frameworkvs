# ml_models/run_rfscore.py
import argparse
import os
import joblib
import oddt
from oddt.toolkits import ob
from oddt.scoring.functions import RFScore

def main(input_path, output_path):
    os.makedirs(output_path, exist_ok=True)

    # Load receptor
    receptor_path = os.path.join(input_path, "receptor.pdbqt")
    if not os.path.exists(receptor_path):
        print(f"❌ receptor.pdbqt not found in {input_path}")
        return

    receptor = next(oddt.toolkit.readfile('pdbqt', receptor_path))

    # Load pre-trained RF-Score model
    model_path = os.path.join(os.path.dirname(__file__), "data", "RFScore_VS_model.pkl")
    if not os.path.exists(model_path):
        print(f"❌ RF-Score model not found at {model_path}")
        return

    model = joblib.load(model_path)
    rfscore = RFScore(model=model)

    # Iterate over ligand files and score
    results = []
    for fname in os.listdir(input_path):
        if fname.endswith(".pdbqt") and fname != "receptor.pdbqt":
            ligand_path = os.path.join(input_path, fname)
            ligand = next(oddt.toolkit.readfile("pdbqt", ligand_path))
            try:
                score = rfscore.predict(ligand, receptor)[0]
                results.append((fname, round(score, 3)))
            except Exception as e:
                print(f"⚠️ Error scoring {fname}: {e}")

    # Write results to CSV
    out_csv = os.path.join(output_path, "rfscore_results.csv")
    with open(out_csv, "w") as f:
        f.write("Ligand,RFScore\n")
        for name, score in results:
            f.write(f"{name},{score}\n")

    print(f"✅ RF-Score finished. Results written to: {out_csv}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Path to folder with receptor.pdbqt and ligand .pdbqt files")
    parser.add_argument("--output", required=True, help="Output folder for scores")
    args = parser.parse_args()
    main(args.input, args.output)
