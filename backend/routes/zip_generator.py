# backend/routes/zip_generator.py

import io
import zipfile
from fastapi import APIRouter, Form
from fastapi.responses import StreamingResponse, Response
from typing import Optional

# Import your existing generator functions
from utils.framework_writer import generate_optimized_docking_script
from routes.plip_writer import generate_standalone_script

router = APIRouter(prefix="/docking", tags=["Script Generation"])


def generate_readme(enable_plip: bool) -> str:
    """Generate README.txt with execution instructions"""
    
    readme_content = """
================================================================================
                    MOLECULAR DOCKING SCRIPTS - README
================================================================================

CONTENTS OF THIS PACKAGE:
-------------------------
1. vsframework.py       - Main docking script using AutoDock Vina
"""
    
    if enable_plip:
        readme_content += """2. plip_analysis.py     - Protein-ligand interaction analysis script
3. README.txt           - This file (execution instructions)
"""
    else:
        readme_content += """2. README.txt           - This file (execution instructions)
"""
    
    readme_content += """

================================================================================
                            SYSTEM REQUIREMENTS
================================================================================

REQUIRED SOFTWARE:
------------------
1. Python 3.7 or higher
2. AutoDock Vina (installed and accessible via command line)
3. Open Babel (for molecular file format conversions)
4. Required Python packages:
   - pathlib
   - concurrent.futures (built-in)
"""
    
    if enable_plip:
        readme_content += """   - plip (for interaction analysis)
   - biopython (for structure manipulation)
"""
    
    readme_content += """
INSTALLATION OPTIONS:
---------------------

OPTION 1 - RECOMMENDED (Using Conda Environment):
--------------------------------------------------
This is the easiest way to install all dependencies at once!

1. Download the environment.yml file from:
   https://github.com/Naaji9/FrameworkVS-3.0

2. Create the conda environment:
   conda env create -f environment.yml

3. Activate the environment:
   conda activate frameworkvs

This will install Python, AutoDock Vina, Open Babel, PLIP, and all 
required packages automatically!


OPTION 2 - MANUAL INSTALLATION:
--------------------------------
If you prefer to install dependencies individually:

1. Install AutoDock Vina:
   Visit: https://vina.scripps.edu/downloads/

2. Install Open Babel:
   conda install -c conda-forge openbabel
   OR
   Visit: http://openbabel.org/wiki/Category:Installation

3. Install Python packages:
   pip install biopython
"""
    
    if enable_plip:
        readme_content += """   pip install plip
"""
    
    readme_content += """
4. Verify installations:
   vina --help
   obabel --help

================================================================================
                        STEP 1: RUNNING DOCKING
================================================================================

COMMAND:
--------
Option 1 (If using conda environment):
   conda activate frameworkvs
   python vsframework.py

Option 2 (If using system Python):
   python vsframework.py

WHAT IT DOES:
-------------
- Reads ligands from your specified ligand folder
- Reads receptors from your specified receptor folder
- Performs molecular docking using AutoDock Vina
- Generates docked poses with binding affinity scores
- Saves results to your specified output folder

OUTPUT STRUCTURE:
-----------------
output_folder/
├── receptor1/
│   ├── ligand1_out.pdbqt
│   ├── ligand2_out.pdbqt
│   └── ...
├── receptor2/
│   └── ...
└── summary_results.csv (binding scores and statistics)

IMPORTANT NOTES:
----------------
- Make sure your ligand and receptor paths are correctly set in the script
- The script will create output directories automatically
- Docking may take considerable time depending on the number of ligands
- Monitor the console output for progress updates
"""
    
    if enable_plip:
        readme_content += """

================================================================================
                   STEP 2: PLIP ANALYSIS (RUNS AUTOMATICALLY)
================================================================================

✅ AUTOMATIC EXECUTION: PLIP analysis runs automatically after docking completes!

HOW IT WORKS:
-------------
When you run vsframework.py, it will:
1. Complete all docking calculations
2. Automatically trigger plip_analysis.py
3. Analyze protein-ligand interactions from docked poses

NO MANUAL INTERVENTION NEEDED!

WHAT PLIP DOES:
---------------
- Analyzes protein-ligand interactions from docked poses
- Identifies hydrogen bonds, hydrophobic contacts, salt bridges, etc.
- Generates detailed interaction reports
- Uses the OUTPUT from docking as INPUT

WORKFLOW:
---------
1. vsframework.py creates docked poses → output_folder/
2. vsframework.py automatically calls plip_analysis.py
3. plip_analysis.py reads from → output_folder/
4. plip_analysis.py saves results to → output_folder/plip_analysis/

OUTPUT STRUCTURE:
-----------------
output_folder/plip_analysis/
├── receptor1/
│   ├── ligand1_pose1
│   ├── ligand1_pose2
│   ├── ligand2_pose3
│   └── ...
├── receptor2/
│   └── ...
└── plip_summary.csv (aggregated interaction data)

INTERACTION TYPES DETECTED:
----------------------------
- Hydrogen bonds
- Hydrophobic contacts
- Salt bridges
- π-stacking interactions
- Halogen bonds
- Water bridges (if water molecules present)
- Metal complexes

IMPORTANT NOTES:
----------------
- Automatically runs after docking completes
- Will analyze up to the specified number of poses per ligand
- May take additional time depending on the number of complexes
- Generates both text reports and JSON data for further analysis
- The plip_analysis.py script is included for reference or manual re-runs
"""
    
    readme_content += """

================================================================================
                            EXECUTION WORKFLOW
================================================================================

"""
    
    if enable_plip:
        readme_content += """COMPLETE WORKFLOW WITH PLIP:
-----------------------------
1. Run: python vsframework.py
   → Performs all docking calculations
   → Automatically runs PLIP analysis after docking completes
   → Wait for full completion (may take hours for large datasets)
   
2. Check results:
   → Docked poses: output_folder/
   → PLIP interactions: output_folder/plip_analysis/

3. Analyze results using the generated CSV files

NOTE: You only need to run vsframework.py - it handles everything!
      The plip_analysis.py file is included for reference or manual re-runs.
"""
    else:
        readme_content += """DOCKING-ONLY WORKFLOW:
----------------------
1. Run: python vsframework.py
   → Wait for completion (may take hours for large datasets)
   → Check output_folder/ for docked poses

2. Analyze results using the generated summary CSV file
"""
    
    readme_content += """

================================================================================
                            TROUBLESHOOTING
================================================================================

COMMON ISSUES:
--------------

1. "vina: command not found" or "obabel: command not found"
   → AutoDock Vina or Open Babel is not installed or not in PATH
   → Solution: Use the conda environment (Option 1) or install manually
   → If using conda: conda activate frameworkvs

2. "No such file or directory" errors
   → Check that ligand_folder and receptor_folder paths are correct
   → Ensure paths use forward slashes (/) or proper escaping

3. "Permission denied" errors
   → Ensure you have write permissions for the output folder
   → Run with appropriate user permissions

"""
    
    if enable_plip:
        readme_content += """4. "Module 'plip' not found"
   → PLIP is not installed
   → Solution: pip install plip (or use conda environment)

5. PLIP finds no docked poses
   → Wait for vsframework.py to fully complete (it runs PLIP automatically)
   → Check console output for any PLIP-related errors
   → Verify .pdbqt files exist in the output folder
   → You can manually run plip_analysis.py if needed

"""
    
    readme_content += """
PERFORMANCE TIPS:
-----------------
- Use multiple CPU cores (configured in the scripts)
- Process ligands in chunks for very large datasets
- Monitor system resources during execution
- Consider running on HPC clusters for large-scale screening

================================================================================
                              SUPPORT
================================================================================

For issues or questions:
- Check script console output for error messages
- Verify all dependencies are installed correctly
- Ensure input file formats are correct (PDBQT for Vina)
- Review AutoDock Vina documentation for docking parameters

================================================================================
                         GENERATED PARAMETERS
================================================================================

Review the actual parameter values at the top of each Python script.
Modify them if needed before running the scripts.

"""
    
    readme_content += """
Generated on: [Auto-generated by COMBIVS]
Frameworkvs : 3.0

================================================================================
"""
    
    return readme_content


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
    # PLIP parameters (ignored for single file, but needed for buildFormData)
    enable_plip: bool = Form(False),
    plip_max_poses: int = Form(5),
    plip_max_workers: int = Form(4),
    plip_remove_waters: bool = Form(False),
    plip_remove_ions: bool = Form(False),
    plip_add_hydrogens: bool = Form(True),
    plip_keep_hetero: bool = Form(True),
):
    """Generate only vsframework.py as a single file download"""
    
    # Generate vsframework.py using your existing writer
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
    
    # Return as plain text file
    return Response(
        content=vsframework_script,
        media_type="text/plain",
        headers={
            "Content-Disposition": "attachment; filename=vsframework.py"
        }
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
    # PLIP parameters
    enable_plip: bool = Form(False),
    plip_max_poses: int = Form(5),
    plip_max_workers: int = Form(4),
    plip_remove_waters: bool = Form(False),
    plip_remove_ions: bool = Form(False),
    plip_add_hydrogens: bool = Form(True),
    plip_keep_hetero: bool = Form(True),
):
    """Generate both vsframework.py and plip_analysis.py as ZIP"""
    
    # Generate vsframework.py using your existing writer
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
    
    # Generate README content
    readme_content = generate_readme(enable_plip)
    
    # Create ZIP in memory
    zip_buffer = io.BytesIO()
    
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        # Add README first for better UX
        zip_file.writestr("README.txt", readme_content)
        
        # Add vsframework.py
        zip_file.writestr("vsframework.py", vsframework_script)
        
        # Add plip script if enabled
        if enable_plip:
            # Create PLIP subfolder path
            plip_output = output_path.rstrip('/') + "/plip_analysis"
            
            plip_script = generate_standalone_script(
                receptor_path=receptor_folder,      # Same receptor as docking
                ligand_path=output_path,            # Docking OUTPUT becomes PLIP input ✅
                output_folder=plip_output,          # PLIP results go to subfolder ✅
                max_poses=plip_max_poses,
                max_workers=plip_max_workers,
                remove_waters=plip_remove_waters,
                remove_ions=plip_remove_ions,
                add_hydrogens=plip_add_hydrogens,
                keep_hetero=plip_keep_hetero
            )
            zip_file.writestr("plip_analysis.py", plip_script)
    
    zip_buffer.seek(0)
    
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=docking_scripts.zip"}
    )
