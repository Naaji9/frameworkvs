# backend/api/autodock.py

import os
import uuid
import subprocess
from fastapi import APIRouter, UploadFile, File
from fastapi.responses import FileResponse

router = APIRouter(prefix="/autodock", tags=["AutoDock Tools"])

# Paths to your installed prepare scripts
PREPARE_LIGAND = "/home/naji/miniconda3/bin/prepare_ligand4.py"
PREPARE_RECEPTOR = "/home/naji/miniconda3/bin/prepare_receptor4.py"


def save_temp_file(upload: UploadFile, suffix=""):
    """Store upload to temp folder and return its path."""
    ext = os.path.splitext(upload.filename)[1]
    rnd = uuid.uuid4().hex
    outpath = f"/tmp/{rnd}{suffix}{ext}"

    with open(outpath, "wb") as f:
        f.write(upload.file.read())

    return outpath


@router.post("/ligand")
async def prepare_ligand(file: UploadFile = File(...)):
    """Prepare ligand: convert to PDBQT with Gasteiger charges."""
    src = save_temp_file(file)
    out = src.replace(".pdb", ".pdbqt").replace(".mol2", ".pdbqt").replace(".sdf", ".pdbqt")

    cmd = [
        "python3",
        PREPARE_LIGAND,
        "-l", src,
        "-o", out,
        "-A", "hydrogens"
    ]

    try:
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        return FileResponse(out, filename=os.path.basename(out))
    except subprocess.CalledProcessError as e:
        return {"error": e.stderr.decode()}


@router.post("/receptor")
async def prepare_receptor(file: UploadFile = File(...)):
    """Prepare receptor: add hydrogens, charges and convert to PDBQT."""
    src = save_temp_file(file)
    out = src.replace(".pdb", ".pdbqt").replace(".mol2", ".pdbqt").replace(".sdf", ".pdbqt")

    cmd = [
        "python3",
        PREPARE_RECEPTOR,
        "-r", src,
        "-o", out,
        "-A", "hydrogens"
    ]

    try:
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        return FileResponse(out, filename=os.path.basename(out))
    except subprocess.CalledProcessError as e:
        return {"error": e.stderr.decode()}

