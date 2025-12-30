# backend/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api import docking, analysis, file_upload, validate_path
from routes import rfl_score_routes, advanced_analysis, plip_writer, zip_generator 

app = FastAPI(title="FrameworkVS 3.0 Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(analysis.router)
app.include_router(file_upload.router, prefix="/files")
app.include_router(docking.router, prefix="/docking")

app.include_router(validate_path.router)
app.include_router(rfl_score_routes.router) 
app.include_router(plip_writer.router)
app.include_router(zip_generator.router)
app.include_router(advanced_analysis.router, prefix="/advanced")

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
