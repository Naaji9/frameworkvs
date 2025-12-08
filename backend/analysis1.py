# backend/api/analysis.py


import os
import uuid
import json
import tempfile
import subprocess
import shutil
import csv
import xml.etree.ElementTree as ET
import yaml
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
# UNIVERSAL CONVERTER
# ---------------------------------------------------------
def which_exists(cmdname: str) -> bool:
    return shutil.which(cmdname) is not None


# ---------------------------------------------------------
# RECEPTOR PREPARATION WITH TOOL TRACKING
# ---------------------------------------------------------
def prepare_receptor_for_pdbqt(src: str, dst: str, workdir: Optional[str] = None) -> Tuple[bool,str,str]:
    """
    Returns (ok, log, tool_used)
    """
    logs = []
    tool_used = None

    tmp_clean = os.path.join(
        workdir or tempfile.gettempdir(),
        f"{Path(src).stem}_receptor.cleaned.pdb"
    )

    # 1) obabel clean
    cmd_obabel = [
        "obabel", src, "-O", tmp_clean,
        "-h",
        "--delete", "HOH",
        "--protein",
    ]
    rc, out, err = run_cmd(cmd_obabel)
    logs.append(" ".join(cmd_obabel))
    logs.append(out or ""); logs.append(err or "")

    if rc != 0 or not os.path.exists(tmp_clean):
        # fallback copy
        tmp_clean = os.path.join(
            workdir or tempfile.gettempdir(),
            f"{Path(src).stem}_receptor.fallback.pdb"
        )
        try:
            shutil.copyfile(src, tmp_clean)
            logs.append(f"obabel clean failed (rc={rc}); using original file.")
        except Exception as e:
            return False, "\n".join(logs + [f"fallback copy error: {e}"]), None

    # 2) AutoDockTools preferred
    if which_exists("prepare_receptor4.py"):
        cmd_adt = ["prepare_receptor4.py", "-r", tmp_clean, "-o", dst, "-A", "hydrogens"]
        rc2, out2, err2 = run_cmd(cmd_adt)
        logs.append(" ".join(cmd_adt))
        logs.append(out2 or ""); logs.append(err2 or "")

        if rc2 == 0 and os.path.exists(dst):
            tool_used = "AutoDockTools (prepare_receptor4.py)"
            return True, "\n".join(logs), tool_used
        else:
            logs.append(f"prepare_receptor4.py failed (rc={rc2})")
    else:
        logs.append("prepare_receptor4.py NOT found: using OpenBabel fallback")

    # 3) fallback openbabel
    cmd_fallback = ["obabel", tmp_clean, "-O", dst, "--partialcharge", "gasteiger", "-h"]
    rc3, out3, err3 = run_cmd(cmd_fallback)

    logs.append(" ".join(cmd_fallback))
    logs.append(out3 or ""); logs.append(err3 or "")

    if rc3 == 0 and os.path.exists(dst):
        tool_used = "OpenBabel (fallback)"
        return True, "\n".join(logs), tool_used

    return False, "\n".join(logs), None



# ---------------------------------------------------------
# LIGAND PREPARATION WITH TOOL TRACKING
# ---------------------------------------------------------
def prepare_ligand_for_pdbqt(src: str, dst: str, workdir: Optional[str] = None) -> Tuple[bool,str,str]:
    """
    Returns (ok, log, tool_used)
    """
    logs = []
    tool_used = None

    tmp_3d = os.path.join(
        workdir or tempfile.gettempdir(),
        f"{Path(src).stem}_ligand.3d.sdf"
    )

    # 1) obabel 3D
    cmd3d = ["obabel", src, "-O", tmp_3d, "--gen3d", "--separate", "-h"]
    rc, out, err = run_cmd(cmd3d)
    logs.append(" ".join(cmd3d))
    logs.append(out or ""); logs.append(err or "")

    # 2) AutoDockTools preferred
    if which_exists("prepare_ligand4.py"):
        cmd_adt = ["prepare_ligand4.py", "-l", tmp_3d, "-o", dst, "-A", "hydrogens"]
        rc2, out2, err2 = run_cmd(cmd_adt)

        logs.append(" ".join(cmd_adt))
        logs.append(out2 or ""); logs.append(err2 or "")

        if rc2 == 0 and os.path.exists(dst):
            tool_used = "AutoDockTools (prepare_ligand4.py)"
            return True, "\n".join(logs), tool_used
        else:
            logs.append(f"prepare_ligand4.py failed (rc={rc2})")
    else:
        logs.append("prepare_ligand4.py NOT found: using OpenBabel fallback")

    # 3) fallback openbabel
    cmd_fallback = [
        "obabel", tmp_3d, "-O", dst,
        "--partialcharge", "gasteiger", "-h", "--gen3d"
    ]
    rc3, out3, err3 = run_cmd(cmd_fallback)

    logs.append(" ".join(cmd_fallback))
    logs.append(out3 or ""); logs.append(err3 or "")

    if rc3 == 0 and os.path.exists(dst):
        tool_used = "OpenBabel (fallback)"
        return True, "\n".join(logs), tool_used

    return False, "\n".join(logs), None



