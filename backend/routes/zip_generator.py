# backend/routes/zip_generator.py

import io
import os
import zipfile
import re
from fastapi import APIRouter, Form
from fastapi.responses import StreamingResponse, Response

# Import your existing generator functions
from utils.framework_writer import generate_optimized_docking_script
from routes.plip_writer import generate_standalone_script

router = APIRouter(prefix="/docking", tags=["Script Generation"])


def generate_readme(enable_plip: bool) -> str:
    """Generate comprehensive README.txt with installation instructions and links"""
    
    readme_content = """
================================================================================
                    MOLECULAR DOCKING SCRIPTS - README
================================================================================

CONTENTS OF THIS PACKAGE:
-------------------------
1. vsframework.py       - Main docking script using AutoDock Vina
"""
    
    if enable_plip:
        readme_content += """                          (with integrated PLIP analysis)
2. README.txt           - This file (installation & execution instructions)

NOTE: PLIP analysis runs automatically after docking completes!
"""
    else:
        readme_content += """2. README.txt           - This file (installation & execution instructions)
"""
    
    readme_content += """

================================================================================
                            INSTALLATION GUIDE
================================================================================

OPTION 1: AUTOMATIC SETUP (RECOMMENDED - Using Conda Environment)
------------------------------------------------------------------
                    USING THE CONDA ENVIRONMENT FILE
================================================================================

The environment.yml file from the github link repository includes all
necessary dependencies pre-configured for optimal compatibility.

To use it:
1. Download environment.yml from:
   https://github.com/Naaji9/environment

2. Create the environment:
   conda env create -f environment.yml

3. Activate the environment:
   conda activate envi

4. Verify installation:
   python --version
   vina --version
   obabel -V
"""
    
    if enable_plip:
        readme_content += """   plip --version
"""
    
    readme_content += """

5. You're ready to run the scripts!


OPTION 2: MANUAL INSTALLATION
------------------------------

Step 1: Install Python
   • Download Python 3.7+ from: https://www.python.org/downloads/
   • Verify installation: python3 --version

Step 2: Install Conda/Miniconda (Recommended)
   • Download from: https://docs.conda.io/en/latest/miniconda.html
   • Or Anaconda: https://www.anaconda.com/download
   • Verify: conda --version

Step 3: Install AutoDock Vina
   • Official site: https://vina.scripps.edu/downloads/
   • GitHub releases: https://github.com/ccsb-scripps/AutoDock-Vina/releases
   • Documentation: https://autodock-vina.readthedocs.io/
   
   Via conda (recommended):
   conda install -c conda-forge vina
   
   Ubuntu/Debian:
   sudo apt-get install autodock-vina
   
   From source:
   git clone https://github.com/ccsb-scripps/AutoDock-Vina.git
   cd AutoDock-Vina
   # Follow build instructions in repository
   
   Verify installation:
   vina --version

Step 4: Install Open Babel
   • Official site: https://openbabel.org/wiki/Category:Installation
   • GitHub: https://github.com/openbabel/openbabel
   • Releases: https://github.com/openbabel/openbabel/releases
   
   Via conda (recommended):
   conda install -c conda-forge openbabel
   
   Ubuntu/Debian:
   sudo apt-get install openbabel
   
   macOS (using Homebrew):
   brew install open-babel
   
   Verify installation:
   obabel -V
"""
    
    if enable_plip:
        readme_content += """
Step 5: Install PLIP (Protein-Ligand Interaction Profiler)
   • Official site: https://plip-tool.biotec.tu-dresden.de/
   • GitHub: https://github.com/pharmai/plip
   • Documentation: https://github.com/pharmai/plip/blob/master/DOCUMENTATION.md
   
   Via pip:
   pip install plip
   
   Via conda:
   conda install -c conda-forge plip
   
   From source:
   git clone https://github.com/pharmai/plip.git
   cd plip
   pip install .
   
   Verify installation:
   plip --version

Step 6: Install Required Python Packages
   pip install biopython numpy pathlib
   
   Or using conda:
   conda install -c conda-forge biopython numpy
"""
    else:
        readme_content += """
Step 5: Install Required Python Packages (if needed)
   pip install numpy pathlib
   
   Or using conda:
   conda install -c conda-forge numpy
"""
    
    readme_content += """


INCLUDED IN environment.yml:
• Python 3.9.18
• AutoDock Vina (via openbabel 3.1.1)
• Open Babel 3.1.1
"""
    
    if enable_plip:
        readme_content += """• PLIP 2.3.0
• Biopython
"""
    
    readme_content += """• NumPy, SciPy, and other scientific computing libraries
• All required dependencies


To remove the environment (if needed):
conda env remove -n envi

To update the environment:
conda env update -f environment.yml


================================================================================
                        SYSTEM REQUIREMENTS
================================================================================

MINIMUM REQUIREMENTS:
---------------------
• Operating System: Linux, macOS, or Windows (WSL recommended for Windows)
• Python: 3 or higher (3.9+ recommended)
• RAM: 4 GB minimum (8 GB+ recommended for large datasets)
• CPU: Multi-core processor (recommended for parallel processing)
• Disk Space: Varies by dataset size (minimum 1 GB free)

REQUIRED SOFTWARE:
------------------
✓ Python 3+
✓ AutoDock Vina
✓ Open Babel
"""
    
    if enable_plip:
        readme_content += """✓ PLIP (Protein-Ligand Interaction Profiler)
✓ Biopython
"""
    
    readme_content += """

RECOMMENDED:
------------
• Conda/Miniconda for package management
• Multi-core CPU for faster processing
• SSD for improved I/O performance

PYTHON PACKAGES:
• Biopython: https://biopython.org/
• NumPy: https://numpy.org/


================================================================================
                    VERIFYING YOUR INSTALLATION
================================================================================

Run these commands to verify everything is installed correctly:

1. Check Python version:
   python3 --version
   Expected: Python 3.7.x or higher

2. Check Conda (if using):
   conda --version
   Expected: conda 4.x.x or higher

3. Check AutoDock Vina:
   vina --version
   Expected: AutoDock Vina version information

4. Check Open Babel:
   obabel -V
   Expected: Open Babel version information
"""
    
    if enable_plip:
        readme_content += """
5. Check PLIP:
   plip --version
   Expected: PLIP version information

6. Check Python packages:
   python3 -c "import Bio; print('Biopython: OK')"
   python3 -c "import numpy; print('NumPy: OK')"
   Expected: Success messages for each package
"""
    else:
        readme_content += """
5. Check Python packages:
   python3 -c "import numpy; print('NumPy: OK')"
   Expected: NumPy: OK
"""
    
    readme_content += """

COMPLETE VERIFICATION (if using conda environment):
conda activate envi
python3 -c "import sys; print(f'Python {sys.version}')"
vina --version
obabel -V
"""
    
    if enable_plip:
        readme_content += """plip --version
"""
    
    readme_content += """

================================================================================
                        RUNNING THE DOCKING SCRIPT
================================================================================

BASIC USAGE:
------------
1. Activate the conda environment (if using):
   conda activate envi

2. Navigate to the directory containing vsframework.py

3. Run the script:
   python3 vsframework.py

The script will:
• Validate all required software is installed
• Process ligand and receptor files from configured paths
• Run AutoDock Vina docking simulations
"""
    
    if enable_plip:
        readme_content += """• Automatically analyze protein-ligand interactions with PLIP
• Generate comprehensive analysis reports
"""
    
    readme_content += """• Save results to the specified output directory
"""
    
    if enable_plip:
        readme_content += """• Save PLIP analysis to: [output_folder]/../plip_analysis/

PLIP ANALYSIS:
--------------
After docking completes, PLIP will automatically:
• Analyze top poses for each ligand
• Identify hydrogen bonds, hydrophobic contacts, salt bridges
• Generate detailed interaction reports
• Create visualization-ready output files
"""
    
    readme_content += """

EXPECTED RUNTIME:
-----------------
• Depends on: number of ligands, receptors, exhaustiveness setting
• Can range from minutes to hours for large datasets
• Progress is displayed in real-time

EXPECTED OUTPUT:
----------------
• Docked conformations in PDBQT format
• Scoring data and affinity predictions
• Ranking of top poses per ligand
"""
    
    if enable_plip:
        readme_content += """• PLIP interaction analysis reports (XML, TXT)
• Visualization files compatible with PyMOL, VMD
"""
    
    readme_content += """

================================================================================
                            TROUBLESHOOTING
================================================================================

COMMON ISSUES AND SOLUTIONS:

1. "Command not found" errors:
   • Ensure software is installed: which vina
   • Check PATH variable includes installation directory
   • Try with full path: /path/to/vina --version
   • For conda users: ensure environment is activated

2. Import errors for Python packages:
   • Verify installation: pip list | grep package-name
   • Reinstall: pip install --upgrade package-name
   • For conda: conda list package-name

3. Permission errors:
   • Check file permissions: ls -l vsframework.py
   • Make executable: chmod +x vsframework.py
   • Check output directory write permissions

4. Conda environment issues:
   • List environments: conda env list
   • Recreate environment:
     conda env remove -n envi
     conda env create -f environment.yml
   • Update conda: conda update -n base conda

5. AutoDock Vina not found:
   • Conda install: conda install -c conda-forge vina
   • Add to PATH or use full path in script
   • Verify: which vina

"""
    
    if enable_plip:
        readme_content += """6. PLIP analysis fails:
   • Check PLIP installation: plip --version
   • Verify input file formats (PDBQT, PDB)
   • Check output directory permissions
   • Review error messages in terminal output

"""
    
    readme_content += """



================================================================================
Generated by: COMBIVS FrameworkVS 3.0
================================================================================
"""
    
    return readme_content

