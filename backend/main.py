
# backend/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api import docking, file_upload
from api import docking, analysis, file_upload
from api import docking  
from api import convert
from api import validate_path
from routes.advanced_analysis import router as advanced_router

from routes import advanced_analysis
from routes.advanced_analysis import router as advanced_router
# from routes import analysis_routes
app = FastAPI(title="FrameworkVS 3.0 Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],      # allow ANY frontend origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Include routers

app.include_router(analysis.router)
app.include_router(file_upload.router, prefix="/files")
app.include_router(docking.router, prefix="/docking")
app.include_router(convert.router, prefix="/convert")
app.include_router(validate_path.router)

app.include_router(advanced_analysis.router) 
# app.include_router(analysis_routes.router)
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