# ---------------------------------------------------------
# ENHANCED convert_any
# ---------------------------------------------------------
def convert_any(in_path: str, out_path: str, role: Optional[str] = None) -> Tuple[bool,str,str]:
    """
    Returns (ok, log, tool_used)
    """
    out_fmt = Path(out_path).suffix.lstrip(".").lower()

    # pdbqt → use special pipeline
    if out_fmt == "pdbqt":
        workdir = os.path.dirname(out_path) or tempfile.gettempdir()
        try:
            if role == "receptor":
                ok, log, tool_used = prepare_receptor_for_pdbqt(in_path, out_path, workdir)
                return ok, log, tool_used
            else:
                ok, log, tool_used = prepare_ligand_for_pdbqt(in_path, out_path, workdir)
                return ok, log, tool_used
        except Exception as e:
            return False, f"PDBQT prep exception: {e}", None

    # generic obabel conversion
    in_fmt = Path(in_path).suffix.lstrip(".").lower()
    cmd = ["obabel", f"-i{in_fmt}", in_path, f"-o{out_fmt}", "-O", out_path, "--unique", "-h"]

    rc, out, err = run_cmd(cmd)
    log = (out or "") + "\n" + (err or "")

    if rc != 0 or not os.path.exists(out_path):
        return False, log, "OpenBabel"

    return True, log, "OpenBabel"



