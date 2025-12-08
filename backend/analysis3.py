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
import requests
import time
import textwrap



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


# ---------------------------------------------------------
# UNIVERSAL CONVERTER
# ---------------------------------------------------------
# ---------- PREPARATION HELPERS (receptor/ligand) ----------
def which_exists(cmdname: str) -> bool:
    return shutil.which(cmdname) is not None

def prepare_receptor_for_pdbqt(src: str, dst: str, workdir: Optional[str] = None) -> Tuple[bool,str]:
    """
    Produce a docking-ready receptor .pdbqt at dst.
    Steps:
      - strip waters / non-protein (best-effort with obabel)
      - add hydrogens
      - use AutoDockTools prepare_receptor4.py if available to create pdbqt with charges
    Returns (ok, log)
    """
    logs = []
    tmp_clean = os.path.join(workdir or tempfile.gettempdir(), f"{Path(src).stem}_receptor.cleaned.pdb")

    # 1) Try obabel to extract protein and remove waters/hetatm
    cmd_obabel = [
        "obabel", src, "-O", tmp_clean,
        "-h",        # add hydrogens
        "--delete", "HOH",  # attempt remove waters
        "--protein", # keep protein residues only
    ]
    rc, out, err = run_cmd(cmd_obabel)
    logs.append(" ".join(cmd_obabel))
    logs.append(out or "")
    logs.append(err or "")

    if rc != 0 or not os.path.exists(tmp_clean):
        # fallback: copy original and try to continue
        tmp_clean = os.path.join(workdir or tempfile.gettempdir(), f"{Path(src).stem}_receptor.fallback.pdb")
        try:
            shutil.copyfile(src, tmp_clean)
            logs.append(f"obabel protein extraction failed (rc={rc}); using original copy as fallback.")
        except Exception as e:
            return False, "\n".join(logs + [f"Failed to copy fallback: {e}"])

    # 2) Use AutoDockTools if available (preferred) to make pdbqt with charges
    if which_exists("prepare_receptor4.py"):
        cmd_adt = ["prepare_receptor4.py", "-r", tmp_clean, "-o", dst, "-A", "hydrogens"]
        rc2, out2, err2 = run_cmd(cmd_adt)
        logs.append(" ".join(cmd_adt))
        logs.append(out2 or "")
        logs.append(err2 or "")
        if rc2 == 0 and os.path.exists(dst):
            return True, "\n".join(logs)
        else:
            logs.append(f"prepare_receptor4.py failed (rc={rc2})")
    else:
        logs.append("prepare_receptor4.py not found in PATH; falling back to obabel pdbqt conversion (less reliable).")

    # 3) Fallback: obabel -> pdbqt with charges (best-effort)
    cmd_obabel2 = ["obabel", tmp_clean, "-O", dst, "--partialcharge", "gasteiger", "-h"]
    rc3, out3, err3 = run_cmd(cmd_obabel2)
    logs.append(" ".join(cmd_obabel2))
    logs.append(out3 or "")
    logs.append(err3 or "")
    if rc3 == 0 and os.path.exists(dst):
        return True, "\n".join(logs)
    return False, "\n".join(logs)


