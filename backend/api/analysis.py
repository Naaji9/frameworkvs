# backend/api/analysis.py


import os
import uuid
import json
import tempfile
import subprocess
import shutil
import csv
import re
import multiprocessing

from concurrent.futures import ProcessPoolExecutor, as_completed

import xml.etree.ElementTree as ET
from pathlib import Path
from typing import List, Tuple, Optional, Dict, Any
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse, JSONResponse


router = APIRouter(prefix="/analysis")

# ---------------------------------------------------------
# Utility: Save file
# ---------------------------------------------------------
def save_upload(upload: UploadFile, folder: str) -> str:
    os.makedirs(folder, exist_ok=True)
    upload.file.seek(0)
    dest = os.path.join(folder, upload.filename)
    with open(dest, "wb") as f:
        f.write(upload.file.read())
    return dest


# ---------------------------------------------------------
# Utility: Run subprocess
# ---------------------------------------------------------
def run_cmd(cmd: List[str]) -> Tuple[int, str, str]:
    try:
        completed = subprocess.run(
            cmd, text=True, capture_output=True, check=False
        )
        return completed.returncode, completed.stdout, completed.stderr
    except Exception as e:
        return 999, "", str(e)


# # ---------------------------------------------------------
# # UNIVERSAL CONVERTER
# # ---------------------------------------------------------
# # ---------- PREPARATION HELPERS (receptor/ligand) ----------
# def which_exists(cmdname: str) -> bool:
#     return shutil.which(cmdname) is not None

# def prepare_receptor_for_pdbqt(src: str, dst: str, workdir: Optional[str] = None) -> Tuple[bool,str]:
#     """
#     Produce a docking-ready receptor .pdbqt at dst.
#     Steps:
#       - strip waters / non-protein (best-effort with obabel)
#       - add hydrogens
#       - use AutoDockTools prepare_receptor4.py if available to create pdbqt with charges
#     Returns (ok, log)
#     """
#     logs = []
#     tmp_clean = os.path.join(workdir or tempfile.gettempdir(), f"{Path(src).stem}_receptor.cleaned.pdb")

#     # 1) Try obabel to extract protein and remove waters/hetatm
#     cmd_obabel = [
#         "obabel", src, "-O", tmp_clean,
#         "-h",        # add hydrogens
#         "--delete", "HOH",  # attempt remove waters
#         "--protein", # keep protein residues only
#     ]
#     rc, out, err = run_cmd(cmd_obabel)
#     logs.append(" ".join(cmd_obabel))
#     logs.append(out or "")
#     logs.append(err or "")

#     if rc != 0 or not os.path.exists(tmp_clean):
#         # fallback: copy original and try to continue
#         tmp_clean = os.path.join(workdir or tempfile.gettempdir(), f"{Path(src).stem}_receptor.fallback.pdb")
#         try:
#             shutil.copyfile(src, tmp_clean)
#             logs.append(f"obabel protein extraction failed (rc={rc}); using original copy as fallback.")
#         except Exception as e:
#             return False, "\n".join(logs + [f"Failed to copy fallback: {e}"])

#     # 2) Use AutoDockTools if available (preferred) to make pdbqt with charges
#     if which_exists("prepare_receptor4.py"):
#         cmd_adt = ["prepare_receptor4.py", "-r", tmp_clean, "-o", dst, "-A", "hydrogens"]
#         rc2, out2, err2 = run_cmd(cmd_adt)
#         logs.append(" ".join(cmd_adt))
#         logs.append(out2 or "")
#         logs.append(err2 or "")
#         if rc2 == 0 and os.path.exists(dst):
#             return True, "\n".join(logs)
#         else:
#             logs.append(f"prepare_receptor4.py failed (rc={rc2})")
#     else:
#         logs.append("prepare_receptor4.py not found in PATH; falling back to obabel pdbqt conversion (less reliable).")

