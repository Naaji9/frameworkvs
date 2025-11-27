export default function AlignReceptors() {
  const [files, setFiles] = useState([]);
  const [message, setMessage] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');

  const handleFilesChange = (e) => {
    setFiles(e.target.files);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (files.length < 2) {
      setMessage('Please upload at least two receptor files.');
      return;
    }

    const formData = new FormData();
    for (let file of files) {
      formData.append('receptor_files', file);
    }
    formData.append('output_folder', 'aligned_receptors');

    setMessage('Aligning receptors, please wait...');

    try {
      const response = await fetch('/api/advanced/align-receptors', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Alignment failed');

      const data = await response.json();
      setDownloadUrl(data.download_url);
      setMessage('Alignment complete! Download below.');
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-2">Align Receptors</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="file"
          multiple
          accept=".pdb,.pdbqt"
          onChange={handleFilesChange}
          webkitdirectory="true"
          directory=""
          mozdirectory=""
        />
        <button type="submit" className="mt-4 bg-blue-500 text-white px-4 py-2 rounded">
          Align
        </button>
      </form>
      {message && <p className="mt-4">{message}</p>}
      {downloadUrl && (
        <a
          href={downloadUrl}
          className="text-blue-600 underline"
          download
          target="_blank"
          rel="noopener noreferrer"
        >
          Download Aligned Receptors
        </a>
      )}
    </div>
  );
}
