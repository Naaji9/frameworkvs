# backend/utils/file_converter.py
import os
import subprocess

SUPPORTED_INPUT_FORMATS = [".mol2", ".pdb", ".sdf", ".pdbqt"]

def convert_to_pdbqt(input_path: str, file_type: str) -> str:
    """
    Converts a molecular file (ligand/receptor) to .pdbqt format.
    """
    base_name = os.path.splitext(os.path.basename(input_path))[0]
    output_dir = f"data/{file_type}s"
    os.makedirs(output_dir, exist_ok=True)
    
    output_path = os.path.join(output_dir, f"{base_name}.pdbqt")

    cmd = ["obabel", input_path, "-O", output_path]

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        raise RuntimeError(f"Conversion failed: {result.stderr}")

    return output_path
