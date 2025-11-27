# backend/api/analysis.py


import os
import uuid
import json
import tempfile
import subprocess
import shutil
import csv
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

    # -----------------------------------------
    # CASE 1 — Uploaded folder via browser
    # -----------------------------------------
    if files:
        temp_dir = tempfile.mkdtemp()
        for f in files:
            try:
                src = save_upload(f, temp_dir)
                base = Path(f.filename).stem
                out_path = os.path.join(outputFolder, f"{base}.pdbqt")

                if type == "ligand":
                    ok, log = convert_ligand(src, out_path)
                else:
                    ok, log = convert_receptor(src, out_path)

                if ok:
                    converted.append(out_path)
                else:
                    failed.append({"file": f.filename, "error": log})

            except Exception as e:
                failed.append({"file": f.filename, "error": str(e)})

    # -----------------------------------------
    # CASE 2 — Server-side folder
    # -----------------------------------------
    else:
        if not inputFolder or not os.path.isdir(inputFolder):
            raise HTTPException(400, "inputFolder missing or does not exist")

        for fname in os.listdir(inputFolder):
            path = os.path.join(inputFolder, fname)
            if not os.path.isfile(path):
                continue

            ext = Path(fname).suffix.lower()
            if ext not in [".pdb", ".pdbqt"]:
                continue

            base = Path(fname).stem
            out_path = os.path.join(outputFolder, f"{base}.pdbqt")

            try:
                if type == "ligand":
                    ok, log = convert_ligand(path, out_path)
                else:
                    ok, log = convert_receptor(path, out_path)

                if ok:
                    converted.append(out_path)
                else:
                    failed.append({"file": fname, "error": log})
            except Exception as e:
                failed.append({"file": fname, "error": str(e)})

    return {
        "status": "ok",
        "type": type,
        "converted": converted,
        "failed": failed,
        "job": uuid.uuid4().hex[:8],
    }


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

# backend/api/analysis.py
# Upgraded PLIP pipeline: multi-pose support, conversion, per-pose output folders, manifest.
# - Keeps split_poses and originals in output (user requested)
# - MAX_POSES = 20 (analyze up to 20 poses)
# - Produces per-pose CSVs, combined CSV, XML, RST, JSON, diagram PNG, PyMOL .pse/.png when possible
# - Compatible with existing PlipForm.jsx front-end behavior. See original form: /mnt/data/PlipForm.jsx. :contentReference[oaicite:4]{index=4}


# reuse helper names/style from your existing analysis.py where possible


# ---------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------
def run_cmd(cmd: List[str], cwd: Optional[str] = None, env: Optional[dict] = None) -> Tuple[int, str, str]:
    try:
        completed = subprocess.run(cmd, text=True, capture_output=True, check=False, cwd=cwd, env=env)
        return completed.returncode, completed.stdout or "", completed.stderr or ""
    except Exception as e:
        return 999, "", str(e)

def save_upload(upload: UploadFile, folder: str) -> str:
    os.makedirs(folder, exist_ok=True)
    upload.file.seek(0)
    dest = os.path.join(folder, upload.filename)
    with open(dest, "wb") as f:
        f.write(upload.file.read())
    return dest

# ---------------------------------------------------------
# File format helpers (OpenBabel-based)
# ---------------------------------------------------------
def obabel_convert(src: str, dst: str, extra_args: Optional[List[str]] = None) -> Tuple[bool, str]:
    """
    Use obabel to convert src -> dst. Returns (ok, log).
    """
    extra_args = extra_args or []
    fmt_in = Path(src).suffix.lstrip(".").lower()
    fmt_out = Path(dst).suffix.lstrip(".").lower()
    cmd = ["obabel", f"-i{fmt_in}", src, f"-o{fmt_out}", "-O", dst] + extra_args
    rc, out, err = run_cmd(cmd)
    log = (out or "") + "\n" + (err or "")
    if rc != 0 or not os.path.exists(dst):
        return False, f"obabel failed (rc={rc}):\n{log}"
    return True, log

