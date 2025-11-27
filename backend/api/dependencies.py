# api/dependencies.py
import platform
import shutil
import subprocess
import threading
import uuid
import os
import shlex
import time
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from fastapi.responses import JSONResponse

router = APIRouter()

# In-memory install jobs store
INSTALL_JOBS = {}
INSTALL_LOCK = threading.Lock()

# Tools we manage and the generic commands per OS (best-effort)
TOOLS = {
    "vina": {"desc": "AutoDock Vina"},
    "openbabel": {"desc": "OpenBabel (obabel)"},
    "mgltools": {"desc": "MGLTools (prepare_receptor/tools)"},
    "python_libs": {"desc": "Python packages (numpy, pandas, ...)"}
}

# Helper: detect binary on PATH
def is_binary_available(bin_name):
    return shutil.which(bin_name) is not None

# Helper: detect python packages
def is_python_package_installed(pkg):
    import importlib.util
    return importlib.util.find_spec(pkg) is not None

# Check dependencies endpoint
@router.get("/check-dependencies")
def check_dependencies():
    os_name = platform.system().lower()
    res = {
        "os": os_name,
        "checks": {}
    }

    # Vina
    res["checks"]["vina"] = is_binary_available("vina") or is_binary_available("autodock_vina")

    # OpenBabel (usually obabel)
    res["checks"]["openbabel"] = is_binary_available("obabel") or is_binary_available("openbabel")

    # MGLTools: common binary names are 'prepare_ligand' or flippable - best-effort
    res["checks"]["mgltools"] = is_binary_available("prepare_ligand") or is_binary_available("pdbqt_from_pdb") or False

    # Python libs (example: numpy)
    res["checks"]["python_libs"] = {
        "numpy": is_python_package_installed("numpy"),
        "pandas": is_python_package_installed("pandas")
    }

    # overall flag
    res["checks"]["all_ok"] = all(
        [res["checks"]["vina"],
         res["checks"]["openbabel"],
         res["checks"]["mgltools"]] + list(res["checks"]["python_libs"].values())
    )
    return res