def prepare_ligand_for_pdbqt(src: str, dst: str, workdir: Optional[str] = None) -> Tuple[bool,str]:
    """
    Prepare ligand -> pdbqt:
      - generate 3D if needed, remove salts, add H
      - use prepare_ligand4.py if available (preferred) to set torsions & charges
      - fallback to obabel with gasteiger charges
    """
    logs = []
    tmp_3d = os.path.join(workdir or tempfile.gettempdir(), f"{Path(src).stem}_ligand.3d.sdf")

    # 1) Generate 3D + separate salts
    cmd3d = ["obabel", src, "-O", tmp_3d, "--gen3d", "--separate", "-h"]
    rc, out, err = run_cmd(cmd3d)
    logs.append(" ".join(cmd3d))
    logs.append(out or ""); logs.append(err or "")

    # prefer AutoDockTools prepare_ligand4.py
    if which_exists("prepare_ligand4.py"):
        cmd_adt = ["prepare_ligand4.py", "-l", tmp_3d, "-o", dst, "-A", "hydrogens"]
        rc2, out2, err2 = run_cmd(cmd_adt)
        logs.append(" ".join(cmd_adt))
        logs.append(out2 or ""); logs.append(err2 or "")
        if rc2 == 0 and os.path.exists(dst):
            return True, "\n".join(logs)
        else:
            logs.append(f"prepare_ligand4.py failed (rc={rc2})")
    else:
        logs.append("prepare_ligand4.py not found in PATH; falling back to obabel pdbqt conversion.")

    # Fallback: obabel 3D -> pdbqt with charges
    cmd_fallback = ["obabel", tmp_3d, "-O", dst, "--partialcharge", "gasteiger", "-h", "--gen3d"]
    rc3, out3, err3 = run_cmd(cmd_fallback)
    logs.append(" ".join(cmd_fallback))
    logs.append(out3 or ""); logs.append(err3 or "")
    if rc3 == 0 and os.path.exists(dst):
        return True, "\n".join(logs)
    return False, "\n".join(logs)


# ---------- ENHANCED convert_any THAT ACCEPTS 'type' ----------
def convert_any(in_path: str, out_path: str, role: Optional[str] = None) -> Tuple[bool, str]:
    """
    role: 'receptor' or 'ligand' or None. If out_path ends with .pdbqt
    we will call specialized preparers for receptor/ligand.
    """
    out_fmt = Path(out_path).suffix.lstrip(".").lower()

    # If target is pdbqt, run the prep pipeline
    if out_fmt == "pdbqt":
        try:
            workdir = os.path.dirname(out_path) or tempfile.gettempdir()
            if role == "receptor":
                ok, log = prepare_receptor_for_pdbqt(in_path, out_path, workdir=workdir)
                return ok, log
            else:
                # default to ligand preparation
                ok, log = prepare_ligand_for_pdbqt(in_path, out_path, workdir=workdir)
                return ok, log
        except Exception as e:
            return False, f"PDBQT prep exception: {e}"

    # Otherwise, use obabel as before
    in_fmt = Path(in_path).suffix.lstrip(".").lower()
    cmd = [
        "obabel",
        f"-i{in_fmt}", in_path,
        f"-o{out_fmt}", "-O", out_path,
        "--unique",
        "-h"
    ]
    # keep previous ligand-specific extras for non-pdbqt conversions when needed
    if out_fmt == "pdbqt":
        cmd += ["--partialcharge", "gasteiger", "--gen3d", "--ph=7.4"]

    rc, out, err = run_cmd(cmd)
    log = (out or "") + "\n" + (err or "")
    if rc != 0 or not os.path.exists(out_path):
        return False, log
    return True, log


# ---------- UPDATE /convert endpoint to accept 'type' ----------
@router.post("/convert")
async def api_convert(
    file: UploadFile = File(...),
    outputFormat: str = Form(...),
    outputFolder: str = Form(...),
    type: str = Form("ligand")   # <-- new optional form param sent by frontend
):
    outputFormat = outputFormat.lower().strip()
    type = (type or "ligand").lower().strip()

    allowed = ["pdb", "pdbqt", "mol2", "sdf", "cif"]
    if outputFormat not in allowed:
        raise HTTPException(400, f"Invalid output format: {outputFormat}")

    os.makedirs(outputFolder, exist_ok=True)
    in_path = save_upload(file, outputFolder)
    base = Path(file.filename).stem
    out_path = os.path.join(outputFolder, f"{base}.{outputFormat}")

    ok, log = convert_any(in_path, out_path, role=type)
    if not ok:
        raise HTTPException(500, f"Conversion failed:\n{log}")

    return {"status": "ok", "input": in_path, "output": out_path, "log": log}