def extract_plip_functions(plip_script: str) -> str:
    """Extract only function definitions from PLIP script"""
    lines = plip_script.split('\n')
    
    # Find where the main execution starts
    main_start_idx = None
    for i, line in enumerate(lines):
        if line.strip().startswith('if __name__ == "__main__":'):
            main_start_idx = i
            break
    
    # Take everything before main
    if main_start_idx:
        function_lines = lines[:main_start_idx]
    else:
        function_lines = lines
    
    # Remove shebang and initial docstrings
    result_lines = []
    docstring_count = 0
    
    for line in function_lines:
        if line.startswith('#!/usr/bin/env python'):
            continue
        if '"""' in line and docstring_count < 2:
            docstring_count += 1
            continue
        if docstring_count < 2:
            continue
        result_lines.append(line)
    
    return '\n'.join(result_lines)


def create_merged_script(vsframework_script: str, plip_script: str, 
                        receptor_folder: str, output_path: str,
                        plip_max_poses: int, plip_max_workers: int,
                        plip_analyze_top_hits_only: bool = False) -> str:
    """
    Merge PLIP into vsframework - PLIP at BOTTOM, uses docking paths
    """
    
    print("🔧 Starting merge...")
    
    # Extract PLIP functions
    plip_functions = extract_plip_functions(plip_script)
    print(f"   Extracted {len(plip_functions)} chars of PLIP code")
    
    # Rename main() to run_plip_analysis()
    plip_functions = plip_functions.replace('def main():', 'def run_plip_analysis():')

    # Inject Top Hits Filtering Logic if enabled
    if plip_analyze_top_hits_only:
        filtering_code = """
        # Separate receptors and ligands
        receptor_files, ligand_files = separate_receptors_and_ligands(all_files)

        # Filter ligands based on top_hits.csv if it exists
        top_hits_path = os.path.join(LIGAND_PATH, "top_hits.csv")
        if os.path.exists(top_hits_path):
            print(f"\\n   Filtering ligands based on: {top_hits_path}")
            try:
                top_hit_filenames = set()
                with open(top_hits_path, 'r') as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        if 'File' in row:
                            top_hit_filenames.add(row['File'])
                
                if top_hit_filenames:
                    filtered_ligands = [l for l in ligand_files if os.path.basename(l) in top_hit_filenames]
                    print(f"   Filtered {len(ligand_files)} ligands down to {len(filtered_ligands)} top hits")
                    ligand_files = filtered_ligands
                else:
                    print("  ⚠️  No 'File' column found in top_hits.csv, using all ligands")
            except Exception as e:
                print(f"  ⚠️  Error reading top_hits.csv: {e}, using all ligands")
        else:
            print(f"\\n  ℹ️  No top_hits.csv found at {top_hits_path}, processing all ligands")
"""
        # Replace the standard separation logic with the filtered one
        plip_functions = plip_functions.replace(
            '        # Separate receptors and ligands\n        receptor_files, ligand_files = separate_receptors_and_ligands(all_files)',
            filtering_code
        )
    
    # Remove PLIP's hardcoded config
    plip_functions = re.sub(
        r'RECEPTOR_PATH = r".*?"\nLIGAND_PATH = r".*?"\nOUTPUT_FOLDER = r".*?"',
        '',
        plip_functions
    )
    plip_functions = re.sub(r'MAX_POSES = \d+\nMAX_WORKERS = \d+', '', plip_functions)
    plip_functions = re.sub(r'REMOVE_WATERS = \w+\nREMOVE_IONS = \w+', '', plip_functions)
    plip_functions = re.sub(r'ADD_HYDROGENS = \w+\nKEEP_HETERO = \w+', '', plip_functions)
    
    # PLIP config flag (goes after docking config)
    plip_config = f"""
ENABLE_PLIP = True
PLIP_MAX_POSES = {plip_max_poses}
PLIP_MAX_WORKERS = {plip_max_workers}
PLIP_ANALYZE_TOP_HITS_ONLY = {plip_analyze_top_hits_only}
"""
    timing_globals = """

# Timing trackers
DOCKING_START_TIME = None
DOCKING_END_TIME = None
PLIP_START_TIME = None
PLIP_END_TIME = None
"""    
    # PLIP runner (uses docking paths)
    plip_runner = """

# ============================================================================
# PLIP ANALYSIS - RUNS AUTOMATICALLY AFTER DOCKING
# ============================================================================

def run_plip_if_enabled():
    \"\"\"Run PLIP using docking paths\"\"\"
    global PLIP_START_TIME, PLIP_END_TIME, DOCKING_START_TIME, DOCKING_END_TIME
    
    if not ENABLE_PLIP:
        return
    
    PLIP_START_TIME = time.time()
     
    # Use docking paths
    plip_receptor = receptor_folder
    plip_ligand = output_path
    plip_output = os.path.join(os.path.dirname(output_path.rstrip('/')), 'plip_analysis')
    
    print("\\n" + "="*80)
    print(" DOCKING COMPLETED - STARTING PLIP")
    print("="*80)
    print(f"Receptor: {plip_receptor}")
    print(f"Ligand: {plip_ligand}")
    print(f"Output: {plip_output}")
    print("="*80)
    
    try:
        globals()['RECEPTOR_PATH'] = plip_receptor
        globals()['LIGAND_PATH'] = plip_ligand
        globals()['OUTPUT_FOLDER'] = plip_output
        globals()['MAX_POSES'] = PLIP_MAX_POSES
        globals()['MAX_WORKERS'] = PLIP_MAX_WORKERS
        globals()['REMOVE_WATERS'] = False
        globals()['REMOVE_IONS'] = False
        globals()['ADD_HYDROGENS'] = True
        globals()['KEEP_HETERO'] = True
        
        run_plip_analysis()
        
        
        PLIP_END_TIME = time.time()
        
        # Calculate times
        docking_time = DOCKING_END_TIME - DOCKING_START_TIME if DOCKING_START_TIME and DOCKING_END_TIME else 0
        plip_time = PLIP_END_TIME - PLIP_START_TIME if PLIP_START_TIME and PLIP_END_TIME else 0
        total_time = docking_time + plip_time
        
        print("\\n" + "="*80)
        print("✓ PLIP COMPLETED!")
        print("="*80)
        print(f"⏱  Docking Time: {docking_time:.2f}s ({docking_time/60:.2f} min)")
        print(f"⏱  PLIP Time: {plip_time:.2f}s ({plip_time/60:.2f} min)")
        print(f"⏱  Total Time (Docking + PLIP): {total_time:.2f}s ({total_time/60:.2f} min)")
        print("="*80)
    except Exception as e:
        print(f"\\n⚠️ PLIP failed: {e}")
        import traceback
        traceback.print_exc()
"""
    
    lines = vsframework_script.split('\n')
    
    # Find if __name__ == "__main__":
    main_idx = None
    for i, line in enumerate(lines):
        if 'if __name__ == "__main__":' in line:
            main_idx = i
            break
    
    # Build merged script
    merged_lines = []
    
    # Part 1: Docking code (everything before if __name__)
    if main_idx:
        merged_lines.extend(lines[:main_idx])
    else:
        merged_lines.extend(lines)
    
    # Insert ENABLE_PLIP after output_path
    merged_temp = '\n'.join(merged_lines)
    if 'os.makedirs(output_path, exist_ok=True)' in merged_temp:
        merged_temp = merged_temp.replace(
            'os.makedirs(output_path, exist_ok=True)',
            'os.makedirs(output_path, exist_ok=True)' + plip_config + timing_globals
        )
    merged_lines = merged_temp.split('\n')
    
    # Part 2: Add PLIP at bottom (before if __name__)
    merged_lines.append('\n')
    merged_lines.append('# ============================================================================')
    merged_lines.append('# EMBEDDED PLIP - AUTO-RUNS AFTER DOCKING')
    merged_lines.append('# ============================================================================')
    merged_lines.append(plip_functions)
    merged_lines.append(plip_runner)
    merged_lines.append('\n')
    
    # Inject timing code into run() function
    merged_script_lines = '\n'.join(merged_lines)
    
    # Add timing start to run() function
    merged_script_lines = merged_script_lines.replace(
        'def run():\n    global TOTAL_TASKS, failed_counter',
        'def run():\n    global TOTAL_TASKS, failed_counter, DOCKING_START_TIME, DOCKING_END_TIME\n    DOCKING_START_TIME = time.time()'
    )
    
    # Add timing end after docking
    merged_script_lines = merged_script_lines.replace(
        '    dur = time.time() - overall_start',
        '    dur = time.time() - overall_start\n    DOCKING_END_TIME = time.time()'
    )
    
    merged_lines = merged_script_lines.split('\n')
    
    # Part 3: Add if __name__
    
    # Part 3: Add if __name__
    if main_idx:
        merged_lines.extend(lines[main_idx:])
    
    merged_script = '\n'.join(merged_lines)
    
    # FIX: Remove the broken line "def extract_scores()\n    run_plip_if_enabled():"
    merged_script = re.sub(
        r'def extract_scores\(\)\s+run_plip_if_enabled\(\):',
        'def extract_scores():',
        merged_script
    )
    
    # Insert run_plip_if_enabled() after extract_scores() in the run() function
    merged_script = merged_script.replace(
        '    extract_scores()\n    run_plip_if_enabled()',
        '    extract_scores()'
    )
    merged_script = merged_script.replace(
        '    extract_scores()',
        '    extract_scores()\n    run_plip_if_enabled()'
    )
    
    print(f"✅ Merge complete: {len(merged_script)} chars")
    
    return merged_script



