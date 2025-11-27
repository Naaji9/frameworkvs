from fastapi import APIRouter
import os

router = APIRouter()

@router.get("/validate-path")
async def validate_path(path: str):
    try:
        if not path or path.strip() == "":
            return {"valid": False, "reason": "Empty path", "bad_part": path}

        forbidden = ['?', '*', '<', '>', '"']
        for c in forbidden:
            if c in path:
                return {
                    "valid": False,
                    "reason": f"Invalid character '{c}'",
                    "bad_part": c
                }

        norm = os.path.normpath(path)

        if norm == "/":
            return {"valid": True, "reason": "Root directory", "bad_part": ""}

        parts = norm.split(os.sep)
        current = "/"

        for part in parts:
            if not part.strip():
                continue

            current = os.path.join(current, part)

            if not os.path.exists(current):
                return {
                    "valid": False,
                    "reason": "Folder or file does not exist",
                    "bad_part": part
                }

        return {"valid": True, "reason": "OK", "bad_part": ""}

    except Exception as e:
        return {
            "valid": False,
            "reason": "Backend error",
            "bad_part": "",
            "details": str(e)
        }

