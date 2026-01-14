import React, { useState, useRef, useEffect } from 'react';


export default function DocumentationPage() {
  const [expandedSections, setExpandedSections] = useState(['getting-started']);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState('home');
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Focus input when chat opens
  useEffect(() => {
    if (chatOpen) {
      inputRef.current?.focus();
    }
  }, [chatOpen]);

  const toggleSection = (id) => {
    setExpandedSections(prev => 
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const sendMessage = async () => {
    if (!userInput.trim() || isLoading) return;

    const userMessage = userInput.trim();
    setUserInput('');
    
    // Add user message
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      // Build context about current page/section
      const contextPrompt = `You are a helpful assistant for FrameworkVS 3.0, a virtual screening and molecular docking platform. 
      
Current page: ${currentPage}
Current expanded sections: ${expandedSections.join(', ')}

Answer questions about:
- How to set up docking simulations
- Grid box configuration and blind docking
- CPU settings and performance optimization
- File format conversion
- PLIP interaction analysis
- RFL-Score ML scoring
- 3D molecular visualization
- Troubleshooting common issues

User's question: ${userMessage}

Provide clear, concise, and actionable answers. Include specific steps when relevant. If the user's question is about a feature they're currently viewing, reference that context.`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [
            { role: 'user', content: contextPrompt }
          ],
        }),
      });

      const data = await response.json();
      const assistantMessage = data.content.find(block => block.type === 'text')?.text || 'Sorry, I encountered an error.';
      
      setChatMessages(prev => [...prev, { role: 'assistant', content: assistantMessage }]);
    } catch (error) {
      setChatMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Sorry, I encountered an error connecting to the assistant. Please try again.' 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

const Section = ({ id, title, icon, children }) => {
  const isExpanded = expandedSections.includes(id);
  
  return (
    <div className="mb-4 border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
      <button
        onClick={() => toggleSection(id)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{icon}</span>
          <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
        </div>
{isExpanded ? (
  <span className="text-gray-500">▼</span>
) : (
  <span className="text-gray-500">▶</span>
)}
        </button>
        {isExpanded && (
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
            {children}
          </div>
        )}
      </div>
    );
  };

  const QuickTip = ({ children }) => (
    <div className="flex items-start gap-2 p-3 bg-blue-50 border-l-4 border-blue-500 rounded-r-lg my-3">
         ⚠️
      <p className="text-sm text-blue-900">{children}</p>
    </div>
  );

  const SuccessNote = ({ children }) => (
    <div className="flex items-start gap-2 p-3 bg-green-50 border-l-4 border-green-500 rounded-r-lg my-3">
         ✓
      <p className="text-sm text-green-900">{children}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold text-blue-700 mb-2 p-5 ">FrameworkVS 3.0</h1>
              <p className="text-lg text-gray-600 p-3">Complete User Guide & Documentation</p>
            </div>
                  📖
          </div>
          
         
        </div>

        {/* Main Documentation Sections */}
        <div className="space-y-4">
          
          {/* Getting Started */}
          <Section id="getting-started" title="Getting Started" icon="📘">
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-gray-800 mb-2">🎯 What is FrameworkVS?</h3>
                <p className="text-gray-700 mb-3">
                  FrameworkVS 3.0 is a comprehensive virtual screening platform that combines molecular docking, 
                  advanced analysis tools, and machine learning scoring. It supports both script generation for 
                  HPC clusters and local execution on your machine.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-800 mb-2">🚀 Quick Start Workflow</h3>
                <ol className="list-decimal list-inside space-y-2 text-gray-700">
                  <li><strong>Choose your mode:</strong> Generate script or Run locally</li>
                  <li><strong>Upload/Specify files:</strong> Select ligands and receptors</li>
                  <li><strong>Configure grid box:</strong> Manual or blind docking</li>
                  <li><strong>Set CPU parameters:</strong> Optimize for your system</li>
                  <li><strong>Run or Download:</strong> Execute immediately or save script</li>
                </ol>
              </div>

              <QuickTip>
                <strong>First time?</strong> Start with the "New Docking" page and use the "Path Usage Information" 
                button to understand how paths work in different modes.
              </QuickTip>

              <div>
                <h3 className="font-semibold text-gray-800 mb-2">📋 System Requirements</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-white rounded-lg border">
                    <p className="text-sm font-medium text-gray-800">For Script Generation:</p>
                    <ul className="text-sm text-gray-600 mt-1 space-y-1">
                      <li>• Web browser</li>
                      <li>• Internet connection</li>
                      <li>• File paths ready</li>
                    </ul>
                  </div>
                  <div className="p-3 bg-white rounded-lg border">
                    <p className="text-sm font-medium text-gray-800">For Local Execution:</p>
                    <ul className="text-sm text-gray-600 mt-1 space-y-1">
                      <li>• AutoDock Vina</li>
                      <li>• Python 3.6+</li>
                      <li>• Local backend running</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </Section>

          {/* New Docking Setup */}
          <Section id="docking-setup" title="New Docking Setup" icon="⚙️">
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-gray-800 mb-2">Step 1: Select Ligands</h3>
                <p className="text-gray-700 mb-2">Choose your input method:</p>
                <div className="space-y-2 ml-4">
                  <div className="p-3 bg-white rounded-lg border">
                    <p className="font-medium text-gray-800">📄 Browse File</p>
                    <p className="text-sm text-gray-600">Single ligand file (.pdb, .mol2, .pdbqt, .sdf)</p>
                  </div>
                  <div className="p-3 bg-white rounded-lg border">
                    <p className="font-medium text-gray-800">📂 Browse Folder</p>
                    <p className="text-sm text-gray-600">Multiple ligands for batch docking</p>
                  </div>
                  <div className="p-3 bg-white rounded-lg border">
                    <p className="font-medium text-gray-800">✍️ Manual Path Entry</p>
                    <p className="text-sm text-gray-600">For script generation mode</p>
                  </div>
                </div>
                <QuickTip>
                  Use absolute paths like <code className="bg-gray-200 px-2 py-1 rounded">/home/user/ligands/</code> 
                  when generating scripts for cluster execution.
                </QuickTip>
              </div>

              <div>
                <h3 className="font-semibold text-gray-800 mb-2">Step 2: Select Receptors</h3>
                <p className="text-gray-700 mb-2">
                  Same options as ligands. Supported formats: .pdb, .pdbqt, .cif
                </p>
                <SuccessNote>
                  When you browse files/folders, they'll be shown in the 3D viewer for visual verification!
                </SuccessNote>
              </div>

              <div>
                <h3 className="font-semibold text-gray-800 mb-2">Step 3: Configure Grid Box</h3>
                <div className="space-y-3">
                  <div className="p-4 bg-white rounded-lg border">
                    <p className="font-medium text-gray-800 mb-2">🎯 Manual Configuration</p>
                    <ul className="text-sm text-gray-600 space-y-1">
                      <li>• Set center coordinates (X, Y, Z)</li>
                      <li>• Define box size in Ångströms</li>
                      <li>• Optional: Enable box variation for systematic search</li>
                    </ul>
                  </div>
                  <div className="p-4 bg-white rounded-lg border">
                    <p className="font-medium text-gray-800 mb-2">🎲 Blind Docking</p>
                    <ul className="text-sm text-gray-600 space-y-1">
                      <li>• Check "Blind Docking" checkbox</li>
                      <li>• Box automatically calculated to cover entire receptor</li>
                      <li>• Best for unknown binding sites</li>
                    </ul>
                  </div>
                  <div className="p-4 bg-white rounded-lg border">
                    <p className="font-medium text-gray-800 mb-2">📄 Load from File</p>
                    <ul className="text-sm text-gray-600 space-y-1">
                      <li>• Upload .txt file with box parameters</li>
                      <li>• Format: center_x=10.5, center_y=20.3, etc.</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-800 mb-2">Step 4: CPU Configuration ⚙️</h3>
                <p className="text-gray-700 mb-3">
                  Critical for performance optimization:
                </p>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-3">
                  <p className="font-medium text-yellow-900 mb-2">⚠️ All three values are REQUIRED:</p>
                  <ul className="text-sm text-yellow-800 space-y-1 ml-4">
                    <li>• System CPU: Total cores available</li>
                    <li>• User CPU: Cores you want to use</li>
                    <li>• Vina Threads: Threads per docking task</li>
                  </ul>
                </div>
                
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="font-medium text-blue-900 mb-2">💡 Example Configuration:</p>
                  <div className="space-y-2 text-sm text-blue-800">
                    <p><strong>System:</strong> 32 cores</p>
                    <p><strong>User:</strong> 24 cores (leaving 8 for system)</p>
                    <p><strong>Vina Threads:</strong> 4 per task</p>
                    <p><strong>Result:</strong> 6 parallel docking tasks (24 ÷ 4)</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-800 mb-2">Step 5: Optional PLIP Analysis</h3>
                <p className="text-gray-700 mb-2">
                  Enable automatic interaction analysis after docking:
                </p>
                <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
                  <li>Check "Enable PLIP Analysis"</li>
                  <li>Set max poses to analyze (1-20)</li>
                  <li>Configure parallel workers</li>
                  <li>Choose pre-processing options</li>
                </ul>
              </div>
              
              <div>
                <h3 className="font-semibold text-gray-800 mb-2">Step 6: Click Generate script</h3>
                <p className="text-gray-700 mb-2">
                  Auto download script file or Zip file:
                </p>
                <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
                  <li>Run the script anywhere (local machine, another computer, cluster, etc.)
</li>
                  <li>No need for the local backend - completely portable</li>
                  <li>Full control over execution environment</li>
                </ul>
                <SuccessNote>
                  PLIP will generate a separate script that runs automatically after docking completes!
                </SuccessNote>
              </div>
            </div>
          </Section>

          {/* Advanced Analysis Tools */}
          <Section id="analysis-tools" title="Advanced Analysis Tools" icon="🔬">
            <div className="space-y-4">
              
              <div className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border-2 border-purple-200">
                <h3 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                  <span>🔬</span>
                  3D Molecular Visualization
                </h3>
                <p className="text-gray-700 mb-3">
                  Interactive 3D viewer with advanced features:
                </p>
                <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
                  <li><strong>Multi-model support:</strong> Automatically detects and extracts individual docking poses</li>
                  <li><strong>PLIP integration:</strong> Upload JSON files to visualize interactions in 3D</li>
                  <li><strong>Docking scores:</strong> Displays Vina binding energies and RMSD values</li>
                  <li><strong>Torsion visualization:</strong> Highlights rotatable bonds</li>
                  <li><strong>Smart ligand detection:</strong> Automatically identifies and displays ligands</li>
                </ul>
                <QuickTip>
                  Upload a multi-model PDBQT file and PLIP JSON together - the viewer will automatically match 
                  each pose with its interactions!
                </QuickTip>
              </div>

              <div className="p-4 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-lg border-2 border-blue-200">
                <h3 className="font-semibold text-gray-800 mb-2">🔬 PLIP Interaction Analysis</h3>
                <p className="text-gray-700 mb-3">
                  Comprehensive protein-ligand interaction profiler:
                </p>
                <div className="space-y-2">
                  <div className="bg-white p-3 rounded border">
                    <p className="font-medium">Execution Modes:</p>
                    <ul className="text-sm text-gray-600 mt-1 space-y-1">
                      <li>• <strong>Run Now:</strong> Upload files, execute immediately</li>
                      <li>• <strong>Generate Script:</strong> Download for cluster/remote execution</li>
                    </ul>
                  </div>
                  <div className="bg-white p-3 rounded border">
                    <p className="font-medium">Detected Interactions:</p>
                    <ul className="text-sm text-gray-600 mt-1 space-y-1">
                      <li>• Hydrogen bonds (H-bonds)</li>
                      <li>• Hydrophobic interactions</li>
                      <li>• Salt bridges</li>
                      <li>• π-stacking & π-cation</li>
                      <li>• Halogen bonds</li>
                      <li>• Metal complexes</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border-2 border-green-200">
                <h3 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                  🧠
                  RFL-Score ML Scoring
                </h3>
                <p className="text-gray-700 mb-3">
                  Random Forest + Lasso regression for binding affinity prediction:
                </p>
                <div className="bg-white p-3 rounded border mb-3">
                  <p className="font-medium text-amber-800 mb-2">⚠️ Installation Required:</p>
                  <p className="text-sm text-gray-700">
                    Download and install RFL-Score from GitHub before using this tool.
                    The tool generates 723 molecular features for ML predictions.
                  </p>
                </div>
                <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
                  <li>Supports PDBQT docking results</li>
                  <li>Auto-extracts protein sequences (or upload FASTA)</li>
                  <li>Generates comparison plots (Vina vs ML scores)</li>
                  <li>Parallel processing for multiple complexes</li>
                  <li>Exports detailed feature matrices (optional)</li>
                </ul>
              </div>

              <div className="p-4 bg-gradient-to-r from-yellow-50 to-amber-50 rounded-lg border-2 border-yellow-200">
                <h3 className="font-semibold text-gray-800 mb-2">📊 Traditional Scoring</h3>
                <p className="text-gray-700 mb-3">
                  Upload Vina output files for quick analysis:
                </p>
                <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
                  <li>Single or multiple file analysis</li>
                  <li>Interactive sortable tables</li>
                  <li>Advanced filters (affinity, RMSD, top-N)</li>
                  <li>Quick insights dashboard</li>
                  <li>Export to CSV, JSON, or text report</li>
                </ul>
                <SuccessNote>
                  Includes interpretation guide with quality scoring: Excellent (&lt;-8), Good (-6 to -8), Fair (&gt;-6)
                </SuccessNote>
              </div>

              <div className="p-4 bg-gradient-to-r from-gray-50 to-slate-50 rounded-lg border-2 border-gray-200">
                <h3 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                  <span>📄</span>
                  File Converter
                </h3>
                <p className="text-gray-700 mb-3">
                  Convert molecular files with scientific precision:
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white p-3 rounded border">
                    <p className="font-medium text-sm mb-2">Single File Mode:</p>
                    <ul className="text-xs text-gray-600 space-y-1">
                      <li>• Upload → Convert → Auto-download</li>
                      <li>• Instant results</li>
                    </ul>
                  </div>
                  <div className="bg-white p-3 rounded border">
                    <p className="font-medium text-sm mb-2">Folder Mode:</p>
                    <ul className="text-xs text-gray-600 space-y-1">
                      <li>• Generate Python script</li>
                      <li>• Batch conversion anywhere</li>
                    </ul>
                  </div>
                </div>
                <div className="mt-3 bg-blue-50 p-3 rounded border border-blue-200">
                  <p className="font-medium text-sm text-blue-900 mb-1">Scientific Options:</p>
                  <ul className="text-xs text-blue-800 space-y-1">
                    <li>• Add/merge hydrogens (polar/all)</li>
                    <li>• Gasteiger charge assignment</li>
                    <li>• Aromatic carbon detection</li>
                    <li>• Torsional DOF computation</li>
                    <li>• pH-dependent protonation</li>
                  </ul>
                </div>
              </div>
            </div>
          </Section>

          {/* Tips & Best Practices */}
          <Section id="tips" title="Tips & Best Practices" icon="⚡">
            <div className="space-y-3">
              <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                <h4 className="font-semibold text-green-900 mb-2">✅ Do's</h4>
                <ul className="text-sm text-green-800 space-y-1">
                  <li>• Always use absolute paths for script generation</li>
                  <li>• Test with a few ligands first before scaling up</li>
                  <li>• Use blind docking when binding site is unknown</li>
                  <li>• Enable PLIP for automatic interaction analysis</li>
                  <li>• Set appropriate CPU limits (leave cores for system)</li>
                  <li>• Use chunking for datasets &gt;1000 ligands</li>
                  <li>• Verify paths in the 3D viewer before running</li>
                </ul>
              </div>

              <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                <h4 className="font-semibold text-red-900 mb-2">❌ Don'ts</h4>
                <ul className="text-sm text-red-800 space-y-1">
                  <li>• Don't use relative paths in script generation mode</li>
                  <li>• Don't set CPU values to 0 (validation will block)</li>
                  <li>• Don't forget to specify output folder path</li>
                  <li>• Don't use special characters (@, $, #) in paths</li>
                  <li>• Don't mix file types in the same folder</li>
                  <li>• Don't exceed your system's CPU capacity</li>
                </ul>
              </div>

              <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                <h4 className="font-semibold text-purple-900 mb-2">🚀 Performance Tips</h4>
                <ul className="text-sm text-purple-800 space-y-1">
                  <li>• <strong>CPU Balance:</strong> Vina threads × Workers ≤ User CPUs</li>
                  <li>• <strong>Optimal Vina Threads:</strong> 2-4 for most systems</li>
                  <li>• <strong>Exhaustiveness:</strong> 8 (default) balances speed/accuracy</li>
                  <li>• <strong>Chunking:</strong> Use for &gt;1000 ligands (CHUNK_SIZE=1000)</li>
                  <li>• <strong>PLIP Workers:</strong> Set to 50-75% of available cores</li>
                  <li>• <strong>RFL-Score:</strong> ~30-60s per pose, plan accordingly</li>
                </ul>
              </div>
            </div>
          </Section>

          {/* Troubleshooting */}
          <Section id="troubleshooting" title="Troubleshooting" icon="🚨">
            <div className="space-y-4">
              <div className="p-4 bg-white rounded-lg border-2 border-red-200">
                <h4 className="font-semibold text-red-900 mb-2">🔴 Common Issues</h4>
                
                <div className="space-y-3 mt-3">
                  <div>
                    <p className="font-medium text-gray-800">Issue: "CPU Configuration Required"</p>
                    <p className="text-sm text-gray-600 mt-1">
                      <strong>Solution:</strong> All three CPU values must be &gt;0. The form will auto-scroll 
                      to the CPU section if validation fails.
                    </p>
                  </div>

                  <div>
                    <p className="font-medium text-gray-800">Issue: "Path must start with '/'"</p>
                    <p className="text-sm text-gray-600 mt-1">
                      <strong>Solution:</strong> Use absolute paths like <code className="bg-gray-100 px-1 rounded">/home/user/data/</code> 
                      not relative paths like <code className="bg-gray-100 px-1 rounded">data/</code>
                    </p>
                  </div>

                  <div>
                    <p className="font-medium text-gray-800">Issue: "Local backend unreachable"</p>
                    <p className="text-sm text-gray-600 mt-1">
                      <strong>Solution:</strong> Download and start the local backend from GitHub. 
                      It should run on http://127.0.0.1:5005 or 5006/5008 depending on the tool.
                    </p>
                  </div>

                  <div>
                    <p className="font-medium text-gray-800">Issue: "3D Viewer not loading structures"</p>
                    <p className="text-sm text-gray-600 mt-1">
                      <strong>Solution:</strong> Large files (&gt;50MB) are skipped. Structures with &gt;100K atoms 
                      are automatically simplified by removing hydrogens and using backbone-only for common residues.
                    </p>
                  </div>

                  <div>
                    <p className="font-medium text-gray-800">Issue: "PLIP not detecting ligand"</p>
                    <p className="text-sm text-gray-600 mt-1">
                      <strong>Solution:</strong> Ensure ligand residue name is "UNL" or it's a HETATM with ≥6 heavy atoms.
                      The viewer automatically filters out water, ions, and common cofactors.
                    </p>
                  </div>

                  <div>
                    <p className="font-medium text-gray-800">Issue: "RFL-Score taking too long"</p>
                    <p className="text-sm text-gray-600 mt-1">
                      <strong>Solution:</strong> Reduce max_poses parameter or increase parallel workers. 
                      Each pose takes ~30-60 seconds. For 100 ligands × 5 poses = 500 poses ≈ 4-8 hours on single core.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
                <h4 className="font-semibold text-blue-900 mb-2">💡 Getting Help</h4>
                <ul className="text-sm text-blue-800 space-y-2">
                  <li>• <strong>Use the chatbot:</strong> Click the blue button (bottom-right) for instant help</li>
                  <li>• <strong>Check documentation:</strong> Read the relevant section above</li>
                  <li>• <strong>GitHub Issues:</strong> Report bugs or request features</li>
                  <li>• <strong>Local backend logs:</strong> Check console output for detailed errors</li>
                </ul>
              </div>
            </div>
          </Section>

          {/* FAQ */}
          <Section id="faq" title="Frequently Asked Questions" icon="❓">
            <div className="space-y-4">
              <div className="p-4 bg-white rounded-lg border">
                <p className="font-semibold text-gray-800 mb-2">Q: Do I need to install anything to use FrameworkVS?</p>
                <p className="text-sm text-gray-700">
                  <strong>A:</strong> For script generation, no installation needed - just use the web interface. 
                  For local execution, you need the local backend from GitHub, AutoDock Vina, and Python 3.6+.
                </p>
              </div>

              <div className="p-4 bg-white rounded-lg border">
                <p className="font-semibold text-gray-800 mb-2">Q: What's the difference between "Generate Script" and "Run Now"?</p>
                <p className="text-sm text-gray-700">
                  <strong>A:</strong> "Generate Script" downloads a Python file you can run anywhere (cluster, remote server). 
                  "Run Now" executes immediately on your current machine using the local backend.
                </p>
              </div>

              <div className="p-4 bg-white rounded-lg border">
                <p className="font-semibold text-gray-800 mb-2">Q: How long does docking take?</p>
                <p className="text-sm text-gray-700">
                  <strong>A:</strong> Depends on: exhaustiveness (8 is default), number of ligands, CPU allocation, and ligand complexity. 
                  Typical: 1-5 minutes per ligand with exhaustiveness=8. With 4 parallel workers: ~15-75 seconds per ligand.
                </p>
              </div>

              <div className="p-4 bg-white rounded-lg border">
                <p className="font-semibold text-gray-800 mb-2">Q: Can I use FrameworkVS on Windows?</p>
                <p className="text-sm text-gray-700">
                  <strong>A:</strong> The web interface works on any OS. For local execution, you need AutoDock Vina 
                  (available for Windows). The generated scripts are cross-platform Python.
                </p>
              </div>

              <div className="p-4 bg-white rounded-lg border">
                <p className="font-semibold text-gray-800 mb-2">Q: What file formats are supported?</p>
                <p className="text-sm text-gray-700">
                  <strong>A:</strong> <strong>Ligands:</strong> .pdb, .mol2, .pdbqt, .sdf | 
                  <strong> Receptors:</strong> .pdb, .pdbqt, .cif | 
                  <strong> Converter:</strong> All of the above plus conversion between formats.
                </p>
              </div>

              <div className="p-4 bg-white rounded-lg border">
                <p className="font-semibold text-gray-800 mb-2">Q: Is my data safe? Where are files stored?</p>
                <p className="text-sm text-gray-700">
                  <strong>A:</strong> For "Generate Script": No files are uploaded - you just enter paths. 
                  For "Run Now": Files are temporarily uploaded to YOUR local backend (localhost), not to any cloud. 
                  You have complete control over your data.
                </p>
              </div>

              <div className="p-4 bg-white rounded-lg border">
                <p className="font-semibold text-gray-800 mb-2">Q: Can I run multiple docking jobs simultaneously?</p>
                <p className="text-sm text-gray-700">
                  <strong>A:</strong> Yes, but manage your CPU allocation carefully. Each job uses the CPUs you specify. 
                  Monitor your system resources to avoid overloading.
                </p>
              </div>

              <div className="p-4 bg-white rounded-lg border">
                <p className="font-semibold text-gray-800 mb-2">Q: How accurate are the ML scores from RFL-Score?</p>
                <p className="text-sm text-gray-700">
                  <strong>A:</strong> RFL-Score uses 723 features and combines Random Forest with Lasso regression. 
                  It's trained on experimental binding data and typically correlates better with experimental affinities 
                  than traditional scoring functions. Always validate predictions experimentally.
                </p>
              </div>

              <div className="p-4 bg-white rounded-lg border">
                <p className="font-semibold text-gray-800 mb-2">Q: What does "blind docking" mean?</p>
                <p className="text-sm text-gray-700">
                  <strong>A:</strong> Blind docking searches the entire protein surface for binding sites, not just a 
                  predefined pocket. The grid box automatically covers the whole receptor. Use when you don't know 
                  where the ligand binds.
                </p>
              </div>

              <div className="p-4 bg-white rounded-lg border">
                <p className="font-semibold text-gray-800 mb-2">Q: Can I visualize docking results before running PLIP?</p>
                <p className="text-sm text-gray-700">
                  <strong>A:</strong> Yes! Use the 3D Molecular Visualization tool. Upload your receptor and ligand 
                  PDBQT files. Multi-model files are automatically detected and you can step through poses.
                </p>
              </div>
            </div>
          </Section>

        </div>

        {/* Footer */}
        <footer className="mt-8 text-center text-sm text-gray-600 bg-white rounded-lg p-4 shadow">
          <p>© Combi-Lab FrameworkVS 3.0 2025. All rights reserved.</p>
          <p className="mt-2 text-xs text-gray-500">
            Need help? Use the AI assistant (blue button, bottom-right) or check the documentation above.
          </p>
        </footer>
      </div>

      {/* Floating AI Chatbot */}
      {chatOpen && (
        <div className="fixed bottom-24 right-6 w-96 h-[600px] bg-white rounded-2xl shadow-2xl flex flex-col border-2 border-blue-500 z-50">
          {/* Chat Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-3 rounded-t-2xl flex items-center justify-between">
            <div className="flex items-center gap-2">
                 💬
              <h3 className="font-semibold">FrameworkVS Assistant</h3>
            </div>
            <button
              onClick={() => setChatOpen(false)}
              className="hover:bg-white/20 rounded-full p-1 transition-colors"
            >
                          ✕
            </button>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
            {chatMessages.length === 0 && (
              <div className="text-center text-gray-500 mt-8">
                🧠
                <p className="text-sm font-medium">Hi! I'm your FrameworkVS assistant.</p>
                <p className="text-sm font-medium">Currently under development. I'll be available soon!</p>
              </div>
            )}
            
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border border-gray-200 text-gray-800'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-2xl px-4 py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={chatEndRef} />
          </div>

          {/* Chat Input */}
          <div className="p-4 border-t border-gray-200 bg-white rounded-b-2xl">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask a question..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                disabled={isLoading}
              />
              <button
                onClick={sendMessage}
                disabled={isLoading || !userInput.trim()}
                className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                ➤
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2 text-center">
              Powered by Claude AI • Context-aware assistance
            </p>
          </div>
        </div>
      )}

      {/* Floating Chat Button */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed bottom-6 right-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 rounded-full shadow-2xl hover:shadow-3xl hover:scale-110 transition-all duration-200 z-50 group"
        >
              💬
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white animate-pulse"></span>
          
          {/* Tooltip */}
          <div className="absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-gray-900 text-white px-3 py-2 rounded-lg text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            Need help? Ask me anything!
            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full border-8 border-transparent border-l-gray-900"></div>
          </div>
        </button>
      )}
    </div>
  );
}