# ---------------------------------------------------------
# PDBQT multi-model splitting
# ---------------------------------------------------------
def split_pdbqt_models(src_pdbqt: str, out_dir: str) -> List[str]:
    """
    Split a multi-model PDBQT file into separate pose files.
    Returns list of paths to produced files in order (MODEL 1 -> MODEL N).
    Keeps original numbering starting at 1.
    """
    os.makedirs(out_dir, exist_ok=True)
    produced = []
    with open(src_pdbqt, "r", encoding="utf-8", errors="ignore") as fh:
        lines = fh.readlines()

    current = []
    model_idx = 0
    header = []
    in_model = False
    saw_any_model = False

    for ln in lines:
        if ln.strip().upper().startswith("MODEL"):
            # new model begins
            if in_model and current:
                # write previous model
                model_idx += 1
                outp = os.path.join(out_dir, f"{Path(src_pdbqt).stem}_pose_{model_idx}.pdbqt")
                with open(outp, "w", encoding="utf-8") as wf:
                    wf.writelines(header + current + ["ENDMDL\n"])
                produced.append(outp)
                current = []
            else:
                # first MODEL
                saw_any_model = True
            in_model = True
            continue
        if ln.strip().upper().startswith("ENDMDL"):
            if in_model:
                # close current
                model_idx += 1
                outp = os.path.join(out_dir, f"{Path(src_pdbqt).stem}_pose_{model_idx}.pdbqt")
                with open(outp, "w", encoding="utf-8") as wf:
                    wf.writelines(header + current + ["ENDMDL\n"])
                produced.append(outp)
                current = []
            in_model = False
            continue

        # capture header lines (REMARK, etc.) before the first MODEL
        if not saw_any_model and not in_model:
            header.append(ln)
        elif in_model:
            current.append(ln)
        else:
            # if file had no MODEL/ENDMDL, treat entire file as single model
            # (this handles single-pose pdbqt)
            header.append(ln)

    # If file contained no MODEL markers: treat the whole file as a single pose
    if not produced:
        # write single file copy
        single_out = os.path.join(out_dir, f"{Path(src_pdbqt).stem}_pose_1.pdbqt")
        shutil.copyfile(src_pdbqt, single_out)
        produced = [single_out]

    return produced

# ---------------------------------------------------------
# Simple PDB merger (receptor + ligand)
# ---------------------------------------------------------
def merge_receptor_and_ligand(receptor_pdb: str, ligand_pdb: str, out_path: str) -> None:
    """
    Append ligand after receptor, add TER and END. Clean MODEL/ENDMDL/TER.
    """
    def filtered_lines(path):
        res = []
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            for ln in f:
                if ln.startswith("MODEL") or ln.startswith("ENDMDL") or ln.startswith("TER") or ln.startswith("END"):
                    continue
                res.append(ln.rstrip("\n"))
        return res

    rec_lines = filtered_lines(receptor_pdb)
    lig_lines = filtered_lines(ligand_pdb)

    with open(out_path, "w", encoding="utf-8") as out:
        for ln in rec_lines:
            out.write(ln + "\n")
        # add TER separator
        out.write("TER\n")
        for ln in lig_lines:
            out.write(ln + "\n")
        out.write("END\n")

import re

def clean_and_renumber_pdb(in_pdb: str, out_dir: str) -> str:
    """
    Create a cleaned, re-numbered copy of in_pdb.
    - Renumber atom serials sequentially starting at 1
    - Renumber residue sequence numbers per chain starting at 1
    - Update CONECT records to refer to new atom serials
    Returns path to cleaned pdb.
    """
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"{Path(in_pdb).stem}_cleaned.pdb")

    atom_lines = []         # tuples: (orig_index, line)
    other_lines = []        # non-atom lines (including CONECT kept separately)
    conect_lines = []

    # regex for CONECT: starts with "CONECT"
    with open(in_pdb, "r", encoding="utf-8", errors="ignore") as fh:
        for ln in fh:
            if ln.startswith("ATOM") or ln.startswith("HETATM"):
                atom_lines.append(ln.rstrip("\n"))
            elif ln.startswith("CONECT"):
                conect_lines.append(ln.rstrip("\n"))
            else:
                other_lines.append(ln.rstrip("\n"))

    # Build mapping old_atom_index -> new_atom_index
    old_to_new = {}
    new_atom_lines = []
    new_idx = 1
    # PDB atom serial lives in columns 6-11 (1-based indices)
    for ln in atom_lines:
        # try to parse old serial (columns 6-11) robustly
        # fallback: parse integer tokens
        old_serial = None
        try:
            old_serial = int(ln[6:11].strip())
        except Exception:
            parts = ln.split()
            if len(parts) >= 2:
                try:
                    old_serial = int(parts[1])
                except Exception:
                    old_serial = None
        if old_serial is None:
            # assign incremental mapping if we couldn't parse old
            old_serial = new_idx

        old_to_new[old_serial] = new_idx

        # Replace atom serial in fixed-width column (6..11)
        # Build a new line with new serial right aligned in width 5
        prefix = ln[:6]
        suffix = ln[11:]
        new_serial_str = f"{new_idx:5d}"
        new_ln = f"{prefix}{new_serial_str}{suffix}"
        new_atom_lines.append(new_ln)
        new_idx += 1

    # Renumber residues per chain (chain ID col 21, resSeq cols 22-26)
    # We'll map (chainID, oldResSeq, iCode) -> newResSeq (1-based increment)
    res_map = {}
    new_res_counter = {}
    final_atom_lines = []
    for ln in new_atom_lines:
        # Safely extract chain and resSeq
        try:
            chain = ln[21] if len(ln) > 21 else " "
            old_resseq_str = ln[22:26].strip()
            old_icode = ln[26:27] if len(ln) > 26 else " "
            old_reskey = (chain, old_resseq_str, old_icode)
        except Exception:
            chain = " "
            old_reskey = (chain, None, None)

        # assign new residue number per chain
        if old_reskey not in res_map:
            new_resnum = new_res_counter.get(chain, 0) + 1
            res_map[old_reskey] = new_resnum
            new_res_counter[chain] = new_resnum
        else:
            new_resnum = res_map[old_reskey]

        # replace residue sequence columns (22:26) with right-aligned 4-digit number
        before = ln[:22]
        after = ln[26:]
        new_res_str = f"{new_resnum:4d}"
        ln2 = before + new_res_str + after
        final_atom_lines.append(ln2)

    # Update CONECT lines: replace old indexes with new indexes using old_to_new map
    new_conect = []
    for cl in conect_lines:
        parts = cl.split()
        if len(parts) < 2:
            continue
        # parts[0] == "CONECT"
        updated = ["CONECT"]
        for token in parts[1:]:
            try:
                old_idx = int(token)
                new_idx_map = old_to_new.get(old_idx)
                if new_idx_map is not None:
                    updated.append(str(new_idx_map))
                else:
                    # skip references to atoms we removed/unparsable
                    continue
            except Exception:
                continue
        if len(updated) > 1:
            new_conect.append(" ".join(updated))

    # Compose final cleaned pdb: keep header/remarks/other_lines (except old CONECTs), then atom lines, then CONECTs, then END
    with open(out_path, "w", encoding="utf-8") as wf:
        for ln in other_lines:
            # skip old CONECT lines already handled
            if ln.startswith("CONECT"):
                continue
            wf.write(ln + "\n")
        for ln in final_atom_lines:
            wf.write(ln + "\n")
        # write TER and END if not present
        wf.write("TER\n")
        for cl in new_conect:
            wf.write(cl + "\n")
        wf.write("END\n")

    return out_path


