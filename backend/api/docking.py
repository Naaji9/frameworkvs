# backend/api/docking.py
from fastapi import APIRouter, Form, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse, FileResponse
from utils.framework_writer import generate_optimized_docking_script
import os
from typing import List, Optional
import numpy as np
import tempfile
import uuid
import threading
import subprocess
import time
from pathlib import Path

router = APIRouter()

# In-memory job store (simple). For production consider Redis/DB.
JOBS: dict = {}
JOBS_LOCK = threading.Lock()


# ---------- Existing: generate-script ----------
@router.post("/generate-script")
async def generate_script(
    ligand_folder: str = Form(...),
    receptor_folder: str = Form(...),
    center_x: float = Form(...),
    center_y: float = Form(...),
    center_z: float = Form(...),
    size_x: float = Form(...),
    size_y: float = Form(...),
    size_z: float = Form(...),
    box_step_x: float = Form(0.0),
    box_step_y: float = Form(0.0),
    box_step_z: float = Form(0.0),
    box_count_x: int = Form(1),
    box_count_y: int = Form(1),
    box_count_z: int = Form(1),
    exhaustiveness: int = Form(8),
    topbest: int = Form(10),
    user_cpu: int = Form(...),
    vina_cores: int = Form(...),
    chunk_mode: str = Form("no"),
    output_path: str = Form("outputs/vsframework.py"),
    enable_plip: str = Form("false")  # ← ADD THIS
):
    try:
        box_step = (box_step_x, box_step_y, box_step_z)
        box_count = (box_count_x, box_count_y, box_count_z)
        
        # ← ADD THIS CONVERSION
        enable_plip_bool = enable_plip.lower() == "true"

        # Generate unique temp file
        script_filename = f"vsframework_{uuid.uuid4().hex[:6]}.py"
        save_path = os.path.join(tempfile.gettempdir(), script_filename)

        # Call your generator
        generate_optimized_docking_script(
            ligand_folder=ligand_folder,
            receptor_folder=receptor_folder,
            box_center=(center_x, center_y, center_z),
            box_size=(size_x, size_y, size_z),
            box_step=box_step,
            box_count=box_count,
            exhaustiveness=exhaustiveness,
            topbest=topbest,
            cpu=user_cpu,
            vina_cores=vina_cores,
            chunk_mode=chunk_mode,
            output_path=output_path,
            save_path=save_path,
            enable_plip=enable_plip_bool  
        )

        return FileResponse(save_path, filename="vsframework.py", media_type="application/octet-stream")

    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})

@router.post("/generate-script-text")
async def generate_script_text(
    ligand_folder: str = Form(...),
    receptor_folder: str = Form(...),
    center_x: float = Form(...),
    center_y: float = Form(...),
    center_z: float = Form(...),
    size_x: float = Form(...),
    size_y: float = Form(...),
    size_z: float = Form(...),
    box_step_x: float = Form(0.0),
    box_step_y: float = Form(0.0),
    box_step_z: float = Form(0.0),
    box_count_x: int = Form(1),
    box_count_y: int = Form(1),
    box_count_z: int = Form(1),
    exhaustiveness: int = Form(8),
    topbest: int = Form(10),
    user_cpu: int = Form(...),
    vina_cores: int = Form(...),
    chunk_mode: str = Form("no"),
    output_path: str = Form("outputs"),
    enable_plip: str = Form("false")  
):
    # ✅ DEBUG: Print what we received
    print(f"🔍 DEBUG: enable_plip received = '{enable_plip}' (type: {type(enable_plip)})")
    
    enable_plip_bool = enable_plip.lower() == "true"
    print(f"🔍 DEBUG: enable_plip_bool converted = {enable_plip_bool} (type: {type(enable_plip_bool)})")
    
    # Modify your writer to return text instead of saving
    script_text = generate_optimized_docking_script(
        ligand_folder=ligand_folder,
        receptor_folder=receptor_folder,
        box_center=(center_x, center_y, center_z),
        box_size=(size_x, size_y, size_z),
        box_step=(box_step_x, box_step_y, box_step_z),
        box_count=(box_count_x, box_count_y, box_count_z),
        exhaustiveness=exhaustiveness,
        topbest=topbest,
        cpu=user_cpu,
        vina_cores=vina_cores,
        chunk_mode=chunk_mode,
        output_path=output_path,
        return_as_text=True,
        enable_plip=enable_plip_bool 
    )

    return {"script_text": script_text}
