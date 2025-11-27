import argparse
import os
import re

def extract_from_log(txt_file):
    with open(txt_file, "r") as f:
        for line in f:
            if re.match(r"\s*1\s+-?\d+\.\d+", line):
                return float(line.split()[1])
    return None

def extract_from_pdbqt(pdbqt_file):
    with open(pdbqt_file, "r") as f:
        for line in f:
            if line.startswith("REMARK VINA RESULT:"):
                try:
                    return float(line.split()[3])
                except Exception:
                    pass
    return None

def main(input_path, output_path):
    os.makedirs(output_path, exist_ok=True)

    scores = []
    for file in os.listdir(input_path):
        path = os.path.join(input_path, file)
        score = None

        if file.endswith(".txt"):
            score = extract_from_log(path)
        elif file.endswith(".pdbqt"):
            score = extract_from_pdbqt(path)

        if score is not None:
            scores.append((file, score))
        else:
            print(f"⚠️ No Vina score found in {file}")

    out_csv = os.path.join(output_path, "vina_scores.csv")
    with open(out_csv, "w") as f:
        f.write("File,VinaScore\n")
        for name, score in scores:
            f.write(f"{name},{score}\n")

    print(f"✅ Vina scores written to: {out_csv}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Folder with .pdbqt or .txt Vina result files")
    parser.add_argument("--output", required=True, help="Output folder to save vina_scores.csv")
    args = parser.parse_args()
    main(args.input, args.output)