@router.post("/generate-script")
async def generate_single_script(
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
    user_cpu: int = Form(0),
    vina_cores: int = Form(1),
    topbest: int = Form(10),
    chunk_mode: str = Form("no"),
    max_workers: int = Form(1),
    output_path: str = Form(...),
    blind_docking: bool = Form(False),
    enable_plip: str = Form(False),
    plip_max_poses: int = Form(5),
    plip_max_workers: int = Form(4),
    plip_remove_waters: bool = Form(False),
    plip_remove_ions: bool = Form(False),
    plip_add_hydrogens: bool = Form(True),
    plip_keep_hetero: bool = Form(True),
    plip_analyze_top_hits_only: str = Form("false"),
):
    """Generate vsframework.py with embedded PLIP"""
    
    print(f"🔍 enable_plip = {enable_plip}")
    
    # Generate base docking script (NO PLIP)
    vsframework_script = generate_optimized_docking_script(
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
        enable_plip=enable_plip,
        return_as_text=True
    )
    
    print(f"✅ Base script: {len(vsframework_script)} chars")
    
    # Merge PLIP if enabled
    if enable_plip:
        print("🔬 Merging PLIP...")
        
        plip_output_path = os.path.join(os.path.dirname(output_path.rstrip('/')), 'plip_analysis')
        
        plip_script = generate_standalone_script(
            receptor_path=receptor_folder,
            ligand_path=output_path,
            output_folder=plip_output_path,
            max_poses=plip_max_poses,
            max_workers=plip_max_workers,
            remove_waters=plip_remove_waters,
            remove_ions=plip_remove_ions,
            add_hydrogens=plip_add_hydrogens,
            keep_hetero=plip_keep_hetero
        )
        
        vsframework_script = create_merged_script(
            vsframework_script, 
            plip_script,
            receptor_folder,
            output_path,
            plip_max_poses,
            plip_max_workers,
            plip_analyze_top_hits_only.lower() == "true" if isinstance(plip_analyze_top_hits_only, str) else plip_analyze_top_hits_only
        )
        
        print(f"✅ Merged: {len(vsframework_script)} chars")
    
    return Response(
        content=vsframework_script,
        media_type="text/plain",
        headers={"Content-Disposition": "attachment; filename=vsframework.py"}
    )