# ---------------------------------------------------------
# Export helpers (CSV, XML, RST, PyMOL session)
# ---------------------------------------------------------
def write_interaction_csvs(complex_obj, outdir: str, prefix: str) -> Dict[str, Any]:
    os.makedirs(outdir, exist_ok=True)
    combined_rows = []
    per_type_files = []

    for s_idx, s in enumerate(complex_obj.interaction_sets):
        def row_from_interaction(it, itype):
            # robust extraction
            partner1 = getattr(it, "res1", None) or getattr(it, "partner1", None) or getattr(it, "atom1", None)
            partner2 = getattr(it, "res2", None) or getattr(it, "partner2", None) or getattr(it, "atom2", None)
            dist = getattr(it, "distance", None) or getattr(it, "dist", None) or ""
            p1 = str(partner1)[:250] if partner1 is not None else ""
            p2 = str(partner2)[:250] if partner2 is not None else ""
            return {"set": s_idx+1, "type": itype, "partner1": p1, "partner2": p2, "distance": dist, "repr": str(it)}

        # hydrogen bonds
        if hasattr(s, "hbonds"):
            rows = [row_from_interaction(i, "hydrogen_bond") for i in s.hbonds]
            path = os.path.join(outdir, f"plip_hbonds_{prefix}.csv")
            with open(path, "w", newline="") as fh:
                writer = csv.DictWriter(fh, fieldnames=["set","type","partner1","partner2","distance","repr"])
                writer.writeheader(); writer.writerows(rows)
            per_type_files.append(path); combined_rows += rows

        # hydrophobic
        if hasattr(s, "hydrophobic_contacts"):
            rows = [row_from_interaction(i, "hydrophobic") for i in s.hydrophobic_contacts]
            path = os.path.join(outdir, f"plip_hydrophobic_{prefix}.csv")
            with open(path, "w", newline="") as fh:
                writer = csv.DictWriter(fh, fieldnames=["set","type","partner1","partner2","distance","repr"])
                writer.writeheader(); writer.writerows(rows)
            per_type_files.append(path); combined_rows += rows

        # water bridges
        if hasattr(s, "water_bridges"):
            rows = [row_from_interaction(i, "water_bridge") for i in s.water_bridges]
            path = os.path.join(outdir, f"plip_waterbridges_{prefix}.csv")
            with open(path, "w", newline="") as fh:
                writer = csv.DictWriter(fh, fieldnames=["set","type","partner1","partner2","distance","repr"])
                writer.writeheader(); writer.writerows(rows)
            per_type_files.append(path); combined_rows += rows

        # pi stackings
        if hasattr(s, "pi_stackings"):
            rows = []
            for i in s.pi_stackings:
                orient = getattr(i, "orientation", "")
                tname = "pi_stacking_parallel" if orient == "parallel" else "pi_stacking_perpendicular" if orient == "perpendicular" else "pi_stacking"
                rows.append(row_from_interaction(i, tname))
            path = os.path.join(outdir, f"plip_pistacking_{prefix}.csv")
            with open(path, "w", newline="") as fh:
                writer = csv.DictWriter(fh, fieldnames=["set","type","partner1","partner2","distance","repr"])
                writer.writeheader(); writer.writerows(rows)
            per_type_files.append(path); combined_rows += rows

        # pi cation
        if hasattr(s, "pi_cation"):
            rows = [row_from_interaction(i, "pi_cation") for i in s.pi_cation]
            path = os.path.join(outdir, f"plip_pication_{prefix}.csv")
            with open(path, "w", newline="") as fh:
                writer = csv.DictWriter(fh, fieldnames=["set","type","partner1","partner2","distance","repr"])
                writer.writeheader(); writer.writerows(rows)
            per_type_files.append(path); combined_rows += rows

        # halogen
        if hasattr(s, "halogen_bonds"):
            rows = [row_from_interaction(i, "halogen_bond") for i in s.halogen_bonds]
            path = os.path.join(outdir, f"plip_halogen_{prefix}.csv")
            with open(path, "w", newline="") as fh:
                writer = csv.DictWriter(fh, fieldnames=["set","type","partner1","partner2","distance","repr"])
                writer.writeheader(); writer.writerows(rows)
            per_type_files.append(path); combined_rows += rows

        # salt bridges
        if hasattr(s, "salt_bridges"):
            rows = [row_from_interaction(i, "salt_bridge") for i in s.salt_bridges]
            path = os.path.join(outdir, f"plip_saltbridges_{prefix}.csv")
            with open(path, "w", newline="") as fh:
                writer = csv.DictWriter(fh, fieldnames=["set","type","partner1","partner2","distance","repr"])
                writer.writeheader(); writer.writerows(rows)
            per_type_files.append(path); combined_rows += rows

        # metal complexes
        if hasattr(s, "metal_complexes"):
            rows = [row_from_interaction(i, "metal_complex") for i in s.metal_complexes]
            path = os.path.join(outdir, f"plip_metals_{prefix}.csv")
            with open(path, "w", newline="") as fh:
                writer = csv.DictWriter(fh, fieldnames=["set","type","partner1","partner2","distance","repr"])
                writer.writeheader(); writer.writerows(rows)
            per_type_files.append(path); combined_rows += rows

    # combined CSV
    comb_path = os.path.join(outdir, f"plip_interactions_{prefix}.csv")
    with open(comb_path, "w", newline="") as fc:
        writer = csv.DictWriter(fc, fieldnames=["set","type","partner1","partner2","distance","repr"])
        writer.writeheader(); writer.writerows(combined_rows)

    return {"combined_csv": comb_path, "per_type": per_type_files}

