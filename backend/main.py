# backend/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import analysis, docking, file_upload, convert, validate_path
from routes.advanced_analysis import router as advanced_router

app = FastAPI(title="FrameworkVS 3.0 Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(analysis.router)
app.include_router(file_upload.router, prefix="/files")
app.include_router(docking.router, prefix="/docking")
app.include_router(convert.router, prefix="/convert")
app.include_router(validate_path.router)
app.include_router(advanced_router, prefix="/advanced")

@app.get("/")
def read_root():
    return {"message": "FrameworkVS 3.0 Backend is running!"}

@app.get("/debug/python")
def debug_python():
    import sys
    return {
        "python": sys.executable,
        "version": sys.version,
        "path": sys.path,
    }