#     # 3) Fallback: obabel -> pdbqt with charges (best-effort)
#     cmd_obabel2 = ["obabel", tmp_clean, "-O", dst, "--partialcharge", "gasteiger", "-h"]
#     rc3, out3, err3 = run_cmd(cmd_obabel2)
#     logs.append(" ".join(cmd_obabel2))
#     logs.append(out3 or "")
#     logs.append(err3 or "")
#     if rc3 == 0 and os.path.exists(dst):
#         return True, "\n".join(logs)
#     return False, "\n".join(logs)


# def prepare_ligand_for_pdbqt(src: str, dst: str, workdir: Optional[str] = None) -> Tuple[bool,str]:
#     """
#     Prepare ligand -> pdbqt:
#       - generate 3D if needed, remove salts, add H
#       - use prepare_ligand4.py if available (preferred) to set torsions & charges
#       - fallback to obabel with gasteiger charges
#     """
#     logs = []
#     tmp_3d = os.path.join(workdir or tempfile.gettempdir(), f"{Path(src).stem}_ligand.3d.sdf")

#     # 1) Generate 3D + separate salts
#     cmd3d = ["obabel", src, "-O", tmp_3d, "--gen3d", "--separate", "-h"]
#     rc, out, err = run_cmd(cmd3d)
#     logs.append(" ".join(cmd3d))
#     logs.append(out or ""); logs.append(err or "")

#     # prefer AutoDockTools prepare_ligand4.py
#     if which_exists("prepare_ligand4.py"):
#         cmd_adt = ["prepare_ligand4.py", "-l", tmp_3d, "-o", dst, "-A", "hydrogens"]
#         rc2, out2, err2 = run_cmd(cmd_adt)
#         logs.append(" ".join(cmd_adt))
#         logs.append(out2 or ""); logs.append(err2 or "")
#         if rc2 == 0 and os.path.exists(dst):
#             return True, "\n".join(logs)
#         else:
#             logs.append(f"prepare_ligand4.py failed (rc={rc2})")
#     else:
#         logs.append("prepare_ligand4.py not found in PATH; falling back to obabel pdbqt conversion.")

#     # Fallback: obabel 3D -> pdbqt with charges
#     cmd_fallback = ["obabel", tmp_3d, "-O", dst, "--partialcharge", "gasteiger", "-h", "--gen3d"]
#     rc3, out3, err3 = run_cmd(cmd_fallback)
#     logs.append(" ".join(cmd_fallback))
#     logs.append(out3 or ""); logs.append(err3 or "")
#     if rc3 == 0 and os.path.exists(dst):
#         return True, "\n".join(logs)
#     return False, "\n".join(logs)


# # ---------- ENHANCED convert_any THAT ACCEPTS 'type' ----------
# def convert_any(in_path: str, out_path: str, role: Optional[str] = None) -> Tuple[bool, str]:
#     """
#     role: 'receptor' or 'ligand' or None. If out_path ends with .pdbqt
#     we will call specialized preparers for receptor/ligand.
#     """
#     out_fmt = Path(out_path).suffix.lstrip(".").lower()

#     # If target is pdbqt, run the prep pipeline
#     if out_fmt == "pdbqt":
#         try:
#             workdir = os.path.dirname(out_path) or tempfile.gettempdir()
#             if role == "receptor":
#                 ok, log = prepare_receptor_for_pdbqt(in_path, out_path, workdir=workdir)
#                 return ok, log
#             else:
#                 # default to ligand preparation
#                 ok, log = prepare_ligand_for_pdbqt(in_path, out_path, workdir=workdir)
#                 return ok, log
#         except Exception as e:
#             return False, f"PDBQT prep exception: {e}"

#     # Otherwise, use obabel as before
#     in_fmt = Path(in_path).suffix.lstrip(".").lower()
#     cmd = [
#         "obabel",
#         f"-i{in_fmt}", in_path,
#         f"-o{out_fmt}", "-O", out_path,
#         "--unique",
#         "-h"
#     ]
#     # keep previous ligand-specific extras for non-pdbqt conversions when needed
#     if out_fmt == "pdbqt":
#         cmd += ["--partialcharge", "gasteiger", "--gen3d", "--ph=7.4"]

#     rc, out, err = run_cmd(cmd)
#     log = (out or "") + "\n" + (err or "")
#     if rc != 0 or not os.path.exists(out_path):
#         return False, log
#     return True, log