# ---------------------------------------------------------
# FILE PREVIEW ENDPOINT
# ---------------------------------------------------------
@router.get("/file-text")
def read_text_file(path: str):
    with open(path, "r") as f:
        return f.read()


# ---------------------------------------------------------
# FOLDER CONVERSION
# ---------------------------------------------------------
@router.post("/convert-folder")
async def api_convert_folder(
    outputFormat: str = Form(...),
    inputFolder: Optional[str] = Form(None),
    outputFolder: str = Form(...),
    files: List[UploadFile] = File(None),
):
    outputFormat = outputFormat.lower().strip()
    allowed = ["pdb", "pdbqt", "mol2", "sdf", "cif"]

    if outputFormat not in allowed:
        raise HTTPException(400, f"Invalid output format: {outputFormat}")

    os.makedirs(outputFolder, exist_ok=True)

    converted = []
    failed = []

    # Uploaded files case
    if files:
        temp = tempfile.mkdtemp()
        try:
            for uf in files:
                src = save_upload(uf, temp)
                base = Path(uf.filename).stem
                out_path = os.path.join(outputFolder, f"{base}.{outputFormat}")

                ok, log = convert_any(src, out_path, role=type)
                if ok:
                    converted.append(out_path)
                else:
                    failed.append({"file": uf.filename, "error": log})
        finally:
            shutil.rmtree(temp, ignore_errors=True)

    # Folder conversion case
    else:
        if not inputFolder or not os.path.isdir(inputFolder):
            raise HTTPException(400, "Invalid or missing inputFolder")

        for fname in os.listdir(inputFolder):
            src = os.path.join(inputFolder, fname)
            if not os.path.isfile(src):
                continue

            base = Path(fname).stem
            out_path = os.path.join(outputFolder, f"{base}.{outputFormat}")

            ok, log = convert_any(src, out_path)
            if ok:
                converted.append(out_path)
            else:
                failed.append({"file": fname, "error": log})

    return {
        "status": "ok",
        "converted": converted,
        "failed": failed
    }
@router.get("/file")
def serve_file(folder: str, name: str):
    full = os.path.join(folder, name)

    if not os.path.exists(full):
        raise HTTPException(404, "File not found")

    return FileResponse(
        full,
        filename=name,
        media_type="application/octet-stream"
    )

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
@router.get("/file")
async def serve_file(path: str):
    if not os.path.exists(path):
        raise HTTPException(404, "Not found")
    return FileResponse(path)


# ---------------------------------------------------------
# PLIP single-file endpoint — final professional version
# ---------------------------------------------------------


# adjust to where the user's local runner listens
LOCAL_RUN_SCRIPT = "http://127.0.0.1:5005/run-script"

