from fastapi import APIRouter, HTTPException, UploadFile, File, Query, Form
from fastapi.responses import FileResponse
from pathlib import Path
from urllib.parse import unquote
import shutil, uuid, subprocess
# import pymol2 
from pydantic import BaseModel
import os
from core.plip_runner import run_plip_batch
from core.plip_parser import parse_xml_file


from core.plip_runner import run_plip_batch
from core.plip_parser import parse_xml_file

router = APIRouter()

# ... (all other routes remain unchanged) ...

# @router.post("/advanced/align-receptors")
# async def align_receptors(
#     receptor_files: list[UploadFile] = File(...),
#     output_folder: str = Form(...)
# ):
#     # Save uploaded files
#     saved_paths = []
#     os.makedirs(output_folder, exist_ok=True)
#     for file in receptor_files:
#         file_path = os.path.join(output_folder, file.filename)
#         with open(file_path, "wb") as f:
#             f.write(await file.read())
#         saved_paths.append(file_path)

#     # Align receptors using PyMOL
#     with pymol2.PyMOL() as pymol:
#         pymol.cmd.load(saved_paths[0], "ref")  # first file is reference
#         for path in saved_paths[1:]:
#             pymol.cmd.load(path, os.path.basename(path))
#             pymol.cmd.align(os.path.basename(path), "ref")

#         # Save aligned files
#         for path in saved_paths:
#             obj_name = os.path.basename(path)
#             aligned_path = os.path.join(output_folder, f"aligned_{obj_name}")
#             pymol.cmd.save(aligned_path, obj_name)

#     # Zip and return download URL
#     zip_path = shutil.make_archive(output_folder, 'zip', output_folder)
#     return {"download_url": f"/download/{os.path.basename(zip_path)}"}

class ScoringRequest(BaseModel):
    results_path: str
    scoring_method: str
    output_folder: str

@router.get("/advanced/scoring/results")
def get_scoring_results(path: str):
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path, media_type="text/csv", filename=os.path.basename(path))

@router.get("/advanced/scoring/csv")
def get_scores_csv(folder: str = Query(...), file: str = Query(...)):
    csv_path = os.path.join(folder, file)
    if os.path.exists(csv_path):
        return FileResponse(csv_path, media_type="text/csv", filename=file)
    return {"detail": "CSV file not found"}

@router.post("/advanced/scoring")
def run_scoring(data: ScoringRequest):
    results_path = data.results_path
    scoring_method = data.scoring_method
    output_folder = data.output_folder

    if not all([results_path, scoring_method, output_folder]):
        raise HTTPException(status_code=400, detail="All fields are required.")

    if not os.path.exists(results_path):
        raise HTTPException(status_code=400, detail=f"Results path does not exist: {results_path}")

    os.makedirs(output_folder, exist_ok=True)

    try:
        if scoring_method == "vina":
            score_file = os.path.join(output_folder, "vina_scores.csv")
            with open(score_file, "w") as f_out:
                f_out.write("Ligand,Affinity,RMSD_LB,RMSD_UB\n")
                for root, _, files in os.walk(results_path):
                    for file in files:
                        if file.endswith((".log", ".txt", ".pdbqt")):
                            path = os.path.join(root, file)
                            with open(path) as f_in:
                                for line in f_in:
                                    if "REMARK VINA RESULT" in line:
                                        parts = line.strip().split()
                                        if len(parts) >= 6:
                                            score, rmsd_lb, rmsd_ub = parts[3:6]
                                            f_out.write(f"{file},{score},{rmsd_lb},{rmsd_ub}\n")
                                        break
                                    elif line.strip() and len(line.strip().split()) >= 4:
                                        parts = line.strip().split()
                                        if parts[0].isdigit():
                                            f_out.write(f"{file},{parts[1]},0.000,0.000\n")
                                            break

        elif scoring_method == "rfscore":
            script_path = os.path.join(os.path.dirname(__file__), "../ml_models/run_rfscore.py")
            subprocess.run([
                "python3", script_path,
                "--input", results_path,
                "--output", output_folder
            ], check=True)

        elif scoring_method == "gnina":
            subprocess.run([
                "gnina", "--score_only",
                "--receptor", os.path.join(results_path, "receptor.pdbqt"),
                "--ligand", os.path.join(results_path, "ligand.pdbqt"),
                "--out", os.path.join(output_folder, "gnina_scores.sdf")
            ], check=True)

        else:
            raise HTTPException(status_code=400, detail=f"Unknown scoring method: {scoring_method}")

        return {"message": f"Scoring complete. Results saved to: {output_folder}"}

    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Scoring failed: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")



@router.post("/advanced/plip-batch")
def run_plip_batch_analysis(
    receptor_folder: str = Form(...),
    ligand_folder: str = Form(...),
    output_folder: str = Form(...)
):
    try:
        # Step 1: Run PLIP for all ligand–receptor pairs
        plip_results = run_plip_batch(
            receptor_folder=receptor_folder,
            ligand_folder=ligand_folder,
            output_folder=output_folder
        )

        # Step 2: Parse each XML output
        parsed_data = []
        for result in plip_results:
            parsed = parse_xml_file(result["xml"])
            parsed.update({
                "receptor": result["receptor"],
                "ligand": result["ligand"]
            })
            parsed_data.append(parsed)

        return {
            "message": "Batch PLIP analysis complete.",
            "count": len(parsed_data),
            "results": parsed_data
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/advanced/plip-report")
def download_plip_report(path: str = Query(..., description="Path to the PLIP XML")):
    path = unquote(path)
    file_path = Path(path)
    if not file_path.is_file():
        file_path = Path.cwd() / path
    if not file_path.is_file():
        raise HTTPException(
            status_code=404,
            detail=f"Report not found. Tried:\n • {path}\n • {file_path}"
        )
    return FileResponse(
        str(file_path),
        media_type="application/xml",
        filename=file_path.name
    )


@router.post("/advanced/plip")
async def run_plip_analysis(
    ligand: UploadFile = File(...),
    receptor: UploadFile = File(...),
    output_folder: str = Form(...)
):
    try:
        temp_dir = Path("tmp_plip")
        temp_dir.mkdir(exist_ok=True)
        ligand_path = temp_dir / f"{uuid.uuid4()}_{ligand.filename}"
        receptor_path = temp_dir / f"{uuid.uuid4()}_{receptor.filename}"
        with open(ligand_path, "wb") as f:
            shutil.copyfileobj(ligand.file, f)
        with open(receptor_path, "wb") as f:
            shutil.copyfileobj(receptor.file, f)

        from core.plip_runner import run_plip
        xml_report = run_plip(
            receptor_path=str(receptor_path),
            ligand_path=str(ligand_path),
            output_folder=output_folder
        )

        return {
            "message": "PLIP analysis complete.",
            "report": xml_report
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/advanced/run-vsframework")
async def run_vsframework_script(script: UploadFile = File(...)):
    tmp_dir = Path("tmp_scripts")
    tmp_dir.mkdir(exist_ok=True)
    unique_name = f"{uuid.uuid4()}_{script.filename}"
    script_path = tmp_dir / unique_name

    content = await script.read()
    script_path.write_bytes(content)

    try:
        result = subprocess.run(
            ["python3", str(script_path)],
            capture_output=True,
            text=True,
            check=True
        )
        output = result.stdout or "Script executed successfully."
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=e.stderr or "Script failed")

    try:
        script_path.unlink()
    except OSError:
        pass

    return {"message": output, "output": output}