# # ---------- UPDATE /convert endpoint to accept 'type' ----------
# @router.post("/convert")
# async def api_convert(
#     file: UploadFile = File(...),
#     outputFormat: str = Form(...),
#     outputFolder: str = Form(...),
#     type: str = Form("ligand")   # <-- new optional form param sent by frontend
# ):
#     outputFormat = outputFormat.lower().strip()
#     type = (type or "ligand").lower().strip()

#     allowed = ["pdb", "pdbqt", "mol2", "sdf", "cif"]
#     if outputFormat not in allowed:
#         raise HTTPException(400, f"Invalid output format: {outputFormat}")

#     os.makedirs(outputFolder, exist_ok=True)
#     in_path = save_upload(file, outputFolder)
#     base = Path(file.filename).stem
#     out_path = os.path.join(outputFolder, f"{base}.{outputFormat}")

#     ok, log = convert_any(in_path, out_path, role=type)
#     if not ok:
#         raise HTTPException(500, f"Conversion failed:\n{log}")

#     return {"status": "ok", "input": in_path, "output": out_path, "log": log}

# # ---------------------------------------------------------
# # FILE PREVIEW ENDPOINT
# # ---------------------------------------------------------
# @router.get("/file-text")
# def read_text_file(path: str):
#     with open(path, "r") as f:
#         return f.read()


# # ---------------------------------------------------------
# # FOLDER CONVERSION
# # ---------------------------------------------------------
# @router.post("/convert-folder")
# async def api_convert_folder(
#     outputFormat: str = Form(...),
#     inputFolder: Optional[str] = Form(None),
#     outputFolder: str = Form(...),
#     type: str = Form("ligand"),  # Add this
#     files: List[UploadFile] = File(None),
# ):
#     outputFormat = outputFormat.lower().strip()
#     allowed = ["pdb", "pdbqt", "mol2", "sdf", "cif"]

#     if outputFormat not in allowed:
#         raise HTTPException(400, f"Invalid output format: {outputFormat}")

#     os.makedirs(outputFolder, exist_ok=True)

#     converted = []
#     failed = []

#     # Uploaded files case
#     if files:
#         temp = tempfile.mkdtemp()
#         try:
#             for uf in files:
#                 src = save_upload(uf, temp)
#                 base = Path(uf.filename).stem
#                 out_path = os.path.join(outputFolder, f"{base}.{outputFormat}")

#                 ok, log = convert_any(src, out_path, role=type)
#                 if ok:
#                     converted.append(out_path)
#                 else:
#                     failed.append({"file": uf.filename, "error": log})
#         finally:
#             shutil.rmtree(temp, ignore_errors=True)

#     # Folder conversion case
#     else:
#         if not inputFolder or not os.path.isdir(inputFolder):
#             raise HTTPException(400, "Invalid or missing inputFolder")

#         for fname in os.listdir(inputFolder):
#             src = os.path.join(inputFolder, fname)
#             if not os.path.isfile(src):
#                 continue

#             base = Path(fname).stem
#             out_path = os.path.join(outputFolder, f"{base}.{outputFormat}")

#             ok, log = convert_any(src, out_path)
#             if ok:
#                 converted.append(out_path)
#             else:
#                 failed.append({"file": fname, "error": log})

#     return {
#         "status": "ok",
#         "converted": converted,
#         "failed": failed
#     }
# @router.get("/file")
# def serve_file(path: str):
#     if not os.path.exists(path):
#         raise HTTPException(404, "File not found")
    
#     return FileResponse(
#         path,
#         filename=os.path.basename(path),
#         media_type="application/octet-stream"
#     )
#---------------------------------------
# ML SCORING TEMPLATE
# ---------------------------------------------------------
@router.post("/score")
async def api_score(
    receptor: UploadFile = File(...),
    ligand: UploadFile = File(...),
):
    job = uuid.uuid4().hex[:8]
    outdir = os.path.join(tempfile.gettempdir(), f"score_{job}")
    os.makedirs(outdir, exist_ok=True)

    r = save_upload(receptor, outdir)
    l = save_upload(ligand, outdir)

    score = -7.52  # placeholder

    csv_path = os.path.join(outdir, "rfscore_results.csv")
    with open(csv_path, "w") as f:
        f.write("receptor,ligand,score\n")
        f.write(f"{r},{l},{score}\n")

    return {"csv": csv_path, "score": score}