@router.post("/plip-generate")
async def plip_generate_and_forward(
    receptor_file: UploadFile = File(None),
    ligand_file: UploadFile = File(None),
    receptor_path: str = Form(None),
    ligand_path: str = Form(None),
    output_folder: str = Form(...),
    remove_waters: bool = Form(True),
    remove_ions: bool = Form(False),
    add_hydrogens: bool = Form(False),
    keep_hetero: bool = Form(True),
):
    """
    Generate a portable PLIP pipeline Python script and forward it (plus any uploaded files)
    to the local backend /run-script. Returns local-run response to frontend.
    """

    if not output_folder:
        raise HTTPException(status_code=400, detail="Missing output_folder")

    # create staging dir to temporarily store any uploaded files
    job_tag = uuid.uuid4().hex[:8]
    stage_dir = os.path.join(tempfile.gettempdir(), f"plip_script_{job_tag}")
    os.makedirs(stage_dir, exist_ok=True)

    staged_rec = None
    staged_lig = None

    try:
        if receptor_file:
            staged_rec = os.path.join(stage_dir, os.path.basename(receptor_file.filename))
            with open(staged_rec, "wb") as fh:
                fh.write(await receptor_file.read())
        elif receptor_path and os.path.isfile(receptor_path):
            staged_rec = os.path.join(stage_dir, os.path.basename(receptor_path))
            shutil.copyfile(receptor_path, staged_rec)

        if ligand_file:
            staged_lig = os.path.join(stage_dir, os.path.basename(ligand_file.filename))
            with open(staged_lig, "wb") as fh:
                fh.write(await ligand_file.read())
        elif ligand_path and os.path.isfile(ligand_path):
            staged_lig = os.path.join(stage_dir, os.path.basename(ligand_path))
            shutil.copyfile(ligand_path, staged_lig)

    except Exception as e:
        shutil.rmtree(stage_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Failed to stage files: {e}")

    # build script content
    script = build_plip_pipeline_script(
        receptor_filename=os.path.basename(staged_rec) if staged_rec else None,
        ligand_filename=os.path.basename(staged_lig) if staged_lig else None,
        receptor_path=receptor_path if (staged_rec is None and receptor_path) else None,
        ligand_path=ligand_path if (staged_lig is None and ligand_path) else None,
        output_folder=output_folder,
        remove_waters=remove_waters,
        remove_ions=remove_ions,
        add_hydrogens=add_hydrogens,
        keep_hetero=keep_hetero,
        stage_dir=stage_dir
    )

    # prepare multipart/form-data to send to local runner
    files = {}
    data = {"script_content": script}

    if staged_rec:
        files["receptor_upload"] = (os.path.basename(staged_rec), open(staged_rec, "rb"))
    if staged_lig:
        files["ligand_upload"] = (os.path.basename(staged_lig), open(staged_lig, "rb"))

    try:
        r = requests.post(LOCAL_RUN_SCRIPT, data=data, files=files, timeout=300)
    except Exception as e:
        # close handles and cleanup
        for v in files.values():
            try:
                v[1].close()
            except:
                pass
        shutil.rmtree(stage_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Failed to contact local backend: {e}")

    # close file handles
    for v in files.values():
        try:
            v[1].close()
        except:
            pass

    # cleanup staging directory (we already forwarded files)
    shutil.rmtree(stage_dir, ignore_errors=True)

    if r.status_code != 200:
        raise HTTPException(status_code=r.status_code, detail=f"Local backend returned error: {r.text}")

    try:
        resp = r.json()
    except Exception:
        resp = {"raw": r.text}

    return {"online_job": job_tag, "local_run": resp}


# --------------------------
# Script builder (safe, avoids unescaped braces in f-strings)
# --------------------------
def build_plip_pipeline_script(
    receptor_filename: Optional[str],
    ligand_filename: Optional[str],
    receptor_path: Optional[str],
    ligand_path: Optional[str],
    output_folder: str,
    remove_waters: bool,
    remove_ions: bool,
    add_hydrogens: bool,
    keep_hetero: bool,
    stage_dir: Optional[str],
) -> str:
    """
    Returns a full Python script (string). The script will:
      - copy forwarded files (if any) into job output dir
      - split ligand (pdbqt) into poses
      - merge receptor+pose -> merge_X.pdbqt
      - obabel convert -> complex.pdb
      - call PLIP CLI to analyze (report.xml, report.txt, ...)
      - parse XML into CSV + JSON summary
      - try headless PyMOL rendering (PNG/PSE) if available
      - print manifest JSON wrapped in markers to stdout
    """

    # Prepare literal values to inject into template safely
    def py_string(val):
        return "None" if val is None else repr(str(val))

    def py_bool(b):
        return "True" if b else "False"

    tpl = r'''#!/usr/bin/env python3
# Auto-generated PLIP pipeline (safe template)
# JOB_PLACEHOLDER

import os, sys, json, shutil, subprocess, traceback, uuid
from pathlib import Path
import csv
import xml.etree.ElementTree as ET

OUTPUT_ROOT = OUTPUT_ROOT_REPL
RECEPTOR_UPLOAD = RECEPTOR_UPLOAD_REPL
LIGAND_UPLOAD = LIGAND_UPLOAD_REPL
RECEPTOR_PATH = RECEPTOR_PATH_REPL
LIGAND_PATH = LIGAND_PATH_REPL

PLIP_NOHYDRO = PLIP_NOHYDRO_REPL
PLIP_NOFIXFILE = PLIP_NOFIXFILE_REPL
PLIP_NOFIX = PLIP_NOFIX_REPL

TRY_PYMOL = True
PYMOL_PNG_SIZE = (1200, 1200)

JOB_ID = uuid.uuid4().hex[:8]
JOB_DIR = os.path.join(OUTPUT_ROOT, "plip_job_" + JOB_ID)
os.makedirs(JOB_DIR, exist_ok=True)
ORIG = os.path.join(JOB_DIR, "original_files")
os.makedirs(ORIG, exist_ok=True)

def log(m):
    print(m, flush=True)

def run_cmd(cmd, cwd=None, env=None):
    log("CMD: " + " ".join(cmd))
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, cwd=cwd, env=env)
    return p.returncode, p.stdout, p.stderr

def split_pdbqt(src, outdir):
    poses = []
    cur = []
    idx = 0
    with open(src, "r", encoding="utf-8", errors="ignore") as fh:
        for ln in fh:
            up = ln.strip().upper()
            if up.startswith("MODEL"):
                cur = [ln]
            elif up.startswith("ENDMDL"):
                cur.append(ln)
                idx += 1
                outp = os.path.join(outdir, "pose_%d.pdbqt" % idx)
                with open(outp, "w", encoding="utf-8") as wf:
                    wf.writelines(cur)
                poses.append(outp)
                cur = []
            elif cur:
                cur.append(ln)
    if not poses:
        outp = os.path.join(outdir, "pose_1.pdbqt")
        shutil.copy(src, outp)
        poses.append(outp)
    return poses

def obabel_convert(src, dst):
    cmd = ["obabel", src, "-O", dst]
    rc, out, err = run_cmd(cmd)
    if rc != 0 or not os.path.exists(dst):
        raise RuntimeError("obabel failed: " + (err or out))
    return dst

def parse_plip_xml_to_csvs(xml_path, out_dir, pose_index):
    produced = {"xml": xml_path, "csvs": [], "combined_csv": None, "summary_json": None}
    try:
        tree = ET.parse(xml_path)
        root = tree.getroot()
    except Exception as e:
        log("XML parse failed: " + str(e))
        return produced

    combined_rows = []
    # iterate InteractionSet nodes
    for set_el in root.findall(".//InteractionSet"):
        set_index = set_el.get("index") or "1"
        for type_el in list(set_el):
            type_name = type_el.tag
            rows = []
            for it_el in type_el.findall("Interaction"):
                summary = (it_el.findtext("Summary") or "").strip()
                distance = (it_el.findtext("Distance") or "").strip()
                partner1 = (it_el.findtext("Partner1") or "").strip()
                partner2 = (it_el.findtext("Partner2") or "").strip()
                rows.append({
                    "set": set_index,
                    "pose": pose_index,
                    "type": type_name,
                    "partner1": partner1,
                    "partner2": partner2,
                    "distance": distance,
                    "summary": summary
                })
            if rows:
                fname = os.path.join(out_dir, "plip_%s_set%s_pose%d.csv" % (type_name, set_index, pose_index))
                keys = ["set","pose","type","partner1","partner2","distance","summary"]
                with open(fname, "w", newline='', encoding="utf-8") as fh:
                    writer = csv.DictWriter(fh, fieldnames=keys)
                    writer.writeheader()
                    writer.writerows(rows)
                produced["csvs"].append(fname)
                combined_rows.extend(rows)

    combined_path = os.path.join(out_dir, "plip_interactions_pose%d.csv" % pose_index)
    keys = ["set","pose","type","partner1","partner2","distance","summary"]
    with open(combined_path, "w", newline='', encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=keys)
        writer.writeheader()
        writer.writerows(combined_rows)
    produced["combined_csv"] = combined_path

    summary = {"pose": pose_index, "sets": []}
    for set_el in root.findall(".//InteractionSet"):
        set_index = set_el.get("index") or "1"
        sd = {"index": set_index}
        for t in ["HydrogenBonds","Hydrophobic","WaterBridges","PiStackings","PiCation","HalogenBonds","SaltBridges","MetalComplexes"]:
            cnt = len(set_el.findall(".//%s/Interaction" % t))
            sd[t] = cnt
        summary["sets"].append(sd)
    summary_path = os.path.join(out_dir, "plip_summary_pose%d.json" % pose_index)
    with open(summary_path, "w", encoding="utf-8") as jf:
        json.dump(summary, jf, indent=2)
    produced["summary_json"] = summary_path

    return produced

def try_pymol_render(pdb_path, pose_dir, base_name):
    out = {"pml": None, "png": None, "pse": None, "log": ""}
    pml_path = os.path.join(pose_dir, base_name + ".pml")
    png_path = os.path.join(pose_dir, base_name + ".png")
    pse_path = os.path.join(pose_dir, base_name + ".pse")
    try:
        with open(pml_path, "w", encoding="utf-8") as pf:
            pf.write("reinitialize\n")
            pf.write("load %s, complex\n" % pdb_path)
            pf.write("hide everything\n")
            pf.write("show cartoon, complex and polymer\n")
            pf.write("show sticks, complex and organic\n")
            pf.write("bg_color white\n")
            pf.write("zoom complex\n")
    except Exception as e:
        out["log"] += "PML write failed: " + str(e) + "\n"
        return out

    try:
        cmd = ["pymol", "-cq", "-d", "run %s; png '%s', %d, %d; save '%s'; quit;" % (pml_path, png_path, PYMOL_PNG_SIZE[0], PYMOL_PNG_SIZE[1], pse_path)]
        rc, stdout, stderr = run_cmd(cmd)
        out["log"] += stdout + "\n" + stderr
        if os.path.exists(png_path) and os.path.getsize(png_path) > 200:
            out["png"] = png_path
        if os.path.exists(pse_path) and os.path.getsize(pse_path) > 200:
            out["pse"] = pse_path
        out["pml"] = pml_path
    except Exception as e:
        out["log"] += "Pymol run failed: " + str(e) + "\n"
    return out

# MAIN
try:
    # resolve inputs
    if RECEPTOR_UPLOAD is not None:
        rec_src = os.path.abspath(RECEPTOR_UPLOAD)
        shutil.copy(rec_src, os.path.join(ORIG, os.path.basename(rec_src)))
        receptor = os.path.join(ORIG, os.path.basename(rec_src))
    elif RECEPTOR_PATH is not None:
        receptor = RECEPTOR_PATH
        shutil.copy(receptor, os.path.join(ORIG, os.path.basename(receptor)))
        receptor = os.path.join(ORIG, os.path.basename(receptor))
    else:
        raise RuntimeError("No receptor provided")

    if LIGAND_UPLOAD is not None:
        lig_src = os.path.abspath(LIGAND_UPLOAD)
        shutil.copy(lig_src, os.path.join(ORIG, os.path.basename(lig_src)))
        ligand = os.path.join(ORIG, os.path.basename(lig_src))
    elif LIGAND_PATH is not None:
        ligand = LIGAND_PATH
        shutil.copy(ligand, os.path.join(ORIG, os.path.basename(ligand)))
        ligand = os.path.join(ORIG, os.path.basename(ligand))
    else:
        raise RuntimeError("No ligand provided")

    log("Inputs resolved -> receptor=%s, ligand=%s" % (receptor, ligand))

    POSES_ROOT = os.path.join(JOB_DIR, "poses")
    os.makedirs(POSES_ROOT, exist_ok=True)
    pose_files = split_pdbqt(ligand, POSES_ROOT)
    log("Found %d poses" % len(pose_files))

    # run per-pose
    manifest_poses = []
    for i, pose in enumerate(pose_files, start=1):
        pose_dir = os.path.join(JOB_DIR, "pose_%d" % i)
        os.makedirs(pose_dir, exist_ok=True)

        merge_path = os.path.join(pose_dir, "merge_%d.pdbqt" % i)
        complex_pdb = os.path.join(pose_dir, "complex.pdb")

        with open(merge_path, "w", encoding="utf-8") as mf:
            mf.write(open(receptor, "r", encoding="utf-8", errors="ignore").read())
            mf.write("\n")
            mf.write(open(pose, "r", encoding="utf-8", errors="ignore").read())

        obabel_convert(merge_path, complex_pdb)

        # call PLIP CLI (uses plip command from PATH; your environment should provide it)
        plip_cmd = ["plip", "-f", complex_pdb, "-x", "-t"]
        if PLIP_NOHYDRO:
            plip_cmd.append("--nohydro")
        if PLIP_NOFIXFILE:
            plip_cmd.append("--nofixfile")
        if PLIP_NOFIX:
            plip_cmd.append("--nofix")
        plip_cmd += ["--outputfmt", "xml,txt,json"]

        rc, out, err = run_cmd(plip_cmd, cwd=pose_dir)
        log("PLIP rc=%d" % rc)
        if out:
            log(out)
        if err:
            log("PLIP stderr: " + err)

        # find XML produced by PLIP
        xml_candidates = [os.path.join(pose_dir, f) for f in os.listdir(pose_dir) if f.lower().endswith(".xml")]
        xml_path = xml_candidates[0] if xml_candidates else None

        produced = {"xml": xml_path, "raw_stdout": out, "raw_stderr": err, "csvs": [], "combined_csv": None, "summary_json": None, "pymol": {}}

        if xml_path:
            log("Parsing PLIP XML at: %s" % xml_path)
            p = parse_plip_xml_to_csvs(xml_path, pose_dir, i)
            produced["csvs"] = p.get("csvs", [])
            produced["combined_csv"] = p.get("combined_csv")
            produced["summary_json"] = p.get("summary_json")

        if TRY_PYMOL:
            try:
                pymol_res = try_pymol_render(complex_pdb, pose_dir, "plip_pose%d" % i)
                produced["pymol"] = pymol_res
            except Exception as e:
                produced["pymol"] = {"error": str(e)}

        manifest_poses.append({"pose": i, "pose_dir": pose_dir, "files": sorted(os.listdir(pose_dir)), "produced": produced})

    manifest = {"job_id": JOB_ID, "outdir": JOB_DIR, "pose_count": len(manifest_poses), "poses": manifest_poses}

    print("PLIP_SCRIPT_RESULT_JSON_START")
    print(json.dumps(manifest))
    print("PLIP_SCRIPT_RESULT_JSON_END")
    sys.stdout.flush()
    sys.exit(0)

except Exception as e:
    tb = traceback.format_exc()
    print("PLIP_SCRIPT_FAILED")
    print(str(e))
    print(tb)
    sys.stdout.flush()
    sys.exit(2)
'''

    # replace placeholders safely
    tpl = tpl.replace("JOB_PLACEHOLDER", f"# online_job_template_id: {uuid.uuid4().hex[:8]}")
    tpl = tpl.replace("OUTPUT_ROOT_REPL", py_string(output_folder))
    tpl = tpl.replace("RECEPTOR_UPLOAD_REPL", py_string(receptor_filename))
    tpl = tpl.replace("LIGAND_UPLOAD_REPL", py_string(ligand_filename))
    tpl = tpl.replace("RECEPTOR_PATH_REPL", py_string(receptor_path))
    tpl = tpl.replace("LIGAND_PATH_REPL", py_string(ligand_path))

    tpl = tpl.replace("PLIP_NOHYDRO_REPL", py_bool(remove_waters))
    tpl = tpl.replace("PLIP_NOFIXFILE_REPL", py_bool(remove_ions))
    tpl = tpl.replace("PLIP_NOFIX_REPL", py_bool(keep_hetero))

    return tpl
