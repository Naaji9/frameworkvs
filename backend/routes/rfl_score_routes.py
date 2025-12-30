# backend/api/rfl_score_routes.py
from fastapi import APIRouter, Form, HTTPException
from typing import Optional
import httpx
import json
import uuid
from datetime import datetime

router = APIRouter(prefix="/analysis/rfl-score", tags=["RFL-Score"])

def generate_rfl_script(
    receptor_session: str,
    ligand_session: str,
    output_folder: str,
    max_workers: int,
    max_poses: int,
    ml_model: str,
    generate_plots: bool,
    generate_feature_csv: bool,
    fasta_session: Optional[str] = None,
    fasta_mode: str = "auto"
) -> str:
    """
    Generate a complete, self-contained Python script for RFL-Score preparation and execution.
    """
    
    script = f'''#!/usr/bin/env python3
"""
Auto-generated RFL-Score Preparation & Execution Script
Generated: {datetime.now().isoformat()}
Job ID: {uuid.uuid4()}

Workflow:
1. Copy files to output/original_files/
2. Split ligand poses → output/split_poses/
3. Convert & prepare → output/prepared_files/job_N/
4. Execute RFL-Score on each job
5. Aggregate results → output/results/
"""

import os
import sys
import json
import subprocess
import re
import shutil
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor, as_completed
from typing import List, Dict, Tuple, Optional
import traceback
import time

# ============================================================================
# CONFIGURATION
# ============================================================================
import tempfile
UPLOAD_BASE = Path(tempfile.gettempdir()) / "rfl_score_uploads"

RECEPTOR_SESSION = UPLOAD_BASE / "{receptor_session}"
LIGAND_SESSION = UPLOAD_BASE / "{ligand_session}"
FASTA_SESSION = UPLOAD_BASE / "{fasta_session}" if "{fasta_session}" else None
FASTA_MODE = "{fasta_mode}"
OUTPUT_FOLDER = Path("{output_folder}")
MAX_WORKERS = {max_workers}
MAX_POSES = {max_poses}
ML_MODEL = "{ml_model}"
GENERATE_PLOTS = {generate_plots}
GENERATE_FEATURE_CSV = {generate_feature_csv}

# RFL-Score installation path
RFL_SCORE_PATH = Path("/home/naji/rfl-score_v1")
SF160_SCRIPT = RFL_SCORE_PATH / "sf160.py"

# Output subdirectories
ORIGINAL_DIR = OUTPUT_FOLDER / "original_files"
SPLIT_DIR = OUTPUT_FOLDER / "split_poses"
PREPARED_DIR = OUTPUT_FOLDER / "prepared_files"
RFL_OUTPUT_DIR = OUTPUT_FOLDER / "rfl_outputs"
RESULTS_DIR = OUTPUT_FOLDER / "results"

# MGLTools paths
MGL_PYTHON = None
MGL_SCRIPTS = None

for base in ["/opt", "/usr/local", str(Path.home())]:
    mgl_candidates = list(Path(base).glob("mgltools*"))
    if mgl_candidates:
        mgl_path = mgl_candidates[0]
        MGL_PYTHON = mgl_path / "bin" / "pythonsh"
        MGL_SCRIPTS = mgl_path / "MGLToolsPckgs" / "AutoDockTools" / "Utilities24"
        if MGL_PYTHON.exists():
            break

print("\\n" + "="*80)
print("🚀 RFL-Score Preparation & Execution Script")
print("="*80)
print(f"Output: {{OUTPUT_FOLDER}}")
print(f"Workers: {{MAX_WORKERS}}")
print(f"Max poses per ligand: {{MAX_POSES if MAX_POSES > 0 else 'All'}}")
print(f"FASTA mode: {{FASTA_MODE}}")
print(f"RFL-Score: {{SF160_SCRIPT}}")
print(f"MGLTools: {{MGL_PYTHON if MGL_PYTHON else 'Not found (will use Open Babel)'}}")
print("="*80 + "\\n")

# ============================================================================
# PHASE 1: FILE DISCOVERY & ORGANIZATION
# ============================================================================

def discover_files(session_dir: Path, file_type: str) -> List[Path]:
    """Find all files in session directory."""
    if not session_dir or not session_dir.exists():
        print(f"⚠️  Directory not found: {{session_dir}}")
        return []
    
    extensions = {{
        "receptor": [".pdb", ".pdbqt"],
        "ligand": [".pdb", ".pdbqt"],
        "fasta": [".fasta", ".fa", ".faa", ".txt"]
    }}
    
    files = []
    for ext in extensions.get(file_type, []):
        files.extend(session_dir.glob(f"*{{ext}}"))
    
    print(f"📂 Found {{len(files)}} {{file_type}} files:")
    for f in files:
        print(f"   - {{f.name}}")
    
    return sorted(files)

def match_receptor_ligand(receptor_files: List[Path], ligand_files: List[Path]) -> List[Tuple[Path, Path]]:
    """
    Match receptors to ligands based on naming pattern.
    Ligand format: receptor1_ligand1_box_grid.pdbqt
    """
    pairs = []
    
    for receptor in receptor_files:
        receptor_name = receptor.stem  # e.g., "receptor1"
        
        for ligand in ligand_files:
            ligand_name = ligand.stem  # e.g., "receptor1_ligand1_box_grid"
            
            # Check if ligand name starts with receptor name
            if ligand_name.startswith(receptor_name + "_"):
                pairs.append((receptor, ligand))
                print(f"✓ Matched: {{receptor_name}} ← {{ligand.name}}")
    
    return pairs

def copy_to_original(files: List[Path], dest_dir: Path):
    """Copy original files to output/original_files/"""
    dest_dir.mkdir(parents=True, exist_ok=True)
    
    for file in files:
        dest = dest_dir / file.name
        shutil.copy(file, dest)
        print(f"   📄 Copied: {{file.name}}")

# ============================================================================
# PHASE 2: SPLIT LIGAND POSES
# ============================================================================

def split_ligand_poses(ligand_file: Path, output_base: Path, max_poses: int) -> List[Dict]:
    """
    Split multi-model PDBQT into individual poses.
    Returns list of pose info: {{pose_number, file, vina_score, vina_rank}}
    """
    ligand_name = ligand_file.stem
    pose_dir = output_base / ligand_name
    pose_dir.mkdir(parents=True, exist_ok=True)
    
    poses = []
    current_pose = []
    current_model = 0
    vina_score = None
    
    print(f"\\n🔪 Splitting poses from: {{ligand_file.name}}")
    
    try:
        with open(ligand_file) as f:
            for line in f:
                if line.startswith("MODEL"):
                    current_model = int(line.split()[1])
                    current_pose = [line]
                    vina_score = None
                    
                elif line.startswith("REMARK VINA RESULT"):
                    match = re.search(r"RESULT:\\s+([-\\d.]+)", line)
                    if match:
                        vina_score = float(match.group(1))
                    current_pose.append(line)
                    
                elif line.startswith("ENDMDL"):
                    current_pose.append(line)
                    
                    # Save pose file
                    pose_file = pose_dir / f"pose_{{current_model}}.pdbqt"
                    with open(pose_file, "w") as out:
                        out.writelines(current_pose)
                    
                    poses.append({{
                        "pose_number": current_model,
                        "file": pose_file,
                        "vina_score": vina_score
                    }})
                    
                    print(f"   ✓ Pose {{current_model}}: Vina = {{vina_score:.2f}} → {{pose_file.name}}")
                    
                    if max_poses > 0 and len(poses) >= max_poses:
                        print(f"   ⚠️  Reached max poses limit ({{max_poses}})")
                        break
                    
                    current_pose = []
                else:
                    if current_pose:
                        current_pose.append(line)
        
        # Assign Vina ranks
        poses.sort(key=lambda x: x["vina_score"] if x["vina_score"] else float('inf'))
        for idx, pose in enumerate(poses, 1):
            pose["vina_rank"] = idx
        
        # Re-sort by pose number
        poses.sort(key=lambda x: x["pose_number"])
        
        print(f"   📊 Total poses extracted: {{len(poses)}}")
        return poses
        
    except Exception as e:
        print(f"   ❌ Error splitting poses: {{e}}")
        traceback.print_exc()
        return []

# ============================================================================
# PHASE 3: CONVERT RECEPTOR PDBQT → PDB
# ============================================================================

def convert_receptor_to_pdb(pdbqt_file: Path, output_dir: Path) -> Optional[Path]:
    """Convert receptor PDBQT to PDB."""
    pdb_file = output_dir / pdbqt_file.with_suffix(".pdb").name
    
    if pdbqt_file.suffix == ".pdb":
        shutil.copy(pdbqt_file, pdb_file)
        return pdb_file
    
    try:
        # Method 1: MGLTools
        if MGL_PYTHON and MGL_SCRIPTS:
            script = MGL_SCRIPTS / "pdbqt_to_pdb.py"
            if script.exists():
                cmd = [str(MGL_PYTHON), str(script), "-f", str(pdbqt_file), "-o", str(pdb_file)]
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
                if result.returncode == 0 and pdb_file.exists():
                    return pdb_file
        
        # Method 2: Open Babel
        cmd = ["obabel", str(pdbqt_file), "-O", str(pdb_file)]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0 and pdb_file.exists():
            return pdb_file
        
        # Method 3: Text processing
        with open(pdbqt_file) as f_in, open(pdb_file, "w") as f_out:
            for line in f_in:
                if line.startswith(("ATOM", "HETATM", "TER", "END")):
                    f_out.write(line[:66] + "\\n")
        
        if pdb_file.exists() and pdb_file.stat().st_size > 0:
            return pdb_file
            
    except Exception as e:
        print(f"   ❌ Receptor conversion failed: {{e}}")
    
    return None

# ============================================================================
# PHASE 4: EXTRACT/GET FASTA SEQUENCE
# ============================================================================

def extract_sequence_from_pdb(pdb_file: Path, output_fasta: Path) -> Optional[Path]:
    """Extract protein sequence from PDB using BioPython."""
    try:
        from Bio import PDB
        from Bio.PDB.Polypeptide import PPBuilder
        from Bio.SeqRecord import SeqRecord
        from Bio import SeqIO
        
        parser = PDB.PDBParser(QUIET=True)
        structure = parser.get_structure("protein", str(pdb_file))
        
        ppb = PPBuilder()
        sequences = []
        
        for chain in structure.get_chains():
            for pp in ppb.build_peptides(chain):
                seq = pp.get_sequence()
                if len(seq) > 0:
                    sequences.append(SeqRecord(seq, id=chain.id, description=f"Chain {{chain.id}}"))
        
        if sequences:
            SeqIO.write(sequences, str(output_fasta), "fasta")
            return output_fasta
            
    except Exception as e:
        print(f"   ⚠️  Sequence extraction failed: {{e}}")
    
    return None

def get_fasta_for_receptor(receptor_name: str, receptor_pdb: Path, fasta_dir: Optional[Path], output_dir: Path) -> Optional[Path]:
    """Get FASTA sequence (provided or auto-extracted)."""
    output_fasta = output_dir / f"{{receptor_name}}_sequence.fasta"
    
    # Try to find matching FASTA file
    if FASTA_MODE == "manual" and fasta_dir and fasta_dir.exists():
        for fasta_file in list(fasta_dir.glob("*.fasta")) + list(fasta_dir.glob("*.fa")):
            if receptor_name in fasta_file.stem:
                shutil.copy(fasta_file, output_fasta)
                return output_fasta
    
    # Auto-extract from PDB
    return extract_sequence_from_pdb(receptor_pdb, output_fasta)

# ============================================================================
# PHASE 5: CONVERT POSE PDBQT → MOL2
# ============================================================================

def convert_pose_to_mol2(pdbqt_pose: Path, output_dir: Path, retry: bool = True) -> Optional[Path]:
    """Convert pose PDBQT to MOL2."""
    mol2_file = output_dir / pdbqt_pose.with_suffix(".mol2").name
    
    try:
        # Method 1: PDBQT → PDB → MOL2 (most reliable)
        pdb_intermediate = output_dir / pdbqt_pose.with_suffix(".pdb").name
        
        cmd1 = ["obabel", str(pdbqt_pose), "-O", str(pdb_intermediate)]
        result1 = subprocess.run(cmd1, capture_output=True, text=True, timeout=30)
        
        if result1.returncode == 0 and pdb_intermediate.exists():
            cmd2 = ["obabel", str(pdb_intermediate), "-O", str(mol2_file), "--gen3d"]
            result2 = subprocess.run(cmd2, capture_output=True, text=True, timeout=30)
            
            if result2.returncode == 0 and mol2_file.exists():
                pdb_intermediate.unlink()
                return mol2_file
        
        # Method 2: Direct conversion
        if retry:
            cmd = ["obabel", str(pdbqt_pose), "-O", str(mol2_file)]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            if result.returncode == 0 and mol2_file.exists():
                return mol2_file
        
        # Method 3: MGLTools
        if retry and MGL_PYTHON and MGL_SCRIPTS:
            script = MGL_SCRIPTS / "prepare_ligand4.py"
            if script.exists():
                cmd = [str(MGL_PYTHON), str(script), "-l", str(pdbqt_pose), "-o", str(mol2_file)]
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
                if result.returncode == 0 and mol2_file.exists():
                    return mol2_file
        
    except Exception as e:
        if retry:
            return convert_pose_to_mol2(pdbqt_pose, output_dir, retry=False)
    
    return None

# ============================================================================
# PHASE 6: PREPARE JOB FOLDERS
# ============================================================================

def prepare_job_folder(job_number: int, receptor_file: Path, pose_info: Dict, fasta_dir: Optional[Path]) -> Optional[Dict]:
    """
    Create prepared_files/job_N/ with:
    - receptor.pdb
    - pose_N.mol2
    - sequence.fasta
    """
    job_dir = PREPARED_DIR / f"job_{{job_number}}"
    job_dir.mkdir(parents=True, exist_ok=True)
    
    receptor_name = receptor_file.stem
    pose_file = pose_info["file"]
    pose_number = pose_info["pose_number"]
    vina_score = pose_info["vina_score"]
    vina_rank = pose_info["vina_rank"]
    
    print(f"\\n📦 Preparing Job {{job_number}}: {{receptor_name}} × pose {{pose_number}}")
    
    try:
        # Step 1: Convert receptor
        print(f"   🔄 Converting receptor to PDB...")
        receptor_pdb = convert_receptor_to_pdb(receptor_file, job_dir)
        if not receptor_pdb:
            print(f"   ❌ Receptor conversion failed")
            return None
        print(f"   ✓ {{receptor_pdb.name}}")
        
        # Step 2: Convert pose to MOL2
        print(f"   🔄 Converting pose to MOL2...")
        pose_mol2 = convert_pose_to_mol2(pose_file, job_dir)
        if not pose_mol2:
            print(f"   ❌ Pose conversion failed")
            return None
        print(f"   ✓ {{pose_mol2.name}}")
        
        # Step 3: Get FASTA
        print(f"   🔄 Getting FASTA sequence...")
        fasta_file = get_fasta_for_receptor(receptor_name, receptor_pdb, fasta_dir, job_dir)
        if not fasta_file:
            print(f"   ❌ FASTA unavailable")
            return None
        print(f"   ✓ {{fasta_file.name}}")
        
        print(f"   ✅ Job {{job_number}} prepared successfully")
        
        return {{
            "job_number": job_number,
            "job_dir": job_dir,
            "receptor_name": receptor_name,
            "receptor_pdb": receptor_pdb,
            "pose_number": pose_number,
            "pose_mol2": pose_mol2,
            "fasta_file": fasta_file,
            "vina_score": vina_score,
            "vina_rank": vina_rank
        }}
        
    except Exception as e:
        print(f"   ❌ Job preparation failed: {{e}}")
        traceback.print_exc()
        return None

# ============================================================================
# PHASE 7: RUN RFL-SCORE
# ============================================================================

def run_rfl_score_on_job(job_info: Dict) -> Optional[Dict]:
    """Execute RFL-Score on prepared job folder."""
    job_number = job_info["job_number"]
    receptor_pdb = job_info["receptor_pdb"]
    pose_mol2 = job_info["pose_mol2"]
    fasta_file = job_info["fasta_file"]
    
    print(f"\\n🔬 Running RFL-Score on Job {{job_number}}...")
    
    try:
        if not SF160_SCRIPT.exists():
            print(f"   ❌ RFL-Score script not found: {{SF160_SCRIPT}}")
            return None
        
        # Execute RFL-Score
        cmd = [
            "python", str(SF160_SCRIPT),
            "-r", str(receptor_pdb),
            "-l", str(pose_mol2),
            "-f", str(fasta_file)
        ]
        
        result = subprocess.run(
            cmd,
            cwd=str(RFL_SCORE_PATH),
            capture_output=True,
            text=True,
            timeout=180
        )
        
        output = result.stdout + result.stderr
        
        # Save RFL output
        rfl_output_file = RFL_OUTPUT_DIR / f"job_{{job_number}}_rfl_output.txt"
        rfl_output_file.parent.mkdir(parents=True, exist_ok=True)
        with open(rfl_output_file, "w") as f:
            f.write(output)
        
        # Parse ML score
        ml_score = None
        patterns = [
            r"[Pp]redicted\\s+affinity[:\\s]+([\\-\\d.]+)",
            r"[Ss]core[:\\s]+([\\-\\d.]+)",
            r"[Aa]ffinity[:\\s]+([\\-\\d.]+)"
        ]
        
        for pattern in patterns:
            match = re.search(pattern, output)
            if match:
                ml_score = float(match.group(1))
                break
        
        if ml_score is not None:
            print(f"   ✅ ML Score: {{ml_score:.2f}}")
            job_info["ml_score"] = ml_score
            job_info["rfl_output_file"] = str(rfl_output_file)
            job_info["status"] = "success"
            return job_info
        else:
            print(f"   ⚠️  Could not parse ML score from output")
            job_info["status"] = "failed"
            job_info["error"] = "ML score not found in output"
            return job_info
        
    except subprocess.TimeoutExpired:
        print(f"   ⏱️  RFL-Score timeout")
        job_info["status"] = "timeout"
        return job_info
    except Exception as e:
        print(f"   ❌ RFL-Score execution failed: {{e}}")
        job_info["status"] = "failed"
        job_info["error"] = str(e)
        return job_info

# ============================================================================
# PHASE 8: AGGREGATE RESULTS
# ============================================================================

def aggregate_results(job_results: List[Dict], receptor_ligand_pairs: List[Tuple]):
    """Create comparison tables and plots."""
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    
    # Group by receptor-ligand pair
    grouped = {{}}
    for job in job_results:
        if job["status"] == "success":
            key = job["receptor_name"]
            if key not in grouped:
                grouped[key] = []
            grouped[key].append(job)
    
    # Create overall comparison table
    csv_file = RESULTS_DIR / "comparison_table.csv"
    with open(csv_file, "w") as f:
        f.write("job_number,receptor,pose,vina_score,vina_rank,ml_score,ml_rank,rank_change\\n")
        
        for receptor_name, jobs in grouped.items():
            # Calculate ML ranks
            jobs.sort(key=lambda x: x.get("ml_score", float('inf')))
            for idx, job in enumerate(jobs, 1):
                job["ml_rank"] = idx
                job["rank_change"] = job["vina_rank"] - job["ml_rank"]
            
            # Write to CSV
            for job in jobs:
                f.write(f"{{job['job_number']}},{{receptor_name}},pose_{{job['pose_number']}},")
                f.write(f"{{job['vina_score']}},{{job['vina_rank']}},{{job['ml_score']}},")
                f.write(f"{{job['ml_rank']}},{{job['rank_change']}}\\n")
    
    print(f"\\n✅ Results saved to: {{csv_file}}")
    
    # Generate plots if requested
    if GENERATE_PLOTS:
        try:
            import matplotlib
            matplotlib.use('Agg')
            import matplotlib.pyplot as plt
            
            for receptor_name, jobs in grouped.items():
                fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 6))
                
                vina_scores = [j["vina_score"] for j in jobs]
                ml_scores = [j["ml_score"] for j in jobs]
                
                # Correlation plot
                ax1.scatter(vina_scores, ml_scores, s=100, alpha=0.6)
                ax1.set_xlabel("Vina Score", fontsize=12)
                ax1.set_ylabel("ML Score", fontsize=12)
                ax1.set_title(f"{{receptor_name}}: Vina vs ML", fontsize=14, fontweight='bold')
                ax1.grid(True, alpha=0.3)
                
                # Ranking comparison
                poses = [f"pose_{{j['pose_number']}}" for j in jobs]
                x = range(len(poses))
                ax2.bar([i - 0.2 for i in x], [j["vina_rank"] for j in jobs], 
                       width=0.4, label="Vina Rank", color='steelblue')
                ax2.bar([i + 0.2 for i in x], [j["ml_rank"] for j in jobs], 
                       width=0.4, label="ML Rank", color='darkorange')
                ax2.set_xlabel("Pose", fontsize=12)
                ax2.set_ylabel("Rank", fontsize=12)
                ax2.set_title(f"{{receptor_name}}: Ranking", fontsize=14, fontweight='bold')
                ax2.set_xticks(x)
                ax2.set_xticklabels(poses, rotation=45)
                ax2.legend()
                ax2.invert_yaxis()
                ax2.grid(True, alpha=0.3, axis='y')
                
                plt.tight_layout()
                plot_file = RESULTS_DIR / f"{{receptor_name}}_comparison_plot.png"
                plt.savefig(plot_file, dpi=150, bbox_inches='tight')
                plt.close()
                
                print(f"   📊 Plot: {{plot_file.name}}")
                
        except Exception as e:
            print(f"   ⚠️  Plot generation failed: {{e}}")

    return csv_file

# ============================================================================
# MAIN WORKFLOW
# ============================================================================

def main():
    start_time = time.time()
    
    print("\\n" + "="*80)
    print("PHASE 1: FILE DISCOVERY & ORGANIZATION")
    print("="*80)
    
    # Create output directories
    for d in [ORIGINAL_DIR, SPLIT_DIR, PREPARED_DIR, RFL_OUTPUT_DIR, RESULTS_DIR]:
        d.mkdir(parents=True, exist_ok=True)
    
    # Discover files
    print("\\n📂 Discovering files...")
    receptors = discover_files(RECEPTOR_SESSION, "receptor")
    ligands = discover_files(LIGAND_SESSION, "ligand")
    fasta_dir = FASTA_SESSION if FASTA_SESSION and FASTA_SESSION.exists() else None
    
    if not receptors:
        return {{"error": "No receptor files found", "results": []}}
    if not ligands:
        return {{"error": "No ligand files found", "results": []}}
    
    # Match receptor-ligand pairs
    print("\\n🔗 Matching receptors to ligands...")
    pairs = match_receptor_ligand(receptors, ligands)
    
    if not pairs:
        return {{"error": "No receptor-ligand matches found", "results": []}}
    
    # Copy originals
    print("\\n📋 Copying original files...")
    copy_to_original(receptors + ligands, ORIGINAL_DIR)
    if fasta_dir:
        fasta_files = list(fasta_dir.glob("*.fasta")) + list(fasta_dir.glob("*.fa"))
        if fasta_files:
            copy_to_original(fasta_files, ORIGINAL_DIR)
    
    print("\\n" + "="*80)
    print("PHASE 2: SPLIT LIGAND POSES")
    print("="*80)
    
    # Split all ligands into poses
    all_pose_info = {{}}
    for receptor, ligand in pairs:
        poses = split_ligand_poses(ligand, SPLIT_DIR, MAX_POSES)
        if poses:
            key = (receptor, ligand)
            all_pose_info[key] = poses
    
    print("\\n" + "="*80)
    print("PHASE 3: PREPARE JOB FOLDERS")
    print("="*80)
    
    # Prepare all jobs
    jobs_to_prepare = []
    job_number = 1
    
    for (receptor, ligand), poses in all_pose_info.items():
        for pose_info in poses:
            jobs_to_prepare.append((job_number, receptor, pose_info, fasta_dir))
            job_number += 1
    
    print(f"\\n📦 Preparing {{len(jobs_to_prepare)}} jobs...")
    
    prepared_jobs = []
    for args in jobs_to_prepare:
        job_info = prepare_job_folder(*args)
        if job_info:
            prepared_jobs.append(job_info)
    
    print(f"\\n✅ Successfully prepared {{len(prepared_jobs)}} / {{len(jobs_to_prepare)}} jobs")
    
    if not prepared_jobs:
        return {{"error": "No jobs successfully prepared", "results": []}}
    
    print("\\n" + "="*80)
    print("PHASE 4: RUN RFL-SCORE")
    print("="*80)
    
    # Execute RFL-Score on all jobs (parallel)
    results = []
    successful = 0
    failed = 0
    
    if MAX_WORKERS > 1:
        print(f"\\n⚡ Running RFL-Score on {{len(prepared_jobs)}} jobs with {{MAX_WORKERS}} workers...\\n")
        with ProcessPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures = {{executor.submit(run_rfl_score_on_job, job): job for job in prepared_jobs}}
            
            for future in as_completed(futures):
                result = future.result()
                if result:
                    results.append(result)
                    if result["status"] == "success":
                        successful += 1
                    else:
                        failed += 1
    else:
        print(f"\\n🔄 Running RFL-Score on {{len(prepared_jobs)}} jobs sequentially...\\n")
        for job in prepared_jobs:
            result = run_rfl_score_on_job(job)
            if result:
                results.append(result)
                if result["status"] == "success":
                    successful += 1
                else:
                    failed += 1
    
    print("\\n" + "="*80)
    print("PHASE 5: AGGREGATE RESULTS")
    print("="*80)
    
    # Create comparison tables and plots
    if successful > 0:
        csv_file = aggregate_results(results, pairs)
    
    # Save job summary
    execution_time = time.time() - start_time
    
    summary = {{
        "total_jobs": len(prepared_jobs),
        "successful": successful,
        "failed": failed,
        "execution_time_seconds": round(execution_time, 2),
        "output_folder": str(OUTPUT_FOLDER),
        "results": results
    }}
    
    summary_file = RESULTS_DIR / "job_summary.json"
    with open(summary_file, "w") as f:
        json.dump(summary, f, indent=2)
    
    print("\\n" + "="*80)
    print("✅ RFL-SCORE WORKFLOW COMPLETED")
    print("="*80)
    print(f"Total jobs: {{len(prepared_jobs)}}")
    print(f"✓ Successful: {{successful}}")
    print(f"✗ Failed: {{failed}}")
    print(f"⏱️  Time: {{execution_time:.2f}}s")
    print(f"📁 Results: {{RESULTS_DIR}}")
    print("="*80 + "\\n")
    
    return summary

if __name__ == "__main__":
    try:
        summary = main()
        
        # Print JSON result for local backend
        print("\\n" + "="*80)
        print("JSON_RESULT_START")
        print(json.dumps(summary, indent=2))
        print("JSON_RESULT_END")
        print("="*80)
    except Exception as e:
        error_summary = {{
            "error": str(e),
            "traceback": traceback.format_exc(),
            "results": []
        }}
        print("\\n" + "="*80)
        print("JSON_RESULT_START")
        print(json.dumps(error_summary, indent=2))
        print("JSON_RESULT_END")
        print("="*80)
        sys.exit(1)
'''
    
    return script


