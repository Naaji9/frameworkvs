import subprocess
from pathlib import Path
import shutil

def convert_to_pdbqt_to_pdb(input_path: str, output_path: Path):
    if Path(input_path).suffix == ".pdb":
        shutil.copy(input_path, output_path)
        return
    result = subprocess.run(
        ["obabel", input_path, "-O", str(output_path)],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        raise RuntimeError(f"Open Babel conversion failed:\n{result.stderr}")

def run_single_plip_analysis(receptor_path: str, ligand_path: str, out_dir: Path) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)

    rec_pdb = out_dir / f"{Path(receptor_path).stem}_rec.pdb"
    lig_pdb = out_dir / f"{Path(ligand_path).stem}_lig.pdb"

    convert_to_pdbqt_to_pdb(receptor_path, rec_pdb)
    convert_to_pdbqt_to_pdb(ligand_path, lig_pdb)

    complex_path = out_dir / f"{rec_pdb.stem}__{lig_pdb.stem}_complex.pdb"
    with open(complex_path, "w") as f:
        f.write(rec_pdb.read_text())
        f.write("\n")
        f.write(lig_pdb.read_text())

    ligand_stem = Path(ligand_path).stem
    plip_out_dir = out_dir / f"plip_{ligand_stem}"
    plip_out_dir.mkdir(exist_ok=True)

    xml_name = f"plip_{ligand_stem}.xml"
    xml_path = plip_out_dir / xml_name

    result = subprocess.run(
        ["plip", "-f", str(complex_path), "-o", str(plip_out_dir), "-x", "--name", xml_name],
        capture_output=True, text=True
    )

    if result.returncode != 0:
        raise RuntimeError(f"PLIP failed:\n{result.stderr}")

    actual_file = plip_out_dir / f"{xml_name}.xml"
    if actual_file.exists():
        actual_file.rename(xml_path)

    return {
        "xml": str(xml_path),
        "txt": str(plip_out_dir / f"{xml_name.replace('.xml', '.txt')}"),
        "pse": str(plip_out_dir / f"{xml_name.replace('.xml', '.pse')}"),
        "interactions_dir": str(plip_out_dir / "interactions"),
        "complex": str(complex_path)
    }

def run_plip(receptor_path: str, ligand_path: str, output_folder: str) -> dict:
    return run_single_plip_analysis(receptor_path, ligand_path, Path(output_folder))
def run_plip_batch(receptor_folder: str, ligand_folder: str, output_folder: str) -> list:
    rec_dir = Path(receptor_folder)
    lig_dir = Path(ligand_folder)
    out_dir = Path(output_folder)
    out_dir.mkdir(parents=True, exist_ok=True)

    results = []

    for rec_file in rec_dir.glob("*"):
        if rec_file.suffix not in [".pdbqt", ".pdb"]:
            continue

        for lig_file in lig_dir.glob("*"):
            if lig_file.suffix not in [".pdbqt", ".pdb"]:
                continue

            try:
                result = run_single_plip_analysis(str(rec_file), str(lig_file), out_dir)
                results.append({
                    "receptor": str(rec_file),
                    "ligand": str(lig_file),
                    **result
                })
            except Exception as e:
                print(f"[PLIP ERROR] {rec_file.name} + {lig_file.name}: {e}")

    return results
