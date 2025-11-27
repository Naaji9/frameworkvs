

```markdown
# FrameworkVS 3.0

FrameworkVS 3.0 is a bioinformatics framework for automating molecular docking simulations and protein-ligand interaction analysis.  
It supports batch docking, interactive grid box configuration, and 3D molecular visualization.

---

## 📥 How to Install and Run

### 1. Download the Project

- Go to [FrameworkVS-3.0 GitHub page](https://github.com/combilab-furg/FrameworkVS-3.0)
- Click the green **"Code"** button → **"Download ZIP"**
- Extract the ZIP file to any folder on your computer

---

## 🖥️ Requirements

Make sure you have:

- **Python 3.8+**
- **Node.js (v16 or higher)** and **npm**
- **Open Babel** – for file format conversion


---

## 🖥️ Linux or Windows Setup

1. Open a terminal or command prompt
2. Navigate to the extracted project folder:

```bash
cd path/to/FrameworkVS-3.0
```
```bash
cd backend/
```
3. Install Python dependencies:

```bash
pip install -r requirements.txt
```

4. Install frontend dependencies:
```bash
cd frontend/
```
for windows
Press Windows + R, type cmd, hit Enter. 

```bash
npm install
```

5. Start both backend and frontend:

```bash
npm run start-all
```

---

## 🧪 Access the App

Once running, open your browser and go to:

```
http://localhost:5173
```

You'll be able to:
- Upload ligands and receptors
- Define grid box parameters
- Generate docking scripts
- Run (and later analyze) docking workflows

---





