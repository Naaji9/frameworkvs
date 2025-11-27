import os
import tempfile
import zipfile
from flask import Flask, request, jsonify, send_file
from pymol import cmd

app = Flask(__name__)

@app.route('/api/align_receptors', methods=['POST'])
def align_receptors():
    files = request.files.getlist('receptors')
    if len(files) < 2:
        return jsonify({'error': 'Upload at least two receptor files'}), 400

    with tempfile.TemporaryDirectory() as tmpdir:
        file_paths = []
        for f in files:
            path = os.path.join(tmpdir, f.filename)
            f.save(path)
            file_paths.append(path)

        # Start PyMOL in API mode
        cmd.reinitialize()

        # Load first receptor as reference
        ref_name = 'ref'
        cmd.load(file_paths[0], ref_name)

        aligned_files = []
        for i, path in enumerate(file_paths[1:], start=1):
            name = f'rec_{i}'
            cmd.load(path, name)

            # Align current receptor to reference
            cmd.align(name, ref_name)

            # Save aligned receptor
            aligned_path = os.path.join(tmpdir, f'aligned_{os.path.basename(path)}')
            cmd.save(aligned_path, name)
            aligned_files.append(aligned_path)

            # Remove object from PyMOL session to avoid clutter
            cmd.delete(name)

        # Also save the reference receptor as aligned_0
        aligned_ref_path = os.path.join(tmpdir, f'aligned_{os.path.basename(file_paths[0])}')
        cmd.save(aligned_ref_path, ref_name)
        aligned_files.insert(0, aligned_ref_path)

        # Package all aligned files into a zip
        zip_path = os.path.join(tmpdir, 'aligned_receptors.zip')
        with zipfile.ZipFile(zip_path, 'w') as zipf:
            for filepath in aligned_files:
                zipf.write(filepath, arcname=os.path.basename(filepath))

        # For simplicity, send the zip file directly
        return send_file(zip_path, as_attachment=True, download_name='aligned_receptors.zip')

if __name__ == '__main__':
    app.run(debug=True)