# ---------------------------------------------------------
# STRUCTURAL ALIGNMENT
# ---------------------------------------------------------
@router.post("/align")
async def api_align(
    ref: UploadFile = File(...),
    mob: UploadFile = File(...),
):
    from Bio.PDB import PDBParser, PDBIO, Superimposer

    job = uuid.uuid4().hex[:8]
    outdir = os.path.join(tempfile.gettempdir(), f"align_{job}")
    os.makedirs(outdir, exist_ok=True)

    refp = save_upload(ref, outdir)
    mobp = save_upload(mob, outdir)

    parser = PDBParser(QUIET=True)
    s1 = parser.get_structure("ref", refp)
    s2 = parser.get_structure("mob", mobp)

    ref_atoms, mob_atoms = [], []
    for r1, r2 in zip(s1.get_residues(), s2.get_residues()):
        try:
            ref_atoms.append(r1["CA"])
            mob_atoms.append(r2["CA"])
        except:
            pass

    sup = Superimposer()
    sup.set_atoms(ref_atoms, mob_atoms)
    sup.apply(s2.get_atoms())

    out = os.path.join(outdir, "aligned.pdb")
    io = PDBIO()
    io.set_structure(s2)
    io.save(out)

    return {"aligned": out}


# ---------------------------------------------------------
# FILE SERVING
# ---------------------------------------------------------



# ---------------------------------------------------------
# PLIP single-file endpoint — final professional version
# ---------------------------------------------------------

# backend/api/analysis.py
# Upgraded PLIP pipeline: multi-pose support, conversion, per-pose output folders, manifest.
# - Keeps split_poses and originals in output (user requested)
# - MAX_POSES = 20 (analyze up to 20 poses)
# - Produces per-pose CSVs, combined CSV, XML, RST, JSON, diagram PNG, PyMOL .pse/.png when possible
# - Compatible with existing PlipForm.jsx front-end behavior. See original form: /mnt/data/PlipForm.jsx. :contentReference[oaicite:4]{index=4}
# ============================================================================
# PLIP ROUTER - Add this to your main backend
# ============================================================================
# File: routers/plip.py (or analysis.py if you already have one)
# ============================================================================
"""
Server Backend (Online)
Generates PLIP execution scripts - SIMPLIFIED VERSION
Processes ONE receptor-ligand pair (matching done in local backend)
"""
import os
import logging
from typing import Optional
from fastapi import APIRouter, Form, HTTPException
import requests

logging.basicConfig(level=logging.INFO)
LOG = logging.getLogger(__name__)



# ============================================================================
# PLIP SCRIPT GENERATOR - Simplified for single pair processing
# ============================================================================