# ---------------------------------------------------------
# /convert ENDPOINT
# ---------------------------------------------------------
@router.post("/convert")
async def api_convert(
    file: UploadFile = File(...),
    outputFormat: str = Form(...),
    outputFolder: str = Form(...),
    type: str = Form("ligand")
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

    ok, log, tool_used = convert_any(in_path, out_path, role=type)

    if not ok:
        raise HTTPException(500, f"Conversion failed:\n{log}")

    return {
        "status": "ok",
        "tool_used": tool_used,
        "input": in_path,
        "output": out_path,
        "log": log
    }



# ---------------------------------------------------------
# /convert-folder ENDPOINT
# ---------------------------------------------------------
@router.post("/convert-folder")
async def api_convert_folder(
    outputFormat: str = Form(...),
    outputFolder: str = Form(...),
    inputFolder: Optional[str] = Form(None),
    files: Optional[List[UploadFile]] = File(None),
    type: str = Form("ligand")
):
    outputFormat = outputFormat.lower().strip()
    type = (type or "ligand").lower().strip()

    allowed = ["pdb", "pdbqt", "mol2", "sdf", "cif"]
    if outputFormat not in allowed:
        raise HTTPException(400, f"Invalid output format: {outputFormat}")

    os.makedirs(outputFolder, exist_ok=True)

    converted = []
    failed = []

    if files:
        temp = tempfile.mkdtemp()
        try:
            for uf in files:
                src = save_upload(uf, temp)
                base = Path(uf.filename).stem
                out_path = os.path.join(outputFolder, f"{base}.{outputFormat}")

                ok, log, tool_used = convert_any(src, out_path, role=type)

                if ok:
                    converted.append({
                        "file": out_path,
                        "tool_used": tool_used
                    })
                else:
                    failed.append({"file": uf.filename, "error": log})
        finally:
            shutil.rmtree(temp, ignore_errors=True)

    else:
        if not inputFolder or not os.path.isdir(inputFolder):
            raise HTTPException(400, "Invalid or missing inputFolder")

        for fname in os.listdir(inputFolder):
            src = os.path.join(inputFolder, fname)
            if not os.path.isfile(src):
                continue

            base = Path(fname).stem
            out_path = os.path.join(outputFolder, f"{base}.{outputFormat}")

            ok, log, tool_used = convert_any(src, out_path, role=type)

            if ok:
                converted.append({
                    "file": out_path,
                    "tool_used": tool_used
                })
            else:
                failed.append({"file": fname, "error": log})

    return {
        "status": "ok",
        "converted": converted,
        "failed": failed
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
def serve_file(path: Optional[str] = None, folder: Optional[str] = None, name: Optional[str] = None):
    """
    Serve a file by either:
      - full `path`, or
      - `folder` + `name`
    At least one of the above must be provided.
    """
    if path:
        full = path
    elif folder and name:
        full = os.path.join(folder, name)
    else:
        raise HTTPException(400, "Provide either 'path' or both 'folder' and 'name' query parameters")

    if not os.path.exists(full):
        raise HTTPException(404, "File not found")

    return FileResponse(
        full,
        filename=os.path.basename(full),
        media_type="application/octet-stream"
    )


# ---------------------------------------------------------
# Utility: Run subprocess (wrapped)
# ---------------------------------------------------------
def run_cmd(cmd: List[str], cwd: Optional[str] = None, env: Optional[dict] = None) -> Tuple[int, str, str]:
    """
    Runs a subprocess command and returns (rc, stdout, stderr) as strings.
    """
    try:
        completed = subprocess.run(cmd, text=True, capture_output=True, check=False, cwd=cwd, env=env)
        return completed.returncode, (completed.stdout or ""), (completed.stderr or "")
    except Exception as e:
        return 999, "", str(e)


# ---------------------------------------------------------
# File format helpers (OpenBabel-based)
# ---------------------------------------------------------
def obabel_convert(src: str, dst: str, extra_args: Optional[List[str]] = None) -> Tuple[bool, str]:
    """
    Convert src → dst using OpenBabel.
    Returns (ok, log) and ensures file exists + has atoms.
    """
    extra_args = extra_args or []
    fmt_in = Path(src).suffix.lower().lstrip(".")
    fmt_out = Path(dst).suffix.lower().lstrip(".")

    cmd = ["obabel", f"-i{fmt_in}", src, f"-o{fmt_out}", "-O", dst] + extra_args
    rc, out, err = run_cmd(cmd)

    log = (out or "") + "\n" + (err or "")

    # conversion failure
    if rc != 0 or not os.path.exists(dst):
        return False, f"OpenBabel failed (rc={rc})\n{log}"

    # sanity: must have atoms
    with open(dst, "r", encoding="utf-8", errors="ignore") as fh:
        txt = fh.read()

    if "ATOM" not in txt and "HETATM" not in txt:
        return False, f"Output file contains no atoms:\n{log}"

    return True, log

def convert_lig_pose_to_pdb(src: str, dst: str) -> None:
    """
    Convert ligand pose (PDBQT or PDB) to PDB.
    Prefer preserving coordinates: -xr
    If fails → fallback to basic conversion (no gen3D).
    """
    ok, log = obabel_convert(src, dst, extra_args=["-xr"])
    if not ok or os.path.getsize(dst) < 20:
        ok2, log2 = obabel_convert(src, dst)
        if not ok2 or os.path.getsize(dst) < 20:
            raise RuntimeError(f"Ligand conversion failed:\n{log}\n{log2}")

    with open(dst, "r", encoding="utf-8", errors="ignore") as fh:
        txt = fh.read()

    if "ATOM" not in txt and "HETATM" not in txt:
        raise RuntimeError("Ligand conversion produced no atomic records.")

# ---------------------------------------------------------
# PDBQT multi-model splitting
# ---------------------------------------------------------
def split_pdbqt_models(src_pdbqt: str, out_dir: str) -> List[str]:
    """
    Split multi-model PDBQT using MODEL/ENDMDL.
    Supports files without MODEL → create 1 pose.
    Ensures final model is written.
    """
    os.makedirs(out_dir, exist_ok=True)
    produced = []

    with open(src_pdbqt, "r", encoding="utf-8", errors="ignore") as fh:
        lines = fh.readlines()

    current = []
    header = []
    model_idx = 0
    in_model = False
    saw_model = False

    for ln in lines:
        u = ln.strip().upper()

        if u.startswith("MODEL"):
            if in_model and current:
                model_idx += 1
                out = os.path.join(out_dir, f"{Path(src_pdbqt).stem}_pose_{model_idx}.pdbqt")
                with open(out, "w") as wf:
                    wf.writelines(header + current + ["ENDMDL\n"])
                produced.append(out)
                current = []
            in_model = True
            saw_model = True
            continue

        if u.startswith("ENDMDL"):
            if in_model and current:
                model_idx += 1
                out = os.path.join(out_dir, f"{Path(src_pdbqt).stem}_pose_{model_idx}.pdbqt")
                with open(out, "w") as wf:
                    wf.writelines(header + current + ["ENDMDL\n"])
                produced.append(out)
                current = []
            in_model = False
            continue

        if not saw_model:
            header.append(ln)
        else:
            if in_model:
                current.append(ln)

    # last model
    if in_model and current:
        model_idx += 1
        out = os.path.join(out_dir, f"{Path(src_pdbqt).stem}_pose_{model_idx}.pdbqt")
        with open(out, "w") as wf:
            wf.writelines(header + current + ["ENDMDL\n"])
        produced.append(out)

    # no MODEL → single pose
    if not produced:
        single = os.path.join(out_dir, f"{Path(src_pdbqt).stem}_pose_1.pdbqt")
        shutil.copyfile(src_pdbqt, single)
        produced = [single]

    return produced

def ensure_ligand_chain_and_hetatm(ligand_pdb: str, desired_chain: Optional[str] = None) -> None:
    """
    Convert ligand atoms to HETATM and assign a unique chain ID.
    Does NOT renumber residues — avoids PLIP mismatches.
    """
    with open(ligand_pdb, "r", encoding="utf-8", errors="ignore") as fh:
        lines = [ln.rstrip("\n") for ln in fh]

    existing_chains = set()
    for ln in lines:
        if (ln.startswith("ATOM") or ln.startswith("HETATM")) and len(ln) >= 22:
            existing_chains.add(ln[21])

    import string
    if desired_chain:
        chain = desired_chain
    else:
        chain = "L" if "L" not in existing_chains else next((c for c in string.ascii_uppercase if c not in existing_chains), "L")

    result = []
    for ln in lines:
        if ln.startswith("ATOM") or ln.startswith("HETATM"):
            if len(ln) < 22:
                result.append(ln)
                continue

            rest = ln[6:]
            new_ln = "HETATM" + rest
            new_ln = new_ln[:21] + chain + new_ln[22:]
            if len(new_ln) < 80:
                new_ln = new_ln.ljust(80)
            result.append(new_ln)
        else:
            result.append(ln)

    with open(ligand_pdb, "w", encoding="utf-8") as wf:
        wf.write("\n".join(result) + "\n")


# ---------------------------------------------------------
# Simple PDB merger (receptor + ligand)
# ---------------------------------------------------------
def merge_receptor_and_ligand(receptor_pdb: str, ligand_pdb: str, out_path: str, ligand_chain_preferred="L") -> None:
    """
    Merge receptor + ligand into one complex PDB.
    Safe for PLIP — no residue renumbering.
    """
    def read_atoms(path):
        with open(path, "r", encoding="utf-8", errors="ignore") as fh:
            return [ln.rstrip("\n") for ln in fh if not ln.startswith(("MODEL","ENDMDL","END"))]

    receptor_chains = set()
    with open(receptor_pdb, "r", encoding="utf-8", errors="ignore") as fh:
        for ln in fh:
            if (ln.startswith("ATOM") or ln.startswith("HETATM")) and len(ln) > 21:
                receptor_chains.add(ln[21])

    import string
    available = [c for c in string.ascii_uppercase if c not in receptor_chains]
    lig_chain = ligand_chain_preferred if ligand_chain_preferred in available else available[0]

    rec = read_atoms(receptor_pdb)
    lig = read_atoms(ligand_pdb)

    with open(out_path, "w", encoding="utf-8") as out:
        for ln in rec:
            out.write(ln + "\n")
        out.write("TER\n")

        for ln in lig:
            if ln.startswith("ATOM") or ln.startswith("HETATM"):
                rest = ln[6:] if len(ln) > 6 else ""
                new_ln = "HETATM" + rest
                if len(new_ln) >= 22:
                    new_ln = new_ln[:21] + lig_chain + new_ln[22:]
                if len(new_ln) < 80:
                    new_ln = new_ln.ljust(80)
                out.write(new_ln + "\n")
            else:
                out.write(ln + "\n")

        out.write("END\n")

def sanitize_coordinates(line: str) -> Optional[str]:
    if not (line.startswith("ATOM") or line.startswith("HETATM")):
        return line
    
    # invalid format line (very common in docking)
    if len(line) < 55:
        return None

    try:
        x = float(line[30:38].strip())
        y = float(line[38:46].strip())
        z = float(line[46:54].strip())
    except:
        return None

    import math
    if any(math.isnan(v) or math.isinf(v) for v in (x, y, z)):
        return None

    # clamp absurd
    if abs(x) > 500 or abs(y) > 500 or abs(z) > 500:
        return None

    return line



# ---------------------------------------------------------
# PDB cleaning
# ---------------------------------------------------------
def minimal_clean_pdb(in_pdb: str, out_dir: str) -> str:
    """
    Clean up a merged PDB for PLIP:
    - Drop MODEL/ENDMDL sections
    - Drop CONECT lines
    - Sanitize coordinates
    - Preserve residue numbering and chain IDs
    - Ensure final END line
    """
    import os, re
    from pathlib import Path

    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"{Path(in_pdb).stem}_cleaned.pdb")

    cleaned_lines = []
    in_model = False

    with open(in_pdb, "r", encoding="utf-8", errors="ignore") as fh:
        for raw in fh:
            line = raw.rstrip("\n")
            up = line.strip().upper()

            # --------- MODEL block removal ----------
            if up.startswith("MODEL"):
                in_model = True
                continue
            if up.startswith("ENDMDL"):
                in_model = False
                continue
            if in_model:
                continue

            # --------- Remove CONECT ----------
            if up.startswith("CONECT"):
                continue

            # --------- sanitize ATOM/HETATM ----------
            fixed = sanitize_coordinates(line)
            if fixed is None:
                continue

            cleaned_lines.append(fixed)

    # Safety: remove trailing empty lines
    while cleaned_lines and cleaned_lines[-1].strip() == "":
        cleaned_lines.pop()

    # Safety: ensure some valid atoms
    if not any(l.startswith("ATOM") or l.startswith("HETATM") for l in cleaned_lines):
        raise RuntimeError("minimal_clean_pdb: no ATOM/HETATM records remain after cleaning.")

    # Ensure final END
    if not cleaned_lines[-1].upper().startswith("END"):
        cleaned_lines.append("END")

    with open(out_path, "w", encoding="utf-8") as wf:
        for ln in cleaned_lines:
            wf.write(ln + "\n")

    return out_path



# ---------------------------------------------------------
# Export helpers (CSV, XML, RST, PyMOL session)
# ---------------------------------------------------------
def write_interaction_csvs(complex_obj, outdir: str, prefix: str) -> Dict[str, Any]:
    os.makedirs(outdir, exist_ok=True)
    combined_rows = []
    per_type_files = []

    for s_idx, s in enumerate(complex_obj.interaction_sets):
        set_id = s_idx + 1
        ligand_meta = s.ligand if hasattr(s, "ligand") else None

        def ligand_id_str(lig):
            if not lig:
                return ""
            return f"{getattr(lig, 'resname', '')}:{getattr(lig, 'chain', '')}:{getattr(lig, 'resnr', '')}"

        def row_from_interaction(it, itype):
            partner1 = getattr(it, "res1", None) or getattr(it, "partner1", None) or getattr(it, "atom1", None)
            partner2 = getattr(it, "res2", None) or getattr(it, "partner2", None) or getattr(it, "atom2", None)
            dist = getattr(it, "distance", None) or getattr(it, "dist", None) or ""

            p1 = str(partner1)[:250] if partner1 is not None else ""
            p2 = str(partner2)[:250] if partner2 is not None else ""

            return {
                "set": set_id,
                "ligand": ligand_id_str(ligand_meta),
                "type": itype,
                "partner1": p1,
                "partner2": p2,
                "distance": dist,
                "repr": str(it)
            }

        # hydrogen bonds
        for items, name, fname in [
            (getattr(s, "hbonds", []), "hydrogen_bond", f"plip_hbonds_set{set_id}_{prefix}.csv"),
            (getattr(s, "hydrophobic_contacts", []), "hydrophobic", f"plip_hydrophobic_set{set_id}_{prefix}.csv"),
            (getattr(s, "water_bridges", []), "water_bridge", f"plip_waterbridges_set{set_id}_{prefix}.csv"),
            (getattr(s, "pi_stackings", []), "pi_stacking", f"plip_pistacking_set{set_id}_{prefix}.csv"),
            (getattr(s, "pi_cation", []), "pi_cation", f"plip_pication_set{set_id}_{prefix}.csv"),
            (getattr(s, "halogen_bonds", []), "halogen_bond", f"plip_halogen_set{set_id}_{prefix}.csv"),
            (getattr(s, "salt_bridges", []), "salt_bridge", f"plip_saltbridges_set{set_id}_{prefix}.csv"),
            (getattr(s, "metal_complexes", []), "metal_complex", f"plip_metals_set{set_id}_{prefix}.csv"),
        ]:
            rows = [row_from_interaction(i, name) for i in items]
            path = os.path.join(outdir, fname)
            with open(path, "w", newline="") as fh:
                writer = csv.DictWriter(fh, fieldnames=["set", "ligand", "type", "partner1", "partner2", "distance", "repr"])
                writer.writeheader()
                writer.writerows(rows)
            if rows:
                per_type_files.append(path)
                combined_rows.extend(rows)

    # Combined CSV
    comb_path = os.path.join(outdir, f"plip_interactions_{prefix}.csv")
    with open(comb_path, "w", newline="") as fc:
        writer = csv.DictWriter(fc, fieldnames=["set", "ligand", "type", "partner1", "partner2", "distance", "repr"])
        writer.writeheader()
        writer.writerows(combined_rows)

    return {"combined_csv": comb_path, "per_type": per_type_files}

def write_xml_export(complex_obj, outpath: str) -> str:
    root = ET.Element("PLIPAnalysis")
    for s_idx, s in enumerate(complex_obj.interaction_sets):
        set_el = ET.SubElement(root, "InteractionSet", attrib={"index": str(s_idx+1)})
        # add ligand metadata
        lig = getattr(s, "ligand", None)
        if lig:
            ET.SubElement(set_el, "LigandName").text = str(getattr(lig, "resname", ""))
            ET.SubElement(set_el, "LigandChain").text = str(getattr(lig, "chain", ""))
            ET.SubElement(set_el, "LigandResNr").text = str(getattr(lig, "resnr", ""))

        def add_items(name, items):
            grp = ET.SubElement(set_el, name)
            for it in items or []:
                it_el = ET.SubElement(grp, "Interaction")
                ET.SubElement(it_el, "Type").text = name
                ET.SubElement(it_el, "Summary").text = str(it)[:1000]
                # distance
                dist = getattr(it, "distance", None) or getattr(it, "dist", None)
                if dist is not None:
                    ET.SubElement(it_el, "Distance").text = str(dist)
                # partners
                p1 = getattr(it, "res1", None) or getattr(it, "partner1", None) or getattr(it, "atom1", None)
                p2 = getattr(it, "res2", None) or getattr(it, "partner2", None) or getattr(it, "atom2", None)
                if p1 is not None:
                    ET.SubElement(it_el, "Partner1").text = str(p1)
                if p2 is not None:
                    ET.SubElement(it_el, "Partner2").text = str(p2)

        add_items("HydrogenBonds", getattr(s, "hbonds", []))
        add_items("Hydrophobic", getattr(s, "hydrophobic_contacts", []))
        add_items("WaterBridges", getattr(s, "water_bridges", []))
        add_items("PiStackings", getattr(s, "pi_stackings", []))
        add_items("PiCation", getattr(s, "pi_cation", []))
        add_items("HalogenBonds", getattr(s, "halogen_bonds", []))
        add_items("SaltBridges", getattr(s, "salt_bridges", []))
        add_items("MetalComplexes", getattr(s, "metal_complexes", []))

    tree = ET.ElementTree(root)
    tree.write(outpath, encoding="utf-8", xml_declaration=True)
    return outpath



def write_yaml_export(complex_obj, out_path: str):
    data = []
    for s in complex_obj.interaction_sets:
        try:
            d = s.to_dict()
        except Exception:
            d = {"error": "to_dict failed"}
        data.append(d)
    with open(out_path, "w", encoding="utf-8") as f:
        yaml.safe_dump(data, f, sort_keys=False, default_flow_style=False)
    return out_path


def write_rst_summary(complex_obj, outpath: str) -> str:
    lines = []
    for idx, s in enumerate(complex_obj.interaction_sets):
        ligand = getattr(s, "ligand", None)
        lig_label = f"{getattr(ligand,'resname','') or ''}:{getattr(ligand,'chain','') or ''}:{getattr(ligand,'resnr','') or ''}"
        lines.append(f"Interaction set {idx+1} — Ligand {lig_label}")
        lines.append("-"*40)
        for attr in ["hbonds","hydrophobic_contacts","water_bridges","pi_stackings","pi_cation","halogen_bonds","salt_bridges","metal_complexes"]:
            items = getattr(s, attr, []) or []
            lines.append(f"{attr}: {len(items)}")
            for it in items:
                p1 = getattr(it, "res1", None) or getattr(it, "partner1", None) or getattr(it, "atom1", None)
                p2 = getattr(it, "res2", None) or getattr(it, "partner2", None) or getattr(it, "atom2", None)
                lines.append(f"  - {attr}: {str(p1)} -- {str(p2)} (dist: {getattr(it,'distance', getattr(it,'dist', ''))})")
        lines.append("")
    with open(outpath, "w", encoding="utf-8") as rf:
        rf.write("\n".join(lines))
    return outpath


def generate_pymol_session_and_png(pdb_file: str, out_dir: str, prefix: str) -> Dict[str, Optional[str]]:
    """
    Create PyMOL visualization assets safely.
    Will always produce at least:
      - <prefix>.pml (script)

    Attempts:
      - <prefix>.pse (PyMOL session)
      - <prefix>.png (rendered image)

    Does NOT crash if PyMOL has warnings/limits.
    """

    os.makedirs(out_dir, exist_ok=True)

    pml_path  = os.path.join(out_dir, f"{prefix}.pml")
    pse_path  = os.path.join(out_dir, f"{prefix}.pse")
    png_path  = os.path.join(out_dir, f"{prefix}.png")

    # ---------------------------------------------------
    # STEP 1: Write PML script
    # ---------------------------------------------------

    pml = [
        "reinitialize",
        f"load {pdb_file}, complex",
        "hide everything",
        "show cartoon, complex and polymer",
        "show sticks, complex and organic",
        "set ray_trace_fog, 0",
        "set cartoon_transparency, 0.25",
        "bg_color white",
        "zoom complex",
    ]

    with open(pml_path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(pml) + "\n")

    # ---------------------------------------------------
    # STEP 2: Try to generate PNG + PSE
    # ---------------------------------------------------
    # We do a subprocess call so PyMOL errors don't kill Python.
    # ---------------------------------------------------
    try:
        cmd = [
            "pymol",
            "-cq",            # headless + quiet
            "-d", f"run {pml_path}; png '{png_path}', 2000, 2000; save '{pse_path}'; quit;"
        ]
        rc, out, err = run_cmd(cmd)
        log = (out or '') + "\n" + (err or '')

        # Some PyMOL versions return rc=0 but don't produce files → treat as failure
        if not os.path.exists(png_path) or os.path.getsize(png_path) < 200:
            png_path = None
        if not os.path.exists(pse_path) or os.path.getsize(pse_path) < 200:
            pse_path = None

    except Exception as e:
        # Fully safe: never break pipeline
        log = str(e)
        png_path = None
        pse_path = None

    return {
        "script": pml_path,
        "pse": pse_path,
        "png": png_path,
        "log": log,
    }

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

    remove_waters: bool = Form(False),
    remove_ions: bool = Form(False),
    add_hydrogens: bool = Form(False),
    keep_hetero: bool = Form(True),

    return_diagram: bool = Form(True),
    return_json: bool = Form(True),
    return_summary: bool = Form(True),
    return_raw: bool = Form(False),
):
    try:
        from plip.structure.preparation import PDBComplex
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PLIP import failed: {e}")

    # optional visuals
    Visualizer = None
    draw_complex = None
    try:
        from plip.exchange.report import Visualizer as _Viz
        Visualizer = _Viz
    except:
        try:
            from plip.visualization.plipvis import draw_complex as _draw
            draw_complex = _draw
        except:
            Visualizer = None
            draw_complex = None

    if receptor_file is None and not receptor_path:
        raise HTTPException(status_code=400, detail="Provide receptor file or path.")
    if ligand_file is None and not ligand_path:
        raise HTTPException(status_code=400, detail="Provide ligand file or path.")
    if not output_folder:
        raise HTTPException(status_code=400, detail="Provide output_folder (abs path).")

    job = uuid.uuid4().hex[:8]
    base_out_dir = os.path.join(os.path.abspath(output_folder), f"plip_{job}")
    os.makedirs(base_out_dir, exist_ok=True)
    workdir = os.path.join(tempfile.gettempdir(), f"plip_work_{job}")
    os.makedirs(workdir, exist_ok=True)

    def cache_input(upload: Optional[UploadFile], path_value: Optional[str], label: str) -> str:
        if upload:
            return save_upload(upload, workdir)
        if path_value:
            if not os.path.isfile(path_value):
                raise HTTPException(status_code=400, detail=f"{label} path invalid: {path_value}")
            dst = os.path.join(workdir, os.path.basename(path_value))
            shutil.copy(path_value, dst)
            return dst
        raise HTTPException(status_code=400, detail=f"{label} missing")

    try:
        rec_src = cache_input(receptor_file, receptor_path, "receptor")
        lig_src = cache_input(ligand_file, ligand_path, "ligand")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Input preparation failed: {e}")

    # split poses
    split_dir = os.path.join(base_out_dir, "split_poses")
    split_files = split_pdbqt_models(lig_src, split_dir)
    MAX_POSES = 20
    pose_list = split_files[:MAX_POSES]

    # convert receptor
    def safe_convert_receptor(src: str) -> str:
        if src.lower().endswith(".pdb"):
            return src
        dst = os.path.join(workdir, f"{Path(src).stem}_receptor.pdb")
        ok, log = obabel_convert(src, dst, extra_args=["-xr"])
        if not ok:
            ok2, log2 = obabel_convert(src, dst)
            if not ok2:
                raise RuntimeError(f"Receptor conversion failed:\n{log}\n{log2}")
        return dst

    try:
        rec_pdb = safe_convert_receptor(rec_src)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Receptor conversion error: {e}")

    manifest = {"job": job, "total_poses": len(split_files), "processed": len(pose_list), "pose_folders": []}
    pose_results = []

    for idx, pose_path in enumerate(pose_list, start=1):
        pose_name = f"pose_{idx}"
        pose_dir = os.path.join(base_out_dir, pose_name)
        os.makedirs(pose_dir, exist_ok=True)
        logs = []
        try:
            # convert ligand pose
            pose_tmp = os.path.join(workdir, f"{Path(pose_path).stem}.pdbqt")
            shutil.copy(pose_path, pose_tmp)
            lig_pdb = os.path.join(pose_dir, f"{Path(pose_path).stem}.pdb")
            convert_lig_pose_to_pdb(pose_tmp, lig_pdb)
            logs.append(f"Ligand converted -> {lig_pdb}")

            # ensure ligand normalized (merge already forces HETATM but double-check)
            try:
                ensure_ligand_chain_and_hetatm(lig_pdb, desired_chain="L")
            except Exception:
                ensure_ligand_chain_and_hetatm(lig_pdb, desired_chain=None)

            # merge and clean
            complex_pdb = os.path.join(pose_dir, "complex.pdb")
            merge_receptor_and_ligand(rec_pdb, lig_pdb, complex_pdb)
            logs.append(f"Merged -> {complex_pdb}")

            combined_clean = minimal_clean_pdb(complex_pdb, pose_dir)
            logs.append(f"Cleaned -> {combined_clean}")

            # run PLIP
            complex_obj = PDBComplex()
            complex_obj.load_pdb(combined_clean)
            complex_obj.analyze()
            logs.append(f"PLIP sets: {len(complex_obj.interaction_sets)}")

            prefix = f"{Path(rec_src).stem}_{Path(pose_path).stem}_{job}"

            # JSON
            json_path = None
            if return_json:
                json_path = os.path.join(pose_dir, f"plip_results_{prefix}.json")
                with open(json_path, "w", encoding="utf-8") as jf:
                    json.dump([s.to_dict() for s in complex_obj.interaction_sets], jf, indent=2)
                logs.append(f"JSON -> {json_path}")

            # YAML
            try:
                yaml_path = os.path.join(pose_dir, f"plip_{prefix}.yaml")
                write_yaml_export(complex_obj, yaml_path)
                logs.append(f"YAML -> {yaml_path}")
            except Exception as e:
                logs.append(f"YAML error: {e}")
                yaml_path = None

            # Diagram(s)
            diagram_paths = []
            if return_diagram and len(complex_obj.interaction_sets) > 0:
                for s_idx, s in enumerate(complex_obj.interaction_sets):
                    dp = os.path.join(pose_dir, f"plip_diagram_{prefix}_set{s_idx+1}.png")
                    try:
                        if Visualizer:
                            vis = Visualizer(s)
                            vis.plot(interactive=False, outfile=dp)
                        elif draw_complex:
                            draw_complex(s, outfile=dp)
                        if os.path.exists(dp):
                            diagram_paths.append(dp)
                    except Exception:
                        pass
                logs.append(f"Diagrams -> {diagram_paths}")

            # RST
            rst_path = os.path.join(pose_dir, f"plip_{prefix}.rst")
            write_rst_summary(complex_obj, rst_path)
            logs.append(f"RST -> {rst_path}")

            # XML
            xml_path = os.path.join(pose_dir, f"plip_{prefix}.xml")
            write_xml_export(complex_obj, xml_path)
            logs.append(f"XML -> {xml_path}")

            # CSV
            csv_info = write_interaction_csvs(complex_obj, pose_dir, prefix)
            logs.append(f"CSV -> {csv_info.get('combined_csv')}")

            # PyMOL (pass complex_obj for ligand chain detection)
            pymol_info = generate_pymol_session_and_png(combined_clean, pose_dir, prefix, complex_obj=complex_obj)
            logs.append(f"PyMOL -> {pymol_info.get('pse')}")

            # RAW
            raw_path = None
            if return_raw:
                raw_path = os.path.join(pose_dir, f"plip_raw_{prefix}.txt")
                with open(raw_path, "w", encoding="utf-8") as rf:
                    rf.write(str(complex_obj))

            pose_results.append({
                "pose": idx,
                "folder": pose_dir,
                "ligand": lig_pdb,
                "receptor": rec_pdb,
                "complex": complex_pdb,
                "cleaned": combined_clean,
                "json": json_path,
                "yaml": yaml_path,
                "xml": xml_path,
                "csv": csv_info,
                "diagrams": diagram_paths,
                "rst": rst_path,
                "pymol": pymol_info,
                "raw": raw_path,
            })

        except Exception as e:
            logs.append(f"POSE ERROR: {e}")
            pose_results.append({"pose": idx, "error": str(e)})

        finally:
            # write pose log
            try:
                with open(os.path.join(pose_dir, "log.txt"), "w", encoding="utf-8") as lf:
                    lf.write("\n".join(logs))
            except Exception:
                pass

        manifest["pose_folders"].append(pose_name)

    # save manifest
    manifest_path = os.path.join(base_out_dir, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as mf:
        json.dump(manifest, mf, indent=2)

    return JSONResponse({
        "job": job,
        "outdir": base_out_dir,
        "manifest": manifest_path,
        "poses": pose_results
    })