def write_xml_export(complex_obj, outpath: str) -> str:
    root = ET.Element("PLIPAnalysis")
    for s_idx, s in enumerate(complex_obj.interaction_sets):
        set_el = ET.SubElement(root, "InteractionSet", attrib={"index": str(s_idx+1)})
        def add_group(name, items):
            g = ET.SubElement(set_el, name)
            for it in items:
                it_el = ET.SubElement(g, "Interaction")
                ET.SubElement(it_el, "Type").text = name
                ET.SubElement(it_el, "Summary").text = str(it)[:1000]
        if hasattr(s, "hbonds"): add_group("HydrogenBonds", s.hbonds)
        if hasattr(s, "hydrophobic_contacts"): add_group("Hydrophobic", s.hydrophobic_contacts)
        if hasattr(s, "water_bridges"): add_group("WaterBridges", s.water_bridges)
        if hasattr(s, "pi_stackings"): add_group("PiStackings", s.pi_stackings)
        if hasattr(s, "pi_cation"): add_group("PiCation", s.pi_cation)
        if hasattr(s, "halogen_bonds"): add_group("HalogenBonds", s.halogen_bonds)
        if hasattr(s, "salt_bridges"): add_group("SaltBridges", s.salt_bridges)
        if hasattr(s, "metal_complexes"): add_group("MetalComplexes", s.metal_complexes)
    tree = ET.ElementTree(root)
    tree.write(outpath, encoding="utf-8", xml_declaration=True)
    return outpath

def write_rst_summary(complex_obj, outpath: str) -> str:
    lines = []
    for idx, s in enumerate(complex_obj.interaction_sets):
        lines.append(f"Interaction set {idx+1}")
        lines.append("-"*40)
        counts = {}
        for attr in ["hbonds","hydrophobic_contacts","water_bridges","pi_stackings","pi_cation","halogen_bonds","salt_bridges","metal_complexes"]:
            counts[attr] = len(getattr(s, attr)) if hasattr(s, attr) else 0
        for k,v in counts.items():
            lines.append(f"{k}: {v}")
        lines.append("")
    with open(outpath, "w", encoding="utf-8") as rf:
        rf.write("\n".join(lines))
    return outpath