def generate_plip_script(config: dict) -> str:
    """Generate PLIP execution script for single receptor-ligand pair"""
    script = '''
import os, sys, subprocess, shutil, json, csv
import xml.etree.ElementTree as ET

def safe_run(cmd, cwd=None):
    p = subprocess.run(cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if p.returncode != 0:
        raise Exception(f"Failed: {' '.join(cmd)}\\n{p.stderr}")
    return p.stdout

def remove_smiles_from_pdb(pdb_path):
    """Remove SMILES strings from PDB file"""
    temp_path = pdb_path + ".tmp"
    lines_removed = 0
    
    try:
        with open(pdb_path, "r") as infile, open(temp_path, "w") as outfile:
            for line in infile:
                stripped = line.strip()
                is_smiles = False
                
                if stripped.startswith("SMILES") or stripped.lower().startswith("smiles:"):
                    is_smiles = True
                elif "[C@@H]" in line or "[C@H]" in line or "[@" in line:
                    is_smiles = True
                elif stripped and not stripped.startswith(("ATOM", "HETATM", "TER", "END", "MODEL", "ENDMDL", "CONECT", "REMARK", "HEADER", "TITLE", "CRYST")):
                    if len(stripped) > 50 and stripped.count("(") + stripped.count("[") > 5 and stripped.count(" ") < 3:
                        is_smiles = True
                
                if is_smiles:
                    lines_removed += 1
                    continue
                    
                outfile.write(line)
        
        shutil.move(temp_path, pdb_path)
        
        if lines_removed > 0:
            print(f"  ✓ Removed {lines_removed} SMILES lines from PDB")
        
        return True
    except Exception as e:
        print(f"  ⚠ Warning: Could not clean SMILES from PDB: {e}")
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return False


def split_pdbqt_models(src, out_dir):
    """Split multi-model PDBQT into individual pose files"""
    poses = []
    model = []
    idx = 0
    with open(src, "r") as f:
        for line in f:
            if line.startswith("MODEL"):
                model = []
            model.append(line)
            if line.startswith("ENDMDL"):
                idx += 1
                out = os.path.join(out_dir, f"pose_{idx}.pdbqt")
                with open(out, "w") as o:
                    o.writelines(model)
                poses.append(out)
                model = []
    if model:
        idx += 1
        out = os.path.join(out_dir, f"pose_{idx}.pdbqt")
        with open(out, "w") as o:
            o.writelines(model)
        poses.append(out)
    return poses

def merge_pdbqt(rec, lig, outp):
    """Merge receptor and ligand into single PDB file"""
    with open(outp, "w") as out:
        out.write(open(rec).read())
        out.write(open(lig).read())

def parse_plip_xml(xml_path, output_dir):
    """Parse PLIP XML output and create CSV files"""
    if not os.path.exists(xml_path):
        return False
    try:
        tree = ET.parse(xml_path)
        root = tree.getroot()
        all_interactions = []
        interactions_by_type = {}
        
        for bindingsite in root.findall('.//bindingsite'):
            interactions_node = bindingsite.find('interactions')
            if not interactions_node:
                continue
            identifiers = bindingsite.find('identifiers')
            site_info = {
                'ligand_id': identifiers.find('hetid').text if identifiers.find('hetid') is not None else '',
                'chain': identifiers.find('chain').text if identifiers.find('chain') is not None else '',
                'position': identifiers.find('position').text if identifiers.find('position') is not None else ''
            }
            
            interaction_map = {
                'hydrophobic_interactions': 'hydrophobic_interaction',
                'hydrogen_bonds': 'hydrogen_bond',
                'water_bridges': 'water_bridge',
                'salt_bridges': 'salt_bridge',
                'pi_stacks': 'pi_stack',
                'pi_cation_interactions': 'pi_cation_interaction',
                'halogen_bonds': 'halogen_bond',
                'metal_complexes': 'metal_complex'
            }
            
            for plural, singular in interaction_map.items():
                coll = interactions_node.find(plural)
                if not coll:
                    continue
                interaction_type_name = plural.replace('_', ' ').title()
                if interaction_type_name not in interactions_by_type:
                    interactions_by_type[interaction_type_name] = []
                for interaction in coll.findall(singular):
                    data = {**site_info, 'interaction_type': interaction_type_name}
                    for child in interaction:
                        if child.text and child.text.strip():
                            data[child.tag] = child.text.strip()
                        elif len(child) > 0:
                            for subchild in child:
                                if subchild.text and subchild.text.strip():
                                    data[f"{child.tag}_{subchild.tag}"] = subchild.text.strip()
                    all_interactions.append(data)
                    interactions_by_type[interaction_type_name].append(data)
        
        if all_interactions:
            csv_path = os.path.join(output_dir, 'interactions_all.csv')
            preferred_order = [
                'interaction_type', 'dist', 'dist_d-a', 'dist_h-a', 'don_angle', 'donoridx',
                'donortype', 'restype', 'resnr', 'acceptoridx', 'acceptortype',
            ]
            all_keys = sorted(set(k for d in all_interactions for k in d.keys()))
            ordered_keys = [k for k in preferred_order if k in all_keys] + \
                           [k for k in all_keys if k not in preferred_order]
            keys = ordered_keys

            with open(csv_path, 'w', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=keys)
                writer.writeheader()
                writer.writerows(all_interactions)
            
            for itype, interactions in interactions_by_type.items():
                if not interactions:
                    continue
                filename = f"{itype.replace(' ', '_')}.csv"
                with open(os.path.join(output_dir, filename), 'w', newline='', encoding='utf-8') as f:
                    type_keys = sorted(set(k for d in interactions for k in d.keys()))
                    writer = csv.DictWriter(f, fieldnames=type_keys)
                    writer.writeheader()
                    writer.writerows(interactions)
            
            with open(os.path.join(output_dir, 'interactions_all.json'), 'w') as f:
                json.dump(all_interactions, f, indent=2)
            
            for itype, interactions in interactions_by_type.items():
                if not interactions:
                    continue
                filename = f"{itype.replace(' ', '_')}.json"
                with open(os.path.join(output_dir, filename), 'w') as f:
                    json.dump(interactions, f, indent=2)
            
            summary_path = os.path.join(output_dir, 'interaction_summary.csv')
            counts = {}
            for i in all_interactions:
                itype = i.get('interaction_type', 'Unknown')
                counts[itype] = counts.get(itype, 0) + 1
            with open(summary_path, 'w', newline='') as f:
                writer = csv.writer(f)
                writer.writerow(['Interaction Type', 'Count'])
                for itype, count in sorted(counts.items()):
                    writer.writerow([itype, count])
            return True
        return False
    except Exception as e:
        print(f"Error parsing XML: {e}")
        return False

# ============================================================================
# MAIN PROCESSING - Single receptor-ligand pair
# ============================================================================

def main():
    receptor_path = os.environ.get('RECEPTOR_PATH')
    ligand_path = os.environ.get('LIGAND_PATH')
    output_dir = os.environ.get('OUTPUT_DIR')
    max_poses = int(os.environ.get('MAX_POSES', 5))
    
    print(f"🔬 PLIP Analysis Starting...")
    print(f"  Receptor: {os.path.basename(receptor_path)}")
    print(f"  Ligand: {os.path.basename(ligand_path)}")
    print(f"  Output: {output_dir}")
    print(f"  Max poses: {max_poses}")
    
    # Original files already copied by local backend
    # Just verify they exist
    original_files_dir = os.path.join(output_dir, "original_files")
    if os.path.exists(original_files_dir):
        print(f"  ✓ Original files preserved in: {original_files_dir}")
    
    # Split ligand file into individual poses
    poses_root = os.path.join(output_dir, "poses")
    os.makedirs(poses_root, exist_ok=True)
    all_pose_files = split_pdbqt_models(ligand_path, poses_root)
    
    total_poses = len(all_pose_files)
    selected_poses = all_pose_files[:max_poses]
    
    print(f"  Total poses in ligand: {total_poses}")
    print(f"  Analyzing first {len(selected_poses)} pose(s)")
    
    # Remove excess pose files
    for pose_file in all_pose_files[max_poses:]:
        try:
            os.remove(pose_file)
        except:
            pass
    
    # Process each pose
    pose_results = []
    for i, pose_file in enumerate(selected_poses, start=1):
        print(f"\\n  🎯 Processing pose {i}/{len(selected_poses)}...")
        pose_dir = os.path.join(output_dir, f"pose_{i}")
        os.makedirs(pose_dir, exist_ok=True)
        
        merge_path = os.path.join(pose_dir, f"merge_{i}.pdbqt")
        complex_path = os.path.join(pose_dir, "complex.pdb")
        
        # Merge receptor and ligand
        merge_pdbqt(receptor_path, pose_file, merge_path)
        
        # Convert to PDB format
        safe_run(["obabel", merge_path, "-O", complex_path], cwd=pose_dir)
        
        # Remove SMILES from PDB
        print(f"    Cleaning SMILES from complex.pdb...")
        remove_smiles_from_pdb(complex_path)
        
        # Run PLIP analysis
        plip_cmd = ["plip", "-f", complex_path, "-x", "-t", "-y", "--nohydro", "--nofixfile", "--nofix"]
        try:
            safe_run(plip_cmd, cwd=pose_dir)
            xml_path = os.path.join(pose_dir, "report.xml")
            if os.path.exists(xml_path):
                parse_plip_xml(xml_path, pose_dir)
                print(f"    ✓ Pose {i} completed")
            else:
                print(f"    ⚠ Pose {i}: No XML output")
        except Exception as e:
            print(f"    ✗ Pose {i} failed: {e}")
        
        # Collect output files
        files = os.listdir(pose_dir)
        pose_results.append({
            "pose": i,
            "folder": pose_dir,
            "csv_files": [f for f in files if f.endswith('.csv')],
            "json_files": [f for f in files if f.endswith('.json')],
            "png_files": [f for f in files if f.endswith('.png')],
            "xml_files": [f for f in files if f.endswith('.xml')],
            "txt_files": [f for f in files if f.endswith('.txt')],
            "pse_files": [f for f in files if f.endswith('.pse')],
            "pml_files": [f for f in files if f.endswith('.pml')],
            "pdb_files": [f for f in files if f.endswith('.pdb')],
            "pdbqt_files": [f for f in files if f.endswith('.pdbqt')],
        })
    
    # Output results as JSON
    output = {
        "total_poses_in_file": total_poses,
        "poses_analyzed": len(selected_poses),
        "poses": pose_results
    }
    
    print(f"\\n  ✅ Analysis complete!")
    print(json.dumps(output))

if __name__ == "__main__":
    main()
'''
    return script


