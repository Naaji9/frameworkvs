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
    save_path: str = "outputs/vsframework.py",
    return_as_text: bool = False          # <── FIXED
):
    CHUNK_SIZE = 1000 if chunk_mode == "yes" else 0

    script = f"""#!/usr/bin/env python
import os
import subprocess
import time
import csv
from concurrent.futures import ProcessPoolExecutor, as_completed
import multiprocessing

CHUNK_SIZE = {CHUNK_SIZE}

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

# === Conversion & Scanning ===
def scan_folder(folder, exts):
    return [os.path.join(folder, f) for f in os.listdir(folder) if f.lower().endswith(exts)]

def convert_to_pdbqt(path):
    if path.endswith(".pdbqt"):
        return path
    out = path.rsplit(".", 1)[0] + ".pdbqt"
    subprocess.run([
        "obabel", path,
        "-O", out,
        "--partialcharge", "gasteiger",
        "--addhydrogens",
        "--xr"
    ], check=True)
    return out

def convert_all(files): return [convert_to_pdbqt(f) for f in files]

def load_ligands(path):
    if os.path.isdir(path):
        return scan_folder(path, (".pdbqt", ".sdf", ".mol2", ".pdb"))
    else:
        return [path]

ligands = convert_all(load_ligands(ligand_folder))

def load_receptors(path):
    if os.path.isdir(path):
        return scan_folder(path, (".pdbqt", ".sdf", ".mol2", ".pdb"))
    else:
        return [path]

receptors = convert_all(load_receptors(receptor_folder))

# === Vina Command & Output ===
def vina_command(ligand, receptor, center_str, output_dir):
    out_file = os.path.join(output_dir, f"{{os.path.basename(receptor)[:10]}}_{{os.path.splitext(os.path.basename(ligand))[0]}}_{{center_str}}.pdbqt")
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
        print(f"✔ Skipping: {{label}}")
        return

    start = time.time()
    with progress_counter.get_lock():
        progress_counter.value += 1
        percent = int((progress_counter.value / TOTAL_TASKS) * 100)
        with print_lock:
            print(f"🔷🔷 Progress: {{progress_counter.value}}/{{TOTAL_TASKS}} ({{percent}}%)")

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
            print(f"❌ Docking failed or output missing: {{label}}")

    except Exception as e:
        with failed_counter.get_lock():
            failed_counter.value += 1
        print(f"❌ Error: {{label}} - {{str(e)}}")

    finally:
        dur = time.time() - start
        with print_lock:
            print(f"⏱️ {{label}} done in {{dur:.2f}}s")

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
        print(f"📄 Vina scores saved to: {{csv_path}}")

        TOP_N = {topbest}
        top_hits = rows[:TOP_N]
        top_csv = os.path.join(output_path, "top_hits.csv")
        with open(top_csv, "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["Rank", "File", "Affinity", "RMSD_LB", "RMSD_UB"])
            for i, row in enumerate(top_hits, 1):
                writer.writerow([i] + row)
        print(f"📊 Top {{len(top_hits)}} hits saved to: {{top_csv}}")
    else:
        print("⚠️ No scores found to write.")

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
        print(f"\\n📦 Processing chunk {{chunk_counter}}/{{total_chunks}}...")
        chunk_counter += 1
        tasks = generate_tasks(chunk, receptors)
        TOTAL_TASKS = len(tasks)
        total_tasks += TOTAL_TASKS
        print(f"🔄 Total tasks in this chunk: {{TOTAL_TASKS}}")

        with ProcessPoolExecutor(max_workers=max_workers) as pool:
            futures = [pool.submit(run_task, task, checkpoint_file, completed) for task in tasks]
            for _ in as_completed(futures):
                pass

    dur = time.time() - overall_start
    dur_minutes = dur / 60
    failed = failed_counter.value
    success = total_tasks - failed
    print(f"\\n☑️ All chunks completed. Total docking tasks processed: {{total_tasks}}")
    print(f"🟢 Success: {{success}} / {{total_tasks}}")
    print(f"🔴 Failed: {{failed}}")
    print(f"⏱️ Docking completed in {{dur:.2f}} seconds ({{dur_minutes:.2f}} minutes).")

    extract_scores()

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
    print(f"✅ Script generated and saved to: {save_path}")

    return save_path
