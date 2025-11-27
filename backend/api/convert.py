from fastapi import APIRouter, UploadFile, File, Form
from fastapi.responses import JSONResponse
import subprocess, os, tempfile

router = APIRouter()

@router.post("/convert-to-pdbqt")
async def convert_to_pdbqt(file: UploadFile = File(...), base_path: str = Form(...)):
    try:
        ext = os.path.splitext(file.filename)[-1].lower()
        if ext not in [".pdb", ".mol2", ".sdf", ".cif"]:
            return JSONResponse(status_code=400, content={"detail": "Unsupported file format"})

        input_path = os.path.join(tempfile.gettempdir(), file.filename)
        output_path = os.path.join(base_path, os.path.splitext(file.filename)[0] + ".pdbqt")

        with open(input_path, "wb") as f:
            f.write(await file.read())

        cmd = ["obabel", input_path, "-O", output_path]
        subprocess.run(cmd, check=True)

        return {"status": "success", "converted_path": output_path}

    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})