# Run shell command and stream output to job log
def _run_and_log(cmd, job_id):
    job = INSTALL_JOBS[job_id]
    log_path = job["log_path"]
    try:
        job["status"] = "installing"
        with open(log_path, "ab") as lf:
            lf.write(f"Running: {cmd}\n".encode("utf-8"))
            lf.flush()
            # Use shell=False with shlex split
            p = subprocess.Popen(shlex.split(cmd), stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
            while True:
                line = p.stdout.readline()
                if not line and p.poll() is not None:
                    break
                if line:
                    lf.write(line)
                    lf.flush()
            rc = p.wait()
            job["returncode"] = rc
            if rc == 0:
                job["status"] = "done"
            else:
                job["status"] = "failed"
                with open(log_path, "ab") as lf2:
                    lf2.write(f"\nCommand returned {rc}\n".encode("utf-8"))
    except Exception as e:
        job["status"] = "failed"
        with open(job["log_path"], "ab") as lf:
            lf.write(f"\nException: {e}\n".encode("utf-8"))

# Background installer per-OS simple best-effort
def installer_thread(tool_name, job_id):
    job = INSTALL_JOBS[job_id]
    os_name = platform.system().lower()
    log_path = job["log_path"]

    # Linux: attempt apt-get (Debian/Ubuntu) then fallback to instructions
    if os_name == "linux":
        if tool_name == "openbabel":
            # try apt-get
            if shutil.which("apt-get"):
                cmd = "sudo apt-get update && sudo apt-get install -y openbabel"
                _run_and_log(cmd, job_id)
                return
            # fallback: try snap or provide manual instruction
            with open(log_path, "ab") as lf:
                lf.write(b"\nUnable to run apt-get. Please install OpenBabel manually (e.g. 'sudo apt-get install openbabel')\n")
                job["status"] = "failed"
                return

        if tool_name == "vina":
            if shutil.which("apt-get"):
                # some distros package name is 'autodock-vina' or 'vina'
                cmd = "sudo apt-get update && sudo apt-get install -y autodock-vina"
                _run_and_log(cmd, job_id)
                # if failed, try apt-get install vina
                if INSTALL_JOBS[job_id]["status"] == "failed":
                    _run_and_log("sudo apt-get install -y vina", job_id)
                return
            with open(log_path, "ab") as lf:
                lf.write(b"\nPlease install AutoDock Vina manually.\n")
                job["status"] = "failed"
                return

        if tool_name == "mgltools":
            # best-effort: instruct user (installers vary)
            with open(log_path, "ab") as lf:
                lf.write(b"\nMGLTools requires manual installation. Visit https://ccsb.scripps.edu/mgltools/ and follow OS instructions.\n")
            job["status"] = "failed"
            return

        if tool_name == "python_libs":
            # pip install needed packages
            cmd = f"{shutil.which('python3') or shutil.which('python')} -m pip install numpy pandas"
            _run_and_log(cmd, job_id)
            return

    # macOS
    if os_name == "darwin":
        # require brew
        if tool_name in ("openbabel", "vina"):
            if shutil.which("brew"):
                pkg = "open-babel" if tool_name == "openbabel" else "autodock-vina"
                cmd = f"brew install {pkg}"
                _run_and_log(cmd, job_id)
                return
            else:
                with open(log_path, "ab") as lf:
                    lf.write(b"\nHomebrew is not installed. Please install Homebrew first: https://brew.sh/\n")
                job["status"] = "failed"
                return
        if tool_name == "mgltools":
            with open(log_path, "ab") as lf:
                lf.write(b"\nPlease install MGLTools manually. See: https://ccsb.scripps.edu/mgltools/\n")
            job["status"] = "failed"
            return
        if tool_name == "python_libs":
            cmd = f"{shutil.which('python3') or 'python3'} -m pip install numpy pandas"
            _run_and_log(cmd, job_id)
            return

    # Windows
    if os_name == "windows":
        # prefer winget, else choco, else instruct
        if tool_name in ("openbabel", "vina"):
            installer = None
            if shutil.which("winget"):
                # winget identifiers vary; users may need to adapt
                if tool_name == "openbabel":
                    cmd = "winget install --id OpenBabel.OpenBabel -e --source winget"
                else:
                    # AutoDock Vina is not always in winget; provide manual fallback
                    cmd = "winget install --id Autodock.Vina -e --source winget"
                _run_and_log(cmd, job_id)
                return
            if shutil.which("choco"):
                if tool_name == "openbabel":
                    _run_and_log("choco install openbabel -y", job_id)
                    return
                if tool_name == "vina":
                    _run_and_log("choco install autodock-vina -y", job_id)
                    return
            with open(job["log_path"], "ab") as lf:
                lf.write(b"\nAutomatic install not available. Please download installers manually:\n- OpenBabel: https://openbabel.org/wiki/Main_Page\n- AutoDock Vina: https://vina.scripps.edu/\n")
            job["status"] = "failed"
            return

        if tool_name == "mgltools":
            with open(job["log_path"], "ab") as lf:
                lf.write(b"\nPlease download MGLTools for Windows and follow the installer steps: https://ccsb.scripps.edu/mgltools/\n")
            job["status"] = "failed"
            return

        if tool_name == "python_libs":
            py = shutil.which("python") or shutil.which("python3")
            if py:
                _run_and_log(f"{py} -m pip install numpy pandas", job_id)
                return
            else:
                with open(job["log_path"], "ab") as lf:
                    lf.write(b"\nPython not found on PATH. Please install Python 3 and rerun.\n")
                job["status"] = "failed"
                return

    # fallback
    with open(job["log_path"], "ab") as lf:
        lf.write(b"\nUnsupported OS or unknown tool. Please install manually.\n")
    INSTALL_JOBS[job_id]["status"] = "failed"
    return

# POST to start install
@router.post("/install-dependency")
def install_dependency(name: str = Query(..., description="Tool name: vina, openbabel, mgltools, python_libs")):
    if name not in TOOLS:
        raise HTTPException(status_code=400, detail="Unknown tool")

    job_id = str(uuid.uuid4())
    log_path = os.path.join(os.getcwd(), f"install_{job_id}.log")
    with INSTALL_LOCK:
        INSTALL_JOBS[job_id] = {
            "tool": name,
            "status": "queued",
            "created_at": time.time(),
            "log_path": log_path,
            "returncode": None
        }

    # start background thread
    t = threading.Thread(target=installer_thread, args=(name, job_id), daemon=True)
    t.start()

    return {"install_id": job_id, "tool": name}

# GET install status & tail of log
@router.get("/install-status/{install_id}")
def install_status(install_id: str):
    if install_id not in INSTALL_JOBS:
        raise HTTPException(status_code=404, detail="Install job not found")

    job = INSTALL_JOBS[install_id]
    log_excerpt = ""
    try:
        if os.path.exists(job["log_path"]):
            # read last ~8KB for tail
            with open(job["log_path"], "rb") as lf:
                lf.seek(max(0, os.path.getsize(job["log_path"]) - 8192))
                data = lf.read().decode("utf-8", errors="replace")
                lines = data.strip().splitlines()
                log_excerpt = "\n".join(lines[-40:])
    except Exception:
        log_excerpt = ""

    return {
        "install_id": install_id,
        "tool": job["tool"],
        "status": job["status"],
        "returncode": job.get("returncode"),
        "log_tail": log_excerpt
    }