# ---------- Existing: calculate-blind-box ----------
# Line ~98 in docking.py - REPLACE the entire calculate-blind-box function:

@router.post("/calculate-blind-box")
async def calculate_blind_docking_box(
    receptor_files: Optional[List[UploadFile]] = File(None),
    receptor_path: Optional[str] = Form(None)
):
    """Calculate blind docking box from either uploaded files OR file path"""
    
    all_coords = []

    # CASE 1: Files were uploaded via browse button
    if receptor_files and len(receptor_files) > 0:
        print(f"📁 Processing {len(receptor_files)} uploaded receptor file(s)")
        for file in receptor_files:
            content = await file.read()
            lines = content.decode().splitlines()

            for line in lines:
                if line.startswith(("ATOM", "HETATM")):
                    try:
                        x = float(line[30:38])
                        y = float(line[38:46])
                        z = float(line[46:54])
                        all_coords.append([x, y, z])
                    except:
                        continue

    # CASE 2: Path was provided (user typed it manually)
    elif receptor_path:
        print(f"📂 Processing receptor from path: {receptor_path}")
        
        # Check if path exists
        if not os.path.exists(receptor_path):
            raise HTTPException(status_code=400, detail=f"Receptor path does not exist: {receptor_path}")
        
        # Handle single file
        if os.path.isfile(receptor_path):
            if receptor_path.endswith(('.pdb', '.pdbqt', '.cif')):
                files_to_process = [receptor_path]
            else:
                raise HTTPException(status_code=400, detail="Receptor file must be .pdb, .pdbqt, or .cif")
        
        # Handle directory
        elif os.path.isdir(receptor_path):
            files_to_process = []
            for fname in os.listdir(receptor_path):
                if fname.endswith(('.pdb', '.pdbqt', '.cif')):
                    files_to_process.append(os.path.join(receptor_path, fname))
            
            if not files_to_process:
                raise HTTPException(status_code=400, detail=f"No .pdb/.pdbqt/.cif files found in {receptor_path}")
        else:
            raise HTTPException(status_code=400, detail="Invalid receptor path")
        
        # Read coordinates from files
        for filepath in files_to_process:
            try:
                with open(filepath, 'r') as f:
                    lines = f.readlines()
                    for line in lines:
                        if line.startswith(("ATOM", "HETATM")):
                            try:
                                x = float(line[30:38])
                                y = float(line[38:46])
                                z = float(line[46:54])
                                all_coords.append([x, y, z])
                            except:
                                continue
            except Exception as e:
                print(f"⚠️ Warning: Could not read {filepath}: {e}")
                continue
    
    else:
        raise HTTPException(status_code=400, detail="Either receptor_files or receptor_path must be provided")

    if not all_coords:
        raise HTTPException(status_code=400, detail="No atom coordinates found in receptor(s)")

    coords = np.array(all_coords)

    # Compute bounds
    min_coords = coords.min(axis=0)
    max_coords = coords.max(axis=0)

    # Center = midpoint of bounds
    center = (min_coords + max_coords) / 2

    # Size with padding
    padding = 5.0  # Å
    size = (max_coords - min_coords) + (2 * padding)

    print(f"✅ Blind box calculated from {len(all_coords)} atoms")
    print(f"   Center: ({center[0]:.2f}, {center[1]:.2f}, {center[2]:.2f})")
    print(f"   Size: ({size[0]:.2f}, {size[1]:.2f}, {size[2]:.2f})")

    return {
        "center_x": round(center[0], 2),
        "center_y": round(center[1], 2),
        "center_z": round(center[2], 2),
        "size_x": round(size[0], 2),
        "size_y": round(size[1], 2),
        "size_z": round(size[2], 2),
    }