def generate_pymol_session_and_png(combined_pdb: str, outdir: str, prefix: str) -> Dict[str, Optional[str]]:
    os.makedirs(outdir, exist_ok=True)
    script_path = os.path.join(outdir, f"pymol_render_{prefix}.pml")
    pse_path = os.path.join(outdir, f"plip_{prefix}.pse")
    png_path = os.path.join(outdir, f"plip_{prefix}.png")

    script_lines = [
        f"load {combined_pdb}",
        "hide everything",
        "as cartoon, polymer",
        # ligand selection heuristic: hetatm and not water and not polymer
        "select ligand_sel, (hetatm and not resn HOH and not polymer)",
        "show sticks, ligand_sel",
        "select protein_sel, polymer",
        "color slate, protein_sel",
        "select water_sel, resn HOH or resn WAT",
        "show spheres, water_sel",
        "select metal_sel, (elem ZN+ or elem FE+ or elem CA+ or elem MG+ or elem MN+ or elem NA+ or elem K+)",
        "show spheres, metal_sel",
        "color yellow, metal_sel",
        "color orange, ligand_sel",
        "show surface, protein_sel",
        "zoom ligand_sel, 8",
        f"save {pse_path}",
        f"png {png_path}, dpi=150, ray=1",
        "quit"
    ]
    with open(script_path, "w", encoding="utf-8") as sf:
        sf.write("\n".join(script_lines))

    rc, out, err = run_cmd(["pymol", "-cq", script_path])
    log = f"rc={rc}\nstdout:\n{out}\nstderr:\n{err}"
    return {"script": script_path, "pse": pse_path if os.path.exists(pse_path) else None, "png": png_path if os.path.exists(png_path) else None, "log": log}