@router.post("/generate-scripts-zip")
async def generate_scripts_zip(
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
    user_cpu: int = Form(0),
    vina_cores: int = Form(1),
    topbest: int = Form(10),
    chunk_mode: str = Form("no"),
    max_workers: int = Form(1),
    output_path: str = Form(...),
    blind_docking: bool = Form(False),
    enable_plip: str = Form("false"),
    plip_max_poses: int = Form(5),
    plip_max_workers: int = Form(4),
    plip_remove_waters: str = Form("false"),
    plip_remove_ions: str = Form("false"),
    plip_add_hydrogens: str = Form("true"),
    plip_keep_hetero: str = Form("true"),
    plip_analyze_top_hits_only: str = Form("false"),
):
    # Convert strings to booleans
    enable_plip_bool = enable_plip.lower() == "true"
    plip_remove_waters_bool = plip_remove_waters.lower() == "true"
    plip_remove_ions_bool = plip_remove_ions.lower() == "true"
    plip_add_hydrogens_bool = plip_add_hydrogens.lower() == "true"
    plip_keep_hetero_bool = plip_keep_hetero.lower() == "true"
    plip_analyze_top_hits_only_bool = plip_analyze_top_hits_only.lower() == "true"
    
    """Generate ZIP with vsframework.py (+ PLIP if enabled) and README"""
    print(f"🔍 enable_plip = {enable_plip}")
    
    
    print(f"🔍 enable_plip = {enable_plip}")
    
    # Generate base docking script (NO PLIP)
    vsframework_script = generate_optimized_docking_script(
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
        enable_plip=False,  # Always False - we merge manually
        return_as_text=True
    )
    
    print(f"✅ Base script: {len(vsframework_script)} chars")
    
    # Merge PLIP if enabled
    if enable_plip:
        print("🔬 Merging PLIP...")
        
        plip_output_path = os.path.join(os.path.dirname(output_path.rstrip('/')), 'plip_analysis')
        
        plip_script = generate_standalone_script(
            receptor_path=receptor_folder,
            ligand_path=output_path,
            output_folder=plip_output_path,
            max_poses=plip_max_poses,
            max_workers=plip_max_workers,
            remove_waters=plip_remove_waters,
            remove_ions=plip_remove_ions,
            add_hydrogens=plip_add_hydrogens,
            keep_hetero=plip_keep_hetero
        )
        
        vsframework_script = create_merged_script(
            vsframework_script, 
            plip_script,
            receptor_folder,
            output_path,
            plip_max_poses,
            plip_max_workers,
            plip_analyze_top_hits_only.lower() == "true" if isinstance(plip_analyze_top_hits_only, str) else plip_analyze_top_hits_only
        )
        
        print(f"✅ Merged: {len(vsframework_script)} chars")
    
    # Generate README
    readme_content = generate_readme(enable_plip)
    
    # Create ZIP
    zip_buffer = io.BytesIO()
    
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        zip_file.writestr("README.txt", readme_content)
        zip_file.writestr("vsframework.py", vsframework_script)
    
    zip_buffer.seek(0)
    
    print("📦 ZIP created")
    
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=docking_scripts.zip"}
    )