# ---------- New: helper to run generated script in background ----------
def _run_script_in_background(job_id: str, script_path: str, workdir: Optional[str] = None):
    """
    Runs the generated script via subprocess, streams stdout/stderr to a log file,
    and updates JOBS[job_id] with status/progress.
    """

    log_path = JOBS[job_id]["log_path"]
    # Ensure previous status set appropriately
    with JOBS_LOCK:
        JOBS[job_id].update({
            "status": "running",
            "progress": 0,
            "started_at": time.time(),
            "pid": None
        })

    # Open log file
    with open(log_path, "ab") as lf:
        # Start subprocess
        # Use same python executable
        cmd = [os.environ.get("PYTHON_EXECUTABLE", "python"), script_path]
        try:
            proc = subprocess.Popen(
                cmd,
                cwd=workdir or None,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                bufsize=1,
                universal_newlines=True
            )
            with JOBS_LOCK:
                JOBS[job_id]["pid"] = proc.pid

            # heuristics: update progress as we read lines; final -> 100 when finished
            lines_read = 0
            last_update = time.time()
            while True:
                line = proc.stdout.readline()
                if line:
                    lines_read += 1
                    lf.write(line.encode("utf-8", errors="replace"))
                    lf.flush()
                    # store last message
                    with JOBS_LOCK:
                        JOBS[job_id]["last_message"] = line.strip()

                    # update progress heuristically every 0.5s or every 20 lines
                    now = time.time()
                    if now - last_update > 0.5 or lines_read % 20 == 0:
                        with JOBS_LOCK:
                            # naive heuristic: ramp towards 90% while running
                            prev = JOBS[job_id].get("progress", 0)
                            newp = min(90, prev + 1 + int(lines_read / 50))
                            JOBS[job_id]["progress"] = newp
                        last_update = now
                else:
                    # check if process exited
                    if proc.poll() is not None:
                        break
                    # no output currently; small sleep to avoid busy loop
                    time.sleep(0.1)

            # Wait for process to finish and get exit code
            returncode = proc.wait()

            # capture any remaining stdout
            remaining = proc.stdout.read() if proc.stdout else ""
            if remaining:
                lf.write(remaining.encode("utf-8", errors="replace"))
                with JOBS_LOCK:
                    JOBS[job_id]["last_message"] = remaining.strip()

            # finalize status
            with JOBS_LOCK:
                if JOBS[job_id].get("canceled"):
                    JOBS[job_id]["status"] = "canceled"
                    JOBS[job_id]["progress"] = JOBS[job_id].get("progress", 0)
                else:
                    if returncode == 0:
                        JOBS[job_id]["status"] = "done"
                        JOBS[job_id]["progress"] = 100
                    else:
                        JOBS[job_id]["status"] = "failed"
                        JOBS[job_id]["progress"] = JOBS[job_id].get("progress", 0)
                        JOBS[job_id]["error_code"] = returncode

        except Exception as e:
            with JOBS_LOCK:
                JOBS[job_id]["status"] = "failed"
                JOBS[job_id]["last_message"] = str(e)
                JOBS[job_id]["progress"] = JOBS[job_id].get("progress", 0)
            # write exception to log
            with open(log_path, "ab") as lf2:
                lf2.write(f"\nException while launching process: {e}\n".encode("utf-8"))


