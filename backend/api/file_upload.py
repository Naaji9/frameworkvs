# backend/api/file_upload.py
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Query
from utils.file_converter import convert_to_pdbqt
from fastapi.responses import FileResponse
import os
import shutil



router = APIRouter()

@router.get("/download")
async def download_file(path: str = Query(...)):
    return FileResponse(path, media_type="application/octet-stream", filename="vsframework.py")



@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    file_type: str = Form(...),
    convert: bool = Form(default=True)
):
    if file_type not in ["ligand", "receptor"]:
        raise HTTPException(status_code=400, detail="Invalid file_type.")

    save_dir = f"data/{file_type}s"
    os.makedirs(save_dir, exist_ok=True)

    file_path = os.path.join(save_dir, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Convert to .pdbqt if needed
    converted_path = file_path
    if convert:
        converted_path = convert_to_pdbqt(file_path, file_type)

    return {
        "status": "success",
        "original_file": file.filename,
        "converted_path": converted_path
    }