@router.post("/submit-job")
async def submit_rfl_job(
    receptor_session: str = Form(...),
    ligand_session: str = Form(...),
    output_folder: str = Form(...),
    max_workers: int = Form(4),
    local_backend_url: str = Form("http://127.0.0.1:5005"),
    ml_model: str = Form("rfl_score"),
    generate_plots: str = Form("true"),
    generate_feature_csv: str = Form("false"),
    feature_selection: str = Form("auto"),
    max_poses: int = Form(5),
    fasta_session: Optional[str] = Form(None),
    fasta_mode: str = Form("auto")
):
    """
    Main endpoint: Generate RFL-Score script and send to local backend for execution.
    """
    
    try:
        # Convert string booleans
        plots = generate_plots.lower() == "true"
        feature_csv = generate_feature_csv.lower() == "true"
        
        print(f"\\n{'='*80}")
        print("📋 RFL-Score Job Submission")
        print(f"{'='*80}")
        print(f"Receptor session: {receptor_session}")
        print(f"Ligand session: {ligand_session}")
        print(f"Output folder: {output_folder}")
        print(f"Max workers: {max_workers}")
        print(f"Max poses: {max_poses}")
        print(f"FASTA mode: {fasta_mode}")
        print(f"{'='*80}\\n")
        
        # Generate the complete Python script
        script_content = generate_rfl_script(
            receptor_session=receptor_session,
            ligand_session=ligand_session,
            output_folder=output_folder,
            max_workers=max_workers,
            max_poses=max_poses,
            ml_model=ml_model,
            generate_plots=plots,
            generate_feature_csv=feature_csv,
            fasta_session=fasta_session,
            fasta_mode=fasta_mode
        )
        
        print(f"✅ Generated script ({len(script_content)} characters)")
        print(f"📤 Sending to local backend: {local_backend_url}\\n")
        
        # Send script to local backend for execution
        async with httpx.AsyncClient(timeout=7200.0) as client:  # 2 hour timeout
            response = await client.post(
                f"{local_backend_url}/execute-rfl-script",
                json={
                    "script": script_content,
                    "timeout": 7200
                },
                headers={"Content-Type": "application/json"}
            )
            
            print(f"📨 Local backend response status: {response.status_code}")
            
            if response.status_code != 200:
                error_text = response.text
                print(f"❌ Local backend error:\\n{error_text}")
                raise HTTPException(status_code=500, detail=f"Local backend error: {error_text}")
            
            result = response.json()
            
            print(f"✅ Job completed successfully")
            print(f"   Total jobs: {result.get('total_jobs', 0)}")
            print(f"   Successful: {result.get('successful', 0)}")
            print(f"   Failed: {result.get('failed', 0)}\\n")
            
            return result
            
    except httpx.TimeoutException:
        print("⏱️  Request timeout\\n")
        raise HTTPException(status_code=504, detail="RFL-Score execution timeout")
    except Exception as e:
        print(f"❌ Error: {str(e)}\\n")
        raise HTTPException(status_code=500, detail=str(e))
