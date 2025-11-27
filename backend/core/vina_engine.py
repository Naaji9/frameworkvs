# backend/core/vina_engine.py
import os
import subprocess
from typing import List, Tuple

def run_docking_workflow(
    ligands: List[str],
    receptors: List[str],
    box_center: Tuple[float, float, float],
    box_size: Tuple[float, float, float],
    exhaustiveness: int = 8
) -> List[str]:
    output_logs = []

    for ligand in ligands:
        for receptor in receptors:
            ligand_name = os.path.splitext(os.path.basename(ligand))[0]
            receptor_name = os.path.splitext(os.path.basename(receptor))[0]
            output_prefix = f"outputs/docking_results/{ligand_name}_{receptor_name}"

            os.makedirs(os.path.dirname(output_prefix), exist_ok=True)

            cmd = [
                "vina",
                f"--ligand", ligand,
                f"--receptor", receptor,
                f"--center_x", str(box_center[0]),
                f"--center_y", str(box_center[1]),
                f"--center_z", str(box_center[2]),
                f"--size_x", str(box_size[0]),
                f"--size_y", str(box_size[1]),
                f"--size_z", str(box_size[2]),
                f"--exhaustiveness", str(exhaustiveness),
                f"--out", f"{output_prefix}_out.pdbqt",
                f"--log", f"{output_prefix}_log.txt"
            ]

            result = subprocess.run(cmd, capture_output=True, text=True)

            if result.returncode != 0:
                raise RuntimeError(f"Docking failed for {ligand_name} vs {receptor_name}:\n{result.stderr}")

            output_logs.append(f"{ligand_name} vs {receptor_name}: docking completed.")
    
    return output_logs
