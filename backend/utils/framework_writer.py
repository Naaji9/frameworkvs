import os

def generate_optimized_docking_script(
    ligand_folder: str,
    receptor_folder: str,
    output_path: str,
    box_center: tuple,
    box_size: tuple,
    box_step: tuple,
    box_count: tuple,
    exhaustiveness: int = 8,
    topbest: int = 10,
    cpu: int = 8,
    vina_cores: int = 2,
    chunk_mode: str = "no",
    enable_plip: bool = False,
    save_path: str = "outputs/vsframework.py",
    return_as_text: bool = False
):
    CHUNK_SIZE = 1000 if chunk_mode == "yes" else 0

    # ✅ CONDITIONAL: Only include PLIP variables if enabled
    plip_globals = ""
    plip_function = ""
    plip_call = ""
    
    if enable_plip:
        plip_globals = f"""
ENABLE_PLIP = True
PLIP_SCRIPT_PATH = "plip_analysis.py"
"""
        plip_function = """
# === PLIP Auto-Runner ===
def run_plip_if_enabled():
    \"\"\"Automatically run PLIP analysis if enabled and script exists\"\"\"
    if not ENABLE_PLIP:
        print("\\n⭐ PLIP analysis disabled, skipping...")
        return
    
    if not os.path.exists(PLIP_SCRIPT_PATH):
        print(f"\\n⚠️  PLIP script not found: {PLIP_SCRIPT_PATH}")
        print("    Make sure plip_analysis.py is in the same folder.")
        return
    
    print("\\n" + "="*80)
    print(" DOCKING COMPLETE - STARTING PLIP ANALYSIS")
    print("="*80)
    print(f" Analyzing docking results from: {output_path}")
    print(f" PLIP output will be saved to: {output_path}/plip_analysis/")
    print("="*80 + "\\n")
    
    try:
        result = subprocess.run(
            ["python3", PLIP_SCRIPT_PATH],
            check=True,
            capture_output=False  # Show PLIP output in real-time
        )
        print("\\n" + "="*80)
        print(" PLIP ANALYSIS COMPLETED SUCCESSFULLY!")
        print("="*80)
    except subprocess.CalledProcessError as e:
        print("\\n" + "="*80)
        print(f"✖️ PLIP analysis failed with error code: {e.returncode}")
        print("="*80)
        print("⚠️  Don't worry - your docking results are safe!")
        print(f"    Check {output_path} for docking results.")
    except FileNotFoundError:
        print("\\n✖️ Error: python3 not found. Please ensure Python 3 is installed.")
    except Exception as e:
        print(f"\\n✖️ Unexpected error during PLIP analysis: {e}")
        print("⚠️  Docking results are safe and available.")
"""
        plip_call = """
    # Auto-run PLIP analysis if enabled
    run_plip_if_enabled()"""
    else:
        # When PLIP is disabled, add nothing
        plip_globals = ""
        plip_function = ""
        plip_call = ""

    script = f"""#!/usr/bin/env python
import os
import subprocess
import time
import csv
from concurrent.futures import ProcessPoolExecutor, as_completed
import multiprocessing
import difflib

CHUNK_SIZE = {CHUNK_SIZE}{plip_globals}

# === SMART FIX PATH ===

def fix_user_path(path: str, name: str) -> str:
    path = path.strip().strip('"').strip("'")
    path = os.path.expanduser(path)

    if path.startswith("home/"):
        path = "/" + path

    parts = os.path.normpath(path).split(os.sep)
    current = os.sep if path.startswith(os.sep) else os.getcwd()

    for part in parts:
        if not part:
            continue

        candidate = os.path.join(current, part)
        if os.path.exists(candidate):
            current = candidate
            continue

        # Try fuzzy match
        try:
            entries = os.listdir(current)
        except Exception:
            break

        match = difflib.get_close_matches(part, entries, n=1, cutoff=0.6)
        if match:
            print(f" Fixed '{{part}}' → '{{match[0]}}'")
            current = os.path.join(current, match[0])
        else:
            print(f"✖️ Cannot resolve '{{part}}' in '{{current}}'")
            return candidate

    if " " in current:
        print(f"⚠️ WARNING: '{{name}}' path contains spaces:\\n   {{current}}")

    return os.path.abspath(current)

# === Shared Progress Trackers ===
progress_counter = multiprocessing.Value('i', 0)
print_lock = multiprocessing.Lock()
TOTAL_TASKS = None

# === Checkpoint System ===
def save_checkpoint(label, checkpoint_file):
    with open(checkpoint_file, "a") as f:
        f.write(label + "\\n")

def load_checkpoint(checkpoint_file):
    if os.path.exists(checkpoint_file):
        with open(checkpoint_file) as f:
            return set(line.strip() for line in f)
    return set()

# === Vector3 Helper ===
class Vector3:
    def __init__(self, x, y, z):
        self.x = float(x)
        self.y = float(y)
        self.z = float(z)
    def __add__(self, other):
        return Vector3(self.x + other.x, self.y + other.y, self.z + other.z)
    def __str__(self):
        return f"({{self.x}}, {{self.y}}, {{self.z}})"

# === Configuration ===
ligand_folder = r"{ligand_folder}"
receptor_folder = r"{receptor_folder}"
output_path = r"{output_path}"
os.makedirs(output_path, exist_ok=True)

# Apply fixes
ligand_folder = fix_user_path(ligand_folder, "Ligand")
receptor_folder = fix_user_path(receptor_folder, "Receptor")
output_path = fix_user_path(output_path, "Output")

print("="*60 + "\\n")

box_center = Vector3({box_center[0]}, {box_center[1]}, {box_center[2]})
box_size = Vector3({box_size[0]}, {box_size[1]}, {box_size[2]})
box_step = Vector3({box_step[0]}, {box_step[1]}, {box_step[2]})
box_count = Vector3({box_count[0]}, {box_count[1]}, {box_count[2]})

cpu_cores = {cpu}
available = os.cpu_count()
budget = min(cpu_cores, available)
vina_cores = {vina_cores}
max_workers = max(1, budget // vina_cores)
using = vina_cores * max_workers
print(f"🔵 CPUs: {{available}} | 🔴 Using: {{using}} | ⚙️ Vina cores: {{vina_cores}} | 🧵 Workers: {{max_workers}}")


# === UPDATED CONVERSION FUNCTIONS ===
def scan_folder(folder, exts):
    \"\"\"Scan folder for files with given extensions.\"\"\"
    files = []
    for f in os.listdir(folder):
        if f.lower().endswith(exts):
            files.append(os.path.join(folder, f))
    return files

def convert_to_pdbqt(path):
    \"\"\"Convert a single file to PDBQT format.\"\"\"
    # If it's already PDBQT, return as is
    if path.endswith(".pdbqt"):
        return path
    
    # Generate output filename
    out = os.path.splitext(path)[0] + ".pdbqt"
    
    # Skip if output already exists
    if os.path.exists(out):
        print(f"✓ PDBQT already exists: {{os.path.basename(out)}}")
        return out
    
    print(f"🗘 Converting: {{os.path.basename(path)}} -> {{os.path.basename(out)}}")
    
    try:
        subprocess.run([
            "obabel", path,
            "-O", out,
            "--partialcharge", "gasteiger",
            "--addhydrogens",
            "--xr"
        ], check=True, capture_output=True, text=True)
        print(f"✓ Converted: {{os.path.basename(path)}}")
        return out
    except subprocess.CalledProcessError as e:
        print(f"✖️ Failed to convert {{os.path.basename(path)}}: {{e.stderr}}")
        return None

def convert_all(paths):
    \"\"\"Convert all files/folders to PDBQT list.\"\"\"
    all_converted = []
    
    for path in paths:
        # If it's a directory, process all files in it
        if os.path.isdir(path):
            print(f"\\n 🗁 Processing directory: {{path}}")
            # Get all supported files in directory
            files = []
            for ext in (".pdb", ".sdf", ".mol2", ".pdbqt"):
                files.extend(scan_folder(path, (ext,)))
            
            if not files:
                print(f"⚠️  No supported files found in directory: {{path}}")
                continue
                
            # Convert all files
            for file_path in files:
                converted = convert_to_pdbqt(file_path)
                if converted:
                    all_converted.append(converted)
        else:
            # It's a single file
            converted = convert_to_pdbqt(path)
            if converted:
                all_converted.append(converted)
    
    return all_converted

def load_ligands(path):
    \"\"\"Load ligands - supports both single file and directory.\"\"\"
    print(f"\\n Loading ligands from: {{path}}")
    
    # Check if path exists
    if not os.path.exists(path):
        print(f"✖️ ERROR: Ligand path does not exist: {{path}}")
        return []
    
    # If it's a directory, return list of all supported files
    if os.path.isdir(path):
        files = []
        for ext in (".pdbqt", ".sdf", ".mol2", ".pdb"):
            files.extend(scan_folder(path, (ext,)))
        print(f"   Found {{len(files)}} ligand files in directory")
        return files
    else:
        # It's a single file
        print(f"   Processing single ligand file")
        return [path]

def load_receptors(path):
    \"\"\"Load receptors - supports both single file and directory.\"\"\"
    print(f"\\n Loading receptors from: {{path}}")
    
    # Check if path exists
    if not os.path.exists(path):
        print(f"✖️ ERROR: Receptor path does not exist: {{path}}")
        return []
    
    # If it's a directory, return list of all supported files
    if os.path.isdir(path):
        files = []
        for ext in (".pdbqt", ".sdf", ".mol2", ".pdb"):
            files.extend(scan_folder(path, (ext,)))
        print(f"   Found {{len(files)}} receptor files in directory")
        return files
    else:
        # It's a single file
        print(f"   Processing single receptor file")
        return [path]

# Load and convert ligands
print("\\n" + "="*60)
print("PROCESSING LIGANDS")
print("="*60)
ligand_files = load_ligands(ligand_folder)
ligands = convert_all(ligand_files)

print("\\n" + "="*60)
print("PROCESSING RECEPTORS")
print("="*60)
receptor_files = load_receptors(receptor_folder)
receptors = convert_all(receptor_files)

# Check if we have any ligands/receptors
if not ligands:
    print("\\n✖️ ERROR: No ligands to process. Exiting.")
    exit(1)
if not receptors:
    print("\\n✖️ ERROR: No receptors to process. Exiting.")
    exit(1)

print(f"\\n  Ready to dock: {{len(ligands)}} ligands vs {{len(receptors)}} receptors")


# === Vina Command & Output ===
def vina_command(ligand, receptor, center_str, output_dir):
    out_file = os.path.join(output_dir, f"{{os.path.basename(receptor)[:11]}}_{{os.path.splitext(os.path.basename(ligand))[0]}}_{{center_str}}.pdbqt")
    return [
        "vina",
        "--ligand", ligand,
        "--receptor", receptor,
        "--center_x", str(box_center.x),
        "--center_y", str(box_center.y),
        "--center_z", str(box_center.z),
        "--size_x", str(box_size.x),
        "--size_y", str(box_size.y),
        "--size_z", str(box_size.z),
        "--exhaustiveness", "{exhaustiveness}",
        "--cpu", str(vina_cores),
        "--out", out_file
    ], out_file

def generate_output_path(ligand, receptor, center_str):
    ligand_name = os.path.splitext(os.path.basename(ligand))[0]
    receptor_name = os.path.splitext(os.path.basename(receptor))[0]
    subfolder = os.path.join(output_path, receptor_name, ligand_name, center_str)
    os.makedirs(subfolder, exist_ok=True)
    return subfolder

# === Task Generator ===
def generate_tasks(ligands, receptors):
    tasks = []
    for receptor in receptors:
        for ligand in ligands:
            for dx in range(int(box_count.x)):
                for dy in range(int(box_count.y)):
                    for dz in range(int(box_count.z)):
                        offset = Vector3(box_step.x * dx, box_step.y * dy, box_step.z * dz)
                        center = box_center + offset
                        center_str = f"{{center.x}}_{{center.y}}_{{center.z}}"
                        output_dir = generate_output_path(ligand, receptor, center_str)
                        cmd, out_file = vina_command(ligand, receptor, center_str, output_dir)
                        label = f"{{os.path.basename(ligand)}}::{{os.path.basename(receptor)}}::{{center_str}}"
                        tasks.append((cmd, label, out_file))
    return tasks

# === Task Runner ===
def run_task(task, checkpoint_file, completed):
    cmd, label, out_file = task
    if label in completed:
        print(f"✓ Skipping: {{label}}")
        return

    start = time.time()
    with progress_counter.get_lock():
        progress_counter.value += 1
        percent = int((progress_counter.value / TOTAL_TASKS) * 100)
        with print_lock:
            print(f"▶ ◆︎ ◆︎ ◆︎ ◆︎ ◆︎ ◆︎ ◆︎ ◆︎ ◆︎ ◆︎ ◆︎ ◆︎ ◆︎ ◆︎ ◆︎ ◆︎ ◆︎ ◆︎ ◆︎ ◆︎ ◆︎ ◆︎ ◆︎ ◆︎ ◆︎ ◆︎ ◆︎  ◆ ◆ ◆︎ ◆︎ Progress: {{progress_counter.value}}/{{TOTAL_TASKS}} ({{percent}}%)")

    try:
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, universal_newlines=True)
        log_lines = []
        for line in process.stdout:
            print(line, end="")
            log_lines.append(line)
        process.wait()

        if process.returncode == 0 and os.path.exists(out_file):
            log_path = os.path.splitext(out_file)[0] + "_log.txt"
            with open(log_path, "w") as log_file:
                log_file.writelines(log_lines)
            save_checkpoint(label, checkpoint_file)
        else:
            with failed_counter.get_lock():
                failed_counter.value += 1
            print(f"✖️ Docking failed or output missing: {{label}}")

    except Exception as e:
        with failed_counter.get_lock():
            failed_counter.value += 1
        print(f"✖️ Error: {{label}} - {{str(e)}}")

    finally:
        dur = time.time() - start
        with print_lock:
            print(f"⏱ {{label}} done in {{dur:.2f}}s")

# === Batch Runner ===
def run_batch(group, checkpoint_file, completed):
    for task in group:
        run_task(task, checkpoint_file, completed)

# === Score Extractor ===
def extract_scores():
    rows = []
    for root, _, files in os.walk(output_path):
        for f in files:
            if f.endswith(".pdbqt"):
                with open(os.path.join(root, f)) as fh:
                    for line in fh:
                        if "REMARK VINA RESULT:" in line:
                            toks = line.split()
                            if len(toks) >= 6:
                                rows.append([f, toks[3], toks[4], toks[5]])
                            break

    if rows:
        rows.sort(key=lambda x: float(x[1]))

        csv_path = os.path.join(output_path, "vina_scores.csv")
        with open(csv_path, "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["File", "Affinity", "RMSD_LB", "RMSD_UB"])
            writer.writerows(rows)
        print(f" Vina scores saved to: {{csv_path}}")

        TOP_N = {topbest}
        top_hits = rows[:TOP_N]
        top_csv = os.path.join(output_path, "top_hits.csv")
        with open(top_csv, "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["Rank", "File", "Affinity", "RMSD_LB", "RMSD_UB"])
            for i, row in enumerate(top_hits, 1):
                writer.writerow([i] + row)
        print(f" Top {{len(top_hits)}} hits saved to: {{top_csv}}")
    else:
        print("⚠️ No scores found to write.")
{plip_function}

# === Main Runner ===
def run():
    global TOTAL_TASKS, failed_counter
    failed_counter = multiprocessing.Value('i', 0)
    checkpoint_file = os.path.join(output_path, "checkpoint.txt")
    completed = load_checkpoint(checkpoint_file)

    overall_start = time.time()
    ligand_chunks = [ligands[i:i + CHUNK_SIZE] for i in range(0, len(ligands), CHUNK_SIZE)] if CHUNK_SIZE else [ligands]
    total_chunks = len(ligand_chunks)
    chunk_counter = 1
    total_tasks = 0

    for chunk in ligand_chunks:
        print(f"\\n Processing chunk {{chunk_counter}}/{{total_chunks}}...")
        chunk_counter += 1
        tasks = generate_tasks(chunk, receptors)
        TOTAL_TASKS = len(tasks)
        total_tasks += TOTAL_TASKS
        print(f" Total tasks in this chunk: {{TOTAL_TASKS}}")

        with ProcessPoolExecutor(max_workers=max_workers) as pool:
            futures = [pool.submit(run_task, task, checkpoint_file, completed) for task in tasks]
            for _ in as_completed(futures):
                pass

    dur = time.time() - overall_start
    dur_minutes = dur / 60
    failed = failed_counter.value
    success = total_tasks - failed
    print(f"\\n All chunks completed. Total docking tasks processed: {{total_tasks}}")
    print(f"🟢 Success: {{success}} / {{total_tasks}}")
    print(f"🔴 Failed: {{failed}}")
    print(f"⏱ Docking completed in {{dur:.2f}} seconds ({{dur_minutes:.2f}} minutes).")

    print("\\n" + "="*60)
    print(f"GENERATED BY: COMBIVS FRAMEWORKVS 3.0")
    print("="*60)

    extract_scores()
    {plip_call}
    


if __name__ == "__main__":
    run()
"""

    # --- RETURN TEXT MODE (for online backend -> frontend -> local backend)
    if return_as_text:
        return script

    # --- NORMAL SAVE TO FILE (download .py)
    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    with open(save_path, "w") as f:
        f.write(script)
    print(f" ✔ Script generated and saved to: {save_path}")

    return save_path