# ---------------------------------------------------------
# Main PLIP endpoint (multi-pose pipeline)
# ---------------------------------------------------------
@router.post("/plip")
async def plip_convert_merge_and_run(
    receptor_path: Optional[str] = Form(None),
    receptor_file: Optional[UploadFile] = File(None),
    ligand_path: Optional[str] = Form(None),
    ligand_file: Optional[UploadFile] = File(None),
    output_folder: Optional[str] = Form(None),

    # preprocessing options
    remove_waters: bool = Form(False),
    remove_ions: bool = Form(False),
    add_hydrogens: bool = Form(False),
    keep_hetero: bool = Form(True),

    # outputs
    return_diagram: bool = Form(True),
    return_json: bool = Form(True),
    return_summary: bool = Form(True),
    return_raw: bool = Form(False),
):
    """
    Multi-pose PLIP pipeline (production-grade).
    - Splits ligand.pdbqt into poses (split_poses/)
    - Converts receptor & each ligand pose to PDB using obabel
    - Merges receptor+ligand_pose -> complex.pdb
    - Cleans & renumbers combined PDB -> complex_cleaned.pdb (keeps both files)
    - Runs PLIP on the cleaned file per pose, exports many formats
    - Keeps split_poses and original uploaded files in output
    """

    # configuration
    MAX_POSES = 20  # analyze up to 20 poses
    keep_split_poses = True
    keep_originals = True

    # ensure PLIP import available
    try:
        from plip.structure.preparation import PDBComplex
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PLIP import failed: {e}")

    # detect optional visualization helpers
    Visualizer = None
    draw_complex = None
    try:
        from plip.exchange.report import Visualizer as _Viz
        Visualizer = _Viz
    except Exception:
        try:
            from plip.visualization.plipvis import draw_complex as _draw
            draw_complex = _draw
        except Exception:
            Visualizer = None
            draw_complex = None

    # validate inputs
    if receptor_file is None and not receptor_path:
        raise HTTPException(status_code=400, detail="Provide receptor_path or upload receptor_file.")
    if ligand_file is None and not ligand_path:
        raise HTTPException(status_code=400, detail="Provide ligand_path or upload ligand_file.")
    if not output_folder:
        raise HTTPException(status_code=400, detail="Provide output_folder (absolute)")

    # job dirs
    job = uuid.uuid4().hex[:8]
    base_out_dir = os.path.join(os.path.abspath(output_folder), f"plip_{job}")
    os.makedirs(base_out_dir, exist_ok=True)
    workdir = os.path.join(tempfile.gettempdir(), f"plip_work_{job}")
    os.makedirs(workdir, exist_ok=True)

    # helper to fetch input files to workdir
    def prepare_input(file_upload: Optional[UploadFile], path_provided: Optional[str], role: str) -> str:
        if file_upload:
            return save_upload(file_upload, workdir)
        if path_provided:
            if not os.path.isfile(path_provided):
                raise HTTPException(status_code=400, detail=f"{role} path does not exist: {path_provided}")
            dest = os.path.join(workdir, os.path.basename(path_provided))
            shutil.copyfile(path_provided, dest)
            return dest
        raise HTTPException(status_code=400, detail=f"{role} missing")

    # helper: clean & renumber combined pdb (keeps mapping and CONECTs)
    def clean_and_renumber_pdb(in_pdb: str, out_dir: str) -> str:
        """
        Create a cleaned, re-numbered copy of in_pdb in out_dir.
        - Renumber atom serials sequentially starting at 1
        - Renumber residue sequence numbers per chain starting at 1
        - Update CONECT records to refer to new atom serials
        Returns path to cleaned pdb (complex_cleaned.pdb).
        """
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, f"{Path(in_pdb).stem}_cleaned.pdb")

        atom_lines = []         # original atom/hetatm lines
        other_lines = []        # header/comment/remark/ter/end etc (non-CONNECT)
        conect_lines = []

        # Read file and split lines
        with open(in_pdb, "r", encoding="utf-8", errors="ignore") as fh:
            for ln in fh:
                if ln.startswith("ATOM") or ln.startswith("HETATM"):
                    atom_lines.append(ln.rstrip("\n"))
                elif ln.startswith("CONECT"):
                    conect_lines.append(ln.rstrip("\n"))
                else:
                    other_lines.append(ln.rstrip("\n"))

        # Build mapping old_atom_index -> new_atom_index
        old_to_new = {}
        new_atom_lines = []
        new_idx = 1

        for ln in atom_lines:
            old_serial = None
            # try fixed column parse first
            try:
                old_serial = int(ln[6:11].strip())
            except Exception:
                # fallback: second token in split
                parts = ln.split()
                if len(parts) >= 2:
                    try:
                        old_serial = int(parts[1])
                    except Exception:
                        old_serial = None
            if old_serial is None:
                old_serial = new_idx  # assign if unparsable

            # store mapping
            if old_serial in old_to_new:
                # collision: continue assigning unique new index anyway
                pass
            old_to_new[old_serial] = new_idx

            # replace atom serial in columns 7-11 (1-based) -> slice 6:11
            prefix = ln[:6]
            suffix = ln[11:] if len(ln) > 11 else ""
            new_serial_str = f"{new_idx:5d}"
            new_ln = f"{prefix}{new_serial_str}{suffix}"
            new_atom_lines.append(new_ln)
            new_idx += 1

        # Renumber residues per chain (chain id col at index 21, resSeq 22:26)
        res_map = {}
        new_res_counter = {}
        final_atom_lines = []
        for ln in new_atom_lines:
            try:
                chain = ln[21] if len(ln) > 21 else " "
                old_resseq_str = ln[22:26].strip()
                old_icode = ln[26:27] if len(ln) > 26 else " "
                old_reskey = (chain, old_resseq_str, old_icode)
            except Exception:
                chain = " "
                old_reskey = (chain, None, None)

            if old_reskey not in res_map:
                new_resnum = new_res_counter.get(chain, 0) + 1
                res_map[old_reskey] = new_resnum
                new_res_counter[chain] = new_resnum
            else:
                new_resnum = res_map[old_reskey]

            before = ln[:22]
            after = ln[26:]
            new_res_str = f"{new_resnum:4d}"
            ln2 = before + new_res_str + after
            final_atom_lines.append(ln2)

        # Update CONECT lines using old_to_new mapping
        new_conect = []
        for cl in conect_lines:
            parts = cl.split()
            if len(parts) < 2:
                continue
            updated = ["CONECT"]
            for token in parts[1:]:
                try:
                    old_idx = int(token)
                    new_idx_map = old_to_new.get(old_idx)
                    if new_idx_map is not None:
                        updated.append(str(new_idx_map))
                    else:
                        # skip references we can't map
                        continue
                except Exception:
                    continue
            if len(updated) > 1:
                new_conect.append(" ".join(updated))

        # Compose final cleaned pdb: header/other_lines (excluding old CONECTs), atoms, TER, CONECTs, END
        with open(out_path, "w", encoding="utf-8") as wf:
            for ln in other_lines:
                if ln.startswith("CONECT"):
                    continue
                wf.write(ln + "\n")
            for ln in final_atom_lines:
                wf.write(ln + "\n")
            # ensure TER before CONECTs for clarity
            wf.write("TER\n")
            for cl in new_conect:
                wf.write(cl + "\n")
            wf.write("END\n")

        return out_path

    # prepare inputs
    try:
        rec_src = prepare_input(receptor_file, receptor_path, "receptor")
        lig_src = prepare_input(ligand_file, ligand_path, "ligand")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to prepare inputs: {e}")

    # copy originals into outdir if requested
    if keep_originals:
        try:
            orig_dir = os.path.join(base_out_dir, "originals")
            os.makedirs(orig_dir, exist_ok=True)
            shutil.copyfile(rec_src, os.path.join(orig_dir, os.path.basename(rec_src)))
            shutil.copyfile(lig_src, os.path.join(orig_dir, os.path.basename(lig_src)))
        except Exception as e:
            with open(os.path.join(base_out_dir, "log.txt"), "a", encoding="utf-8") as lf:
                lf.write(f"Warning: failed to copy originals: {e}\n")

    # split ligand poses
    split_dir = os.path.join(base_out_dir, "split_poses")
    try:
        split_files = split_pdbqt_models(lig_src, split_dir)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to split ligand PDBQT: {e}")

    total_poses = len(split_files)
    processed_count = min(total_poses, MAX_POSES)
    processed_files = split_files[:processed_count]

    # receptor conversion (if needed)
    def safe_convert_receptor_to_pdb(src: str) -> str:
        ext = Path(src).suffix.lower()
        if ext == ".pdb":
            return src
        dst = os.path.join(workdir, f"{Path(src).stem}_receptor_converted.pdb")
        ok, log = obabel_convert(src, dst, extra_args=["--unique"])
        if not ok:
            ok2, log2 = obabel_convert(src, dst, extra_args=[])
            if not ok2:
                raise RuntimeError(f"Receptor conversion failed. obabel logs:\n{log}\n{log2}")
        return dst

    def convert_lig_pose_to_pdb(src: str, dst: str) -> None:
        ok, log = obabel_convert(src, dst, extra_args=["-h", "--gen3d", "--unique", "--partialcharge", "gasteiger"])
        if not ok:
            ok2, log2 = obabel_convert(src, dst, extra_args=["-h", "--gen3d"])
            if not ok2:
                raise RuntimeError(f"Ligand pose conversion failed. obabel logs:\n{log}\n{log2}")

    try:
        rec_pdb = safe_convert_receptor_to_pdb(rec_src)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Receptor conversion error: {e}")

    # manifest and results
    manifest = {
        "job": job,
        "total_ligand_models": total_poses,
        "processed_poses": processed_count,
        "pose_folders": []
    }
    poses_info = []

    # process poses
    for idx, pose_path in enumerate(processed_files, start=1):
        pose_name = f"pose_{idx}"
        pose_dir = os.path.join(base_out_dir, pose_name)
        os.makedirs(pose_dir, exist_ok=True)

        log_lines = []
        try:
            # copy pose to working dir
            pose_work = os.path.join(workdir, f"{Path(pose_path).stem}.pdbqt")
            shutil.copyfile(pose_path, pose_work)

            # convert ligand pose to pdb
            lig_pdb = os.path.join(pose_dir, f"{Path(pose_path).stem}.pdb")
            convert_lig_pose_to_pdb(pose_work, lig_pdb)
            log_lines.append(f"Ligand converted -> {lig_pdb}")

            # merge receptor + ligand into complex.pdb
            complex_pdb = os.path.join(pose_dir, "complex.pdb")
            merge_receptor_and_ligand(rec_pdb, lig_pdb, complex_pdb)
            log_lines.append(f"Complex written -> {complex_pdb}")

            # CLEAN & RENORMALIZE: produce complex_cleaned.pdb in pose_dir
            try:
                combined_clean = clean_and_renumber_pdb(complex_pdb, pose_dir)
                log_lines.append(f"Combined PDB cleaned -> {combined_clean}")
            except Exception as e:
                raise RuntimeError(f"Failed to clean/renumber combined PDB: {e}")

            # Run PLIP on the cleaned combined PDB
            try:
                complex_obj = PDBComplex()
                complex_obj.load_pdb(combined_clean)
                complex_obj.analyze()
                log_lines.append("PLIP analysis complete.")
            except SystemExit:
                raise RuntimeError("PLIP failed to parse combined_cleaned.pdb (SystemExit).")
            except Exception as e:
                raise RuntimeError(f"PLIP analysis failed after cleaning: {e}")

            # build outputs (prefix and write files)
            prefix = f"{Path(rec_src).stem}_{Path(pose_path).stem}_{job}"

            # JSON
            json_path = None
            if return_json:
                try:
                    all_sets = [s.to_dict() for s in complex_obj.interaction_sets]
                    json_path = os.path.join(pose_dir, f"plip_results_{prefix}.json")
                    with open(json_path, "w", encoding="utf-8") as jf:
                        json.dump(all_sets, jf, indent=2)
                    log_lines.append(f"JSON saved -> {json_path}")
                except Exception as e:
                    log_lines.append(f"JSON export error: {e}")
                    json_path = None

            # Diagram
            diagram_path = None
            if return_diagram:
                try:
                    diagram_path = os.path.join(pose_dir, f"plip_diagram_{prefix}.png")
                    if Visualizer is not None and len(complex_obj.interaction_sets) > 0:
                        vis = Visualizer(complex_obj.interaction_sets[0])
                        vis.plot(interactive=False, outfile=diagram_path)
                    elif draw_complex is not None and len(complex_obj.interaction_sets) > 0:
                        try:
                            draw_complex(complex_obj.interaction_sets[0], outfile=diagram_path)
                        except TypeError:
                            draw_complex(complex_obj.interaction_sets[0])
                    if os.path.exists(diagram_path):
                        log_lines.append(f"Diagram created -> {diagram_path}")
                    else:
                        log_lines.append("Diagram generation produced no file.")
                        diagram_path = None
                except Exception as e:
                    log_lines.append(f"Diagram error: {e}")
                    diagram_path = None

            # Summary/RST/TXT
            rst_path = None
            try:
                rst_path = os.path.join(pose_dir, f"plip_{prefix}.rst")
                write_rst_summary(complex_obj, rst_path)
                log_lines.append(f"RST summary -> {rst_path}")
            except Exception as e:
                log_lines.append(f"RST write error: {e}")
                rst_path = None

            # XML
            xml_path = None
            try:
                xml_path = os.path.join(pose_dir, f"plip_{prefix}.xml")
                write_xml_export(complex_obj, xml_path)
                log_lines.append(f"XML -> {xml_path}")
            except Exception as e:
                log_lines.append(f"XML error: {e}")
                xml_path = None

            # CSVs
            try:
                csv_info = write_interaction_csvs(complex_obj, pose_dir, prefix)
                log_lines.append(f"CSV exports -> {csv_info.get('combined_csv')}")
            except Exception as e:
                log_lines.append(f"CSV export error: {e}")
                csv_info = {"combined_csv": None, "per_type": []}

            # PyMOL session & PNG (best-effort) - using cleaned pdb for visualization
            try:
                pymol_info = generate_pymol_session_and_png(combined_clean, pose_dir, prefix)
                log_lines.append(f"PyMOL script -> {pymol_info.get('script')}, pse -> {pymol_info.get('pse')}, png -> {pymol_info.get('png')}")
            except Exception as e:
                log_lines.append(f"PyMOL error: {e}")
                pymol_info = {"script": None, "pse": None, "png": None, "log": ""}

            # raw dump
            raw_path = None
            if return_raw:
                try:
                    raw_path = os.path.join(pose_dir, f"plip_raw_{prefix}.txt")
                    with open(raw_path, "w", encoding="utf-8") as rf:
                        rf.write(str(complex_obj))
                    log_lines.append(f"Raw -> {raw_path}")
                except Exception as e:
                    log_lines.append(f"Raw write error: {e}")
                    raw_path = None

            # copy ligand & receptor used (for traceability)
            try:
                shutil.copyfile(lig_pdb, os.path.join(pose_dir, os.path.basename(lig_pdb)))
                shutil.copyfile(rec_pdb, os.path.join(pose_dir, os.path.basename(rec_pdb)))
            except Exception:
                pass

            # collect results for manifest
            pose_result = {
                "pose": idx,
                "folder": pose_dir,
                "complex_pdb": complex_pdb,
                "complex_cleaned": combined_clean,
                "ligand_pdb": lig_pdb,
                "receptor_pdb": rec_pdb,
                "json": json_path,
                "diagram": diagram_path,
                "rst": rst_path,
                "xml": xml_path,
                "csv_combined": csv_info.get("combined_csv"),
                "csv_per_type": csv_info.get("per_type"),
                "pymol_pse": pymol_info.get("pse"),
                "pymol_png": pymol_info.get("png"),
                "pymol_script": pymol_info.get("script"),
                "raw": raw_path,
            }
            poses_info.append(pose_result)

        except Exception as e:
            pose_result = {"pose": idx, "folder": pose_dir, "error": str(e)}
            poses_info.append(pose_result)
            log_lines.append(f"Pose processing error: {e}")

        # write per-pose log
        try:
            with open(os.path.join(pose_dir, "log.txt"), "w", encoding="utf-8") as lf:
                lf.write("\n".join(log_lines))
        except Exception:
            pass

        manifest["pose_folders"].append(pose_name)

    # write manifest.json
    manifest_path = os.path.join(base_out_dir, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as mf:
        json.dump(manifest, mf, indent=2)

    # optionally remove split poses if not requested
    if not keep_split_poses:
        try:
            shutil.rmtree(split_dir)
        except Exception:
            pass

    # response to frontend
    resp = {
        "job": job,
        "outdir": base_out_dir,
        "manifest": manifest_path,
        "processed_count": processed_count,
        "poses": poses_info,
    }

    return JSONResponse(resp)