@router.post("/plip/submit-job")
async def plip_submit_job(
    receptor_session: str = Form(...),
    ligand_session: str = Form(...),
    output_folder: str = Form(...),
    max_poses: int = Form(5),
    max_workers: int = Form(4),
    local_backend_url: str = Form("http://127.0.0.1:5005")
):
    """
    PLIP job submission - matching done in local backend
    """
    
    LOG.info("="*60)
    LOG.info(f"[PLIP] New job request (simplified)")
    LOG.info(f"  Receptor session: {receptor_session}")
    LOG.info(f"  Ligand session: {ligand_session}")
    LOG.info(f"  Max poses per combination: {max_poses}")
    LOG.info(f"  Parallel workers: {max_workers}")
    LOG.info(f"  Local backend: {local_backend_url}")
    LOG.info("="*60)
    
    config = {
        "max_poses": max_poses,
        "max_workers": max_workers
    }
    
    # Generate simplified PLIP script (no matching logic)
    script = generate_plip_script(config)
    
    try:
        LOG.info("[PLIP] Sending script to local backend...")
        response = requests.post(
            f"{local_backend_url}/execute-job",
            data={
                "script": script,
                "receptor_session": receptor_session,
                "ligand_session": ligand_session,
                "output_folder": output_folder,
                "max_poses": max_poses,
                "max_workers": max_workers,
                "config": str(config)
            },
            timeout=10000
        )
        
        if response.status_code != 200:
            LOG.error(f"[PLIP] Error: {response.text}")
            raise HTTPException(response.status_code, f"Local backend error: {response.text}")
        
        result = response.json()
        LOG.info(f"[PLIP] ✅ Job completed!")
        LOG.info(f"  Job ID: {result.get('job_id')}")
        LOG.info(f"  Total combinations: {result.get('total_combinations')}")
        LOG.info(f"  Successful: {result.get('successful')}")
        LOG.info(f"  Failed: {result.get('failed')}")
        LOG.info(f"  Execution time: {result.get('execution_time_seconds')}s")
        
        return result
        
    except requests.exceptions.ConnectionError:
        raise HTTPException(502, 
            f"Cannot connect to local backend at {local_backend_url}. "
            "Make sure it's running on your machine.")
    except requests.exceptions.Timeout:
        raise HTTPException(504, "Job timed out")
    except Exception as e:
        LOG.exception("[PLIP] Error")
        raise HTTPException(500, f"Error: {str(e)}")


@router.get("/plip/health")
def plip_health():
    """PLIP health check"""
    return {
        "status": "healthy", 
        "service": "PLIP", 
        "version": "3.0.0",
        "features": ["flattened_structure", "exact_matching", "parallel_processing", "simplified_script"]
    }