# ---------- New: POST /run ----------
@router.post("/run")
async def run_docking(
    ligand_folder: str = Form(...),
    receptor_folder: str = Form(...),
    center_x: float = Form(...),
    center_y: float = Form(...),
    center_z: float = Form(...),
    size_x: float = Form(...),
    size_y: float = Form(...),
    size_z: float = Form(...),
    box_step_x: float = Form(0.0),
    box_step_y: float = Form(0.0),
    box_step_z: float = Form(0.0),
    box_count_x: int = Form(1),
    box_count_y: int = Form(1),
    box_count_z: int = Form(1),
    exhaustiveness: int = Form(8),
    topbest: int = Form(10),
    user_cpu: int = Form(...),
    vina_cores: int = Form(...),
    chunk_mode: str = Form("no"),
    max_workers: int = Form(1),
    output_path: str = Form("outputs/vsframework.py"),
    blind_docking: bool = Form(False)
):
    """
    Generate the docking script and run it in the background.
    Returns a job_id immediately. Frontend should poll /docking/status/{job_id}
    """



    try:
        box_step = (box_step_x, box_step_y, box_step_z)
        box_count = (box_count_x, box_count_y, box_count_z)

        # Create job entry
        job_id = str(uuid.uuid4())
        script_filename = f"vsframework_{uuid.uuid4().hex[:8]}.py"
        save_path = os.path.join(tempfile.gettempdir(), script_filename)

        # generate the script (use same generator)
        generate_optimized_docking_script(
            ligand_folder=ligand_folder,
            receptor_folder=receptor_folder,
            box_center=(center_x, center_y, center_z),
            box_size=(size_x, size_y, size_z),
            box_step=box_step,
            box_count=box_count,
            exhaustiveness=exhaustiveness,
            topbest=topbest,
            cpu=user_cpu,
            vina_cores=vina_cores,
            chunk_mode=chunk_mode,
            output_path=output_path,
            save_path=save_path
        )

        # prepare a log file for this job
        log_file = os.path.join(tempfile.gettempdir(), f"docking_log_{job_id}.log")
        # initialize job entry
        with JOBS_LOCK:
            JOBS[job_id] = {
                "status": "queued",
                "progress": 0,
                "script_path": save_path,
                "log_path": log_file,
                "created_at": time.time(),
                "last_message": "",
                "pid": None,
                "canceled": False
            }

        # Start background thread to run the script
        thread = threading.Thread(target=_run_script_in_background, args=(job_id, save_path, None), daemon=True)
        thread.start()

        return {"job_id": job_id}
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})


# ---------- New: GET /status/{job_id} ----------
@router.get("/status/{job_id}")
async def docking_status(job_id: str):
    with JOBS_LOCK:
        if job_id not in JOBS:
            return JSONResponse(status_code=404, content={"status": "not_found", "progress": 0, "message": "Job not found"})

        job = JOBS[job_id].copy()

    # Provide a small excerpt of last log lines (non-blocking)
    log_excerpt = ""
    try:
        log_path = job.get("log_path")
        if log_path and os.path.exists(log_path):
            # read last ~5 lines
            with open(log_path, "rb") as lf:
                lf.seek(0, os.SEEK_END)
                size = lf.tell()
                to_read = min(size, 8192)
                lf.seek(max(0, size - to_read), os.SEEK_SET)
                data = lf.read().decode("utf-8", errors="replace")
                lines = data.strip().splitlines()
                log_excerpt = "\n".join(lines[-5:])
    except Exception:
        log_excerpt = ""

    response = {
        "status": job.get("status", "unknown"),
        "progress": int(job.get("progress", 0)),
        "message": job.get("last_message", "") or log_excerpt,
        "pid": job.get("pid"),
        "created_at": job.get("created_at")
    }
    return JSONResponse(status_code=200, content=response)


# ---------- New: POST /cancel/{job_id} ----------
@router.post("/cancel/{job_id}")
async def cancel_job(job_id: str):
    with JOBS_LOCK:
        if job_id not in JOBS:
            return JSONResponse(status_code=404, content={"detail": "Job not found"})
        job = JOBS[job_id]

        # Mark canceled
        job["canceled"] = True
        pid = job.get("pid")

    # If process is running, try to terminate
    if pid:
        try:
            # On Unix, send SIGTERM
            os.kill(pid, 15)
            time.sleep(0.2)
            # If still alive, SIGKILL
            try:
                os.kill(pid, 0)
                os.kill(pid, 9)
            except OSError:
                pass
        except Exception as e:
            # ignore kill errors
            pass

    with JOBS_LOCK:
        JOBS[job_id]["status"] = "canceled"

    return JSONResponse(status_code=200, content={"status": "canceled"})

