import React, { useState, useEffect, useRef } from 'react';

// Load 3Dmol.js
const load3Dmol = () => {
  return new Promise((resolve, reject) => {
    if (window.$3Dmol) {
      resolve(window.$3Dmol);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/3Dmol/2.0.1/3Dmol-min.js';
    script.onload = () => resolve(window.$3Dmol);
    script.onerror = reject;
    document.head.appendChild(script);
  });
};

// Extract specific model from multi-model PDB/PDBQT file
const extractModelFromFile = (fileContent, modelNumber) => {
  const lines = fileContent.split('\n');
  const extractedLines = [];
  let inTargetModel = false;
  let currentModel = 0;
  
  for (const line of lines) {
    if (line.startsWith('MODEL')) {
      currentModel++;
      if (currentModel === modelNumber) {
        inTargetModel = true;
        extractedLines.push(line);
      }
    } else if (line.startsWith('ENDMDL')) {
      if (inTargetModel) {
        extractedLines.push(line);
        break; // Stop after finding our model
      }
    } else if (inTargetModel) {
      extractedLines.push(line);
    }
  }
  
  // If no MODEL/ENDMDL tags found, return original content (single model file)
  if (extractedLines.length === 0) {
    return fileContent;
  }
  
  return extractedLines.join('\n');
};

// Detect if file has multiple models
const hasMultipleModels = (fileContent) => {
  const modelCount = (fileContent.match(/^MODEL/gm) || []).length;
  return modelCount > 1;
};

export default function MolecularVisualization() {
  const [receptorFile, setReceptorFile] = useState(null);
  const [ligandFiles, setLigandFiles] = useState([]);
  const [ligandFileContents, setLigandFileContents] = useState([]); // Cache file contents
  const [isMultiModelLigand, setIsMultiModelLigand] = useState(false);
  const [plipData, setPlipData] = useState(null);
  
  // Visualization state
  const [currentPose, setCurrentPose] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1000);
  
  // Display options
  const [showReceptor, setShowReceptor] = useState(true);
  const [showLigand, setShowLigand] = useState(true);
  const [showInteractions, setShowInteractions] = useState(false);
  const [showSurface, setShowSurface] = useState(false);
  const [showPocket, setShowPocket] = useState(false);
  
  // Interaction type filters
  const [interactionFilters, setInteractionFilters] = useState({
    'Hydrogen Bonds': true,
    'Hydrophobic Interactions': true,
    'Salt Bridges': true,
    'Pi-Stacking': true,
    'Pi-Cation': true,
    'Halogen Bonds': true,
    'Water Bridges': true,
    'Metal Complexes': true
  });
  
  // Style options
  const [receptorStyle, setReceptorStyle] = useState('cartoon');
  const [ligandStyle, setLigandStyle] = useState('stick');
  const [colorScheme, setColorScheme] = useState('element');
  const [backgroundColor, setBackgroundColor] = useState('#000000');
  
  // Info panel
  const [showInfo, setShowInfo] = useState(true);
  const [currentInteractions, setCurrentInteractions] = useState(null);
  
  const viewerRef = useRef(null);
  const animationRef = useRef(null);
  const moleculeViewerRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);
  const [viewerReady, setViewerReady] = useState(false);

  // Initialize 3Dmol viewer
  useEffect(() => {
    const init = async () => {
      try {
        const $3Dmol = await load3Dmol();
        if (viewerRef.current && !moleculeViewerRef.current) {
          const config = { backgroundColor: backgroundColor };
          moleculeViewerRef.current = $3Dmol.createViewer(viewerRef.current, config);
          setViewerReady(true);
        }
      } catch (err) {
        console.error('Failed to load 3Dmol:', err);
      }
    };
    init();
  }, []);

  // Update background color
  useEffect(() => {
    if (moleculeViewerRef.current && viewerReady) {
      moleculeViewerRef.current.setBackgroundColor(backgroundColor);
      moleculeViewerRef.current.render();
    }
  }, [backgroundColor, viewerReady]);

  // Get interaction color based on type
  const getInteractionColor = (type) => {
    const colors = {
      'Hydrogen Bonds': '#00BFFF',
      'Hydrophobic Interactions': '#32CD32',
      'Salt Bridges': '#FF6347',
      'Pi-Stacking': '#9370DB',
      'Pi-Cation': '#FFD700',
      'Halogen Bonds': '#FF69B4',
      'Water Bridges': '#87CEEB',
      'Metal Complexes': '#CD853F'
    };
    return colors[type] || '#FFFFFF';
  };

  // Draw interactions on 3D viewer
  const drawInteractions = (viewer, interactions) => {
    if (!interactions || !showInteractions) return;

    interactions.forEach(inter => {
      const type = inter.interaction_type;
      
      if (!interactionFilters[type]) return;

      const color = getInteractionColor(type);
      
      const ligand = {
        x: parseFloat(inter.ligcoo_x),
        y: parseFloat(inter.ligcoo_y),
        z: parseFloat(inter.ligcoo_z)
      };
      
      const protein = {
        x: parseFloat(inter.protcoo_x),
        y: parseFloat(inter.protcoo_y),
        z: parseFloat(inter.protcoo_z)
      };

      // Draw dashed line
      viewer.addCylinder({
        start: ligand,
        end: protein,
        radius: 0.1,
        color: color,
        dashed: true,
        dashLength: 0.3,
        gapLength: 0.15
      });

      // Add spheres
      viewer.addSphere({
        center: ligand,
        radius: 0.2,
        color: color,
        alpha: 0.7
      });

      viewer.addSphere({
        center: protein,
        radius: 0.2,
        color: color,
        alpha: 0.7
      });

      // Labels for hydrogen bonds
      if (type === 'Hydrogen Bonds') {
        const midpoint = {
          x: (ligand.x + protein.x) / 2,
          y: (ligand.y + protein.y) / 2,
          z: (ligand.z + protein.z) / 2
        };
        
        viewer.addLabel(
          `${inter.restype}${inter.resnr}\n${parseFloat(inter.dist || inter['dist_h-a'] || inter['dist_d-a'] || 0).toFixed(2)}Å`,
          {
            position: midpoint,
            backgroundColor: color,
            backgroundOpacity: 0.8,
            fontColor: 'white',
            fontSize: 10,
            showBackground: true
          }
        );
      }
    });
  };

  // Render molecules
  useEffect(() => {
    if (!moleculeViewerRef.current || !viewerReady) return;
    
    const renderMolecules = async () => {
      setIsLoading(true);
      const viewer = moleculeViewerRef.current;
      viewer.clear();

      try {
        // Load receptor
        if (receptorFile && showReceptor) {
          const receptorText = await receptorFile.text();
          const receptorModel = viewer.addModel(receptorText, 
            receptorFile.name.endsWith('.pdb') || receptorFile.name.endsWith('.pdbqt') ? 'pdb' : 'cif'
          );
          
          const receptorStyleObj = {};
          if (receptorStyle === 'cartoon') {
            receptorStyleObj.cartoon = { color: 'spectrum' };
          } else if (receptorStyle === 'line') {
            receptorStyleObj.line = { colorscheme: colorScheme };
          } else if (receptorStyle === 'stick') {
            receptorStyleObj.stick = { colorscheme: colorScheme, radius: 0.15 };
          } else if (receptorStyle === 'sphere') {
            receptorStyleObj.sphere = { colorscheme: colorScheme, radius: 0.3 };
          }
          
          viewer.setStyle({ model: receptorModel }, receptorStyleObj);
          
          if (showSurface) {
            viewer.addSurface(window.$3Dmol.SurfaceType.VDW, {
              opacity: 0.7,
              colorscheme: 'whiteCarbon'
            }, { model: receptorModel });
          }
        }

        // Load ligand - WITH SMART MODEL EXTRACTION
        if (showLigand) {
          let ligandText = '';
          
          // Check if we have multi-model ligand
          if (isMultiModelLigand && ligandFileContents.length > 0) {
            // Extract only the current pose's model
            const fullContent = ligandFileContents[0]; // First file contains all models
            ligandText = extractModelFromFile(fullContent, currentPose + 1);
            
            console.log(`📌 Extracted MODEL ${currentPose + 1} from multi-model file`);
            console.log(`📊 Ligand text length: ${ligandText.length} characters`);
          } else if (ligandFiles[currentPose]) {
            // Regular behavior: use individual files
            ligandText = await ligandFiles[currentPose].text();
          }

          if (ligandText) {
            const ligandFormat = (ligandFiles[0]?.name.endsWith('.pdb') || 
                                ligandFiles[0]?.name.endsWith('.pdbqt')) ? 'pdb' : 
                                ligandFiles[0]?.name.endsWith('.sdf') ? 'sdf' : 'mol2';
            
            const ligandModel = viewer.addModel(ligandText, ligandFormat);
            
            const ligandStyleObj = {};
            if (ligandStyle === 'stick') {
              ligandStyleObj.stick = { colorscheme: 'greenCarbon', radius: 0.2 };
            } else if (ligandStyle === 'ball-stick') {
              ligandStyleObj.stick = { colorscheme: 'greenCarbon', radius: 0.2 };
              ligandStyleObj.sphere = { colorscheme: 'greenCarbon', radius: 0.3 };
            } else if (ligandStyle === 'sphere') {
              ligandStyleObj.sphere = { colorscheme: 'greenCarbon', radius: 0.5 };
            } else if (ligandStyle === 'line') {
              ligandStyleObj.line = { colorscheme: 'greenCarbon' };
            }
            
            viewer.setStyle({ model: ligandModel }, ligandStyleObj);
            
            // Binding pocket
            if (showPocket && receptorFile) {
              const ligandAtoms = viewer.selectedAtoms({ model: ligandModel });
              if (ligandAtoms.length > 0) {
                let centerX = 0, centerY = 0, centerZ = 0;
                ligandAtoms.forEach(atom => {
                  centerX += atom.x;
                  centerY += atom.y;
                  centerZ += atom.z;
                });
                centerX /= ligandAtoms.length;
                centerY /= ligandAtoms.length;
                centerZ /= ligandAtoms.length;
                
                viewer.addStyle(
                  { 
                    model: 0,
                    withinDistance: { 
                      distance: 5, 
                      sel: { x: centerX, y: centerY, z: centerZ } 
                    } 
                  },
                  { stick: { colorscheme: 'yellowCarbon', radius: 0.2 } }
                );
              }
            }
          }
        }

        // Draw interactions for current pose
if (plipData && showInteractions) {
  console.log(`🔍 Showing all ${plipData.length} interactions for MODEL ${currentPose + 1}`);
  setCurrentInteractions(plipData); // Show ALL interactions, no filtering
  drawInteractions(viewer, plipData); // Draw ALL interactions
}

        viewer.zoomTo();
        viewer.render();
      } catch (err) {
        console.error('Error rendering molecules:', err);
      } finally {
        setIsLoading(false);
      }
    };

    renderMolecules();
  }, [receptorFile, ligandFiles, ligandFileContents, currentPose, showReceptor, showLigand, 
      showSurface, showPocket, receptorStyle, ligandStyle, colorScheme, viewerReady,
      plipData, showInteractions, interactionFilters, isMultiModelLigand]);

  // Auto-play
  useEffect(() => {
    if (isPlaying && (ligandFiles.length > 1 || isMultiModelLigand)) {
      const maxPoses = isMultiModelLigand ? 
        (ligandFileContents[0]?.match(/^MODEL/gm) || []).length : 
        ligandFiles.length;
      
      animationRef.current = setInterval(() => {
        setCurrentPose(prev => (prev + 1) % maxPoses);
      }, playSpeed);
    }
    return () => clearInterval(animationRef.current);
  }, [isPlaying, ligandFiles.length, playSpeed, isMultiModelLigand, ligandFileContents]);

  const handleReceptorUpload = (e) => {
    const file = e.target.files[0];
    if (file) setReceptorFile(file);
  };

  const handleLigandUpload = async (e) => {
    const files = Array.from(e.target.files);
    setLigandFiles(files);
    setCurrentPose(0);
    
    // Read first file to check for multiple models
    if (files.length > 0) {
      const firstFile = files[0];
      const content = await firstFile.text();
      const isMulti = hasMultipleModels(content);
      
      setIsMultiModelLigand(isMulti);
      
      if (isMulti) {
        const modelCount = (content.match(/^MODEL/gm) || []).length;
        setLigandFileContents([content]); // Store full content
        console.log(`✓ Detected multi-model ligand file with ${modelCount} models`);
        alert(`✓ Detected multi-model file with ${modelCount} poses!\nWhen you upload PLIP data, each pose will be extracted automatically.`);
      } else {
        setLigandFileContents([]);
      }
    }
  };

  const handlePlipUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        setPlipData(data);
        setShowInteractions(true);
        
        console.log(`✓ Loaded ${data.length} interactions from ${file.name}`);
        
        // If multi-model ligand is detected, inform user
        if (isMultiModelLigand) {
          alert(`✓ PLIP data loaded!\n\nSmart model extraction enabled:\n- Each pose will show only its corresponding MODEL from the ligand file\n- This prevents coordinate mismatches\n- Select from the dropdown the pose (model) you uploaded`);
        }
      } catch (err) {
        console.error('Error parsing PLIP JSON:', err);
        alert('Error loading PLIP data. Please ensure it\'s a valid JSON file.');
      }
    }
  };

  const toggleInteractionFilter = (type) => {
    setInteractionFilters(prev => ({
      ...prev,
      [type]: !prev[type]
    }));
  };

  const togglePlay = () => setIsPlaying(!isPlaying);

  const maxPoses = isMultiModelLigand ? 
    (ligandFileContents[0]?.match(/^MODEL/gm) || []).length : 
    ligandFiles.length;

  const nextPose = () => {
    if (maxPoses > 0) {
      setCurrentPose((prev) => (prev + 1) % maxPoses);
    }
  };

  const prevPose = () => {
    if (maxPoses > 0) {
      setCurrentPose((prev) => (prev - 1 + maxPoses) % maxPoses);
    }
  };

  const resetView = () => {
    if (moleculeViewerRef.current) {
      moleculeViewerRef.current.zoomTo();
      moleculeViewerRef.current.render();
    }
  };

  const takeSnapshot = () => {
    if (moleculeViewerRef.current) {
      const canvas = moleculeViewerRef.current.pngURI();
      const link = document.createElement('a');
      link.href = canvas;
      link.download = `molecular_view_pose${currentPose + 1}_${Date.now()}.png`;
      link.click();
    }
  };

  const getInteractionStats = () => {
    if (!currentInteractions) return {};
    
    const stats = {};
    currentInteractions.forEach(inter => {
      const type = inter.interaction_type;
      if (!stats[type]) stats[type] = 0;
      stats[type]++;
    });
    return stats;
  };

  const interactionStats = getInteractionStats();

  return (
<div className="bg-white rounded-xl shadow-lg p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">3D Molecular Visualization</h2>
        <p className="text-gray-600">Visualize docking results, analyze interactions, and explore molecular structures</p>
      </div>

      {/* File Upload Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 hover:border-blue-500 transition">
          <label className="flex flex-col items-center cursor-pointer">
            <div className="text-4xl mb-2">🧬</div>
            <span className="text-sm font-medium text-gray-700">Upload Receptor</span>
            <span className="text-xs text-gray-500 mt-1">PDB, PDBQT, CIF</span>
            <input
              type="file"
              accept=".pdb,.pdbqt,.cif"
              onChange={handleReceptorUpload}
              className="hidden"
            />
          </label>
          {receptorFile && (
            <div className="mt-2 text-xs text-green-600 text-center truncate">
              ✓ {receptorFile.name}
            </div>
          )}
        </div>

        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 hover:border-blue-500 transition">
          <label className="flex flex-col items-center cursor-pointer">
            <div className="text-4xl mb-2">💊</div>
            <span className="text-sm font-medium text-gray-700">Upload Ligand(s)</span>
            <span className="text-xs text-gray-500 mt-1">Single/multi-model supported</span>
            <input
              type="file"
              accept=".pdb,.pdbqt,.sdf,.mol2"
              multiple
              onChange={handleLigandUpload}
              className="hidden"
            />
          </label>
          {ligandFiles.length > 0 && (
            <div className="mt-2 text-xs text-green-600 text-center">
              {isMultiModelLigand ? (
                <>
                  ✓ Multi-model: {maxPoses} poses
                </>
              ) : (
                <>
                  ✓ {ligandFiles.length} pose(s)
                </>
              )}
            </div>
          )}
        </div>

        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 hover:border-blue-500 transition">
          <label className="flex flex-col items-center cursor-pointer">
            <div className="text-4xl mb-2">🔗</div>
            <span className="text-sm font-medium text-gray-700">Upload PLIP Data</span>
            <span className="text-xs text-gray-500 mt-1">All poses in one JSON</span>
            <input
              type="file"
              accept=".json"
              onChange={handlePlipUpload}
              className="hidden"
            />
          </label>
          {plipData && (
            <div className="mt-2 text-xs text-green-600 text-center truncate">
              ✓ {plipData.length} interactions loaded
            </div>
          )}
          
          {/* NEW DROPDOWN CODE STARTS HERE */}
          {maxPoses > 1 && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <label className="block text-xs font-medium text-gray-700 mb-2">
                Select Pose
              </label>
              <select
                value={currentPose}
                onChange={(e) => setCurrentPose(Number(e.target.value))}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white hover:border-blue-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition"
              >
                {Array.from({ length: maxPoses }, (_, i) => (
                  <option key={i} value={i}>
                    {isMultiModelLigand ? `MODEL ${i + 1}` : `Pose ${i + 1}`}
                    {plipData && (() => {
                      const poseInteractions = plipData.filter(
                        inter => inter.position === String(i + 1)
                      );
                      return poseInteractions.length > 0 
                        ? ` (${poseInteractions.length} interactions)` 
                        : '';
                    })()}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-xs text-gray-500 text-center">
                {isMultiModelLigand ? 'Auto-extracts correct MODEL' : 'Showing individual files'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Multi-model Info Alert */}
      {isMultiModelLigand && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
          <div className="flex items-start gap-2">
            <span className="text-lg">✅</span>
            <div>
              <div className="font-semibold text-green-900">Multi-Model Ligand Detected</div>
              <div className="text-green-800 mt-1">
                Your ligand file contains {maxPoses} models. When PLIP data is uploaded, each pose will 
                automatically show only its corresponding MODEL to prevent coordinate mismatches.
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Control Panel */}
        <div className="lg:col-span-1 space-y-4 max-h-[600px] overflow-y-auto">
        
          {/* Display Options */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <span>👁️</span>
              Display
            </h3>
            
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showReceptor}
                  onChange={(e) => setShowReceptor(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Show Receptor</span>
              </label>
              
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showLigand}
                  onChange={(e) => setShowLigand(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Show Ligand</span>
              </label>
              
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showInteractions}
                  onChange={(e) => setShowInteractions(e.target.checked)}
                  className="rounded"
                  disabled={!plipData}
                />
                <span className="text-sm">Show Interactions</span>
              </label>
              
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showSurface}
                  onChange={(e) => setShowSurface(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Show Surface</span>
              </label>
              
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showPocket}
                  onChange={(e) => setShowPocket(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Show Binding Pocket</span>
              </label>
            </div>
          </div>

          {/* Interaction Filters */}
          {plipData && showInteractions && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <span>🔍</span>
                Interaction Types
              </h3>
              
              <div className="space-y-2 text-xs">
                {Object.keys(interactionFilters).map(type => (
                  <label key={type} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={interactionFilters[type]}
                      onChange={() => toggleInteractionFilter(type)}
                      className="rounded"
                    />
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: getInteractionColor(type) }}
                    />
                    <span className="flex-1">{type}</span>
                    <span className="text-gray-500">
                      ({interactionStats[type] || 0})
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Style Options */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <span>🎨</span>
              Styles
            </h3>
            
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-600 block mb-1">Receptor Style</label>
                <select
                  value={receptorStyle}
                  onChange={(e) => setReceptorStyle(e.target.value)}
                  className="w-full text-sm border rounded px-2 py-1"
                >
                  <option value="cartoon">Cartoon</option>
                  <option value="line">Line</option>
                  <option value="stick">Stick</option>
                  <option value="sphere">Sphere</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-600 block mb-1">Ligand Style</label>
                <select
                  value={ligandStyle}
                  onChange={(e) => setLigandStyle(e.target.value)}
                  className="w-full text-sm border rounded px-2 py-1"
                >
                  <option value="stick">Stick</option>
                  <option value="ball-stick">Ball & Stick</option>
                  <option value="sphere">Sphere</option>
                  <option value="line">Line</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-600 block mb-1">Color Scheme</label>
                <select
                  value={colorScheme}
                  onChange={(e) => setColorScheme(e.target.value)}
                  className="w-full text-sm border rounded px-2 py-1"
                >
                  <option value="element">By Element</option>
                  <option value="chain">By Chain</option>
                  <option value="residue">By Residue</option>
                  <option value="secondary">Secondary Structure</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-600 block mb-1"><strong>Background</strong></label>
                <input
                  type="color"
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  className="w-full h-8 rounded cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold text-gray-800 mb-3">Actions</h3>
            <div className="space-y-2">
              <button
                onClick={resetView}
                className="w-full px-3 py-2 bg-white border rounded-lg hover:bg-gray-100 text-sm"
              >
                🔄 Reset View
              </button>
              <button
                onClick={takeSnapshot}
                className="w-full px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm flex items-center justify-center gap-2"
              >
                <span>💾</span>
                Save Image
              </button>
            </div>
          </div>
        </div>

        {/* 3D Viewer */}
        <div className="lg:col-span-2">
          <div 
            ref={viewerRef}
            className="w-full h-[600px] rounded-lg relative overflow-hidden border-2 border-gray-300"
            style={{ backgroundColor, position: 'relative' }}
          >
            {!receptorFile && !ligandFiles.length ? (
              <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <div className="text-6xl mb-4 opacity-50">🧬</div>
                  <p className="text-lg font-medium">Upload files to start visualization</p>
                  <p className="text-sm mt-2">Supports PDB, PDBQT, SDF, MOL2, CIF formats</p>
                  <p className="text-xs mt-2 text-gray-500">
                    Multi-model ligand files are automatically detected
                  </p>
                </div>
              </div>
            ) : isLoading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <div className="text-center text-white">
                  <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-lg">Rendering 3D Structure...</p>
                  {isMultiModelLigand && (
                    <p className="text-sm text-gray-300 mt-2">
                      📌 Extracting MODEL {currentPose + 1}
                    </p>
                  )}
                  {showInteractions && currentInteractions && (
                    <p className="text-sm text-gray-300 mt-1">
                      🔗 Drawing {currentInteractions.length} interactions
                    </p>
                  )}
                </div>
              </div>
            ) : null}

            {/* View Controls */}
            <div className="absolute top-4 right-4 bg-black/50 backdrop-blur-sm rounded-lg p-2 text-white text-xs">
              <div>🖱️ Left: Rotate</div>
              <div>🖱️ Right: Translate</div>
              <div>🖱️ Scroll: Zoom</div>
            </div>

            {/* Legend */}
            {showInteractions && plipData && Object.keys(interactionStats).length > 0 && (
              <div className="absolute bottom-4 left-4 bg-black/50 backdrop-blur-sm rounded-lg p-3 text-white text-xs max-w-xs">
                <div className="font-semibold mb-2">Interaction Legend</div>
                <div className="space-y-1">
                  {Object.entries(interactionStats).map(([type, count]) => (
                    interactionFilters[type] && count > 0 && (
                      <div key={type} className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: getInteractionColor(type) }}
                        />
                        <span>{type}: {count}</span>
                      </div>
                    )
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Info Panel */}
        <div className="lg:col-span-1">
          <div className="bg-gray-50 rounded-lg p-4 h-[600px] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                <span>ℹ️</span>
                Information
              </h3>
              <button
                onClick={() => setShowInfo(!showInfo)}
                className="p-1 hover:bg-gray-200 rounded"
              >
                {showInfo ? '⊘' : '👁️'}
              </button>
            </div>

            {showInfo && (
              <div className="space-y-4 text-sm">
                {receptorFile && (
                  <div className="border-b pb-3">
                    <h4 className="font-semibold text-gray-700 mb-2">Receptor</h4>
                    <div className="space-y-1 text-xs text-gray-600">
                      <p><span className="font-medium">File:</span> {receptorFile.name}</p>
                    </div>
                  </div>
                )}

                {ligandFiles[0] && (
                  <div className="border-b pb-3">
                    <h4 className="font-semibold text-gray-700 mb-2">
                      Ligand {isMultiModelLigand ? `(MODEL ${currentPose + 1})` : `(Pose ${currentPose + 1})`}
                    </h4>
                    <div className="space-y-1 text-xs text-gray-600">
                      <p><span className="font-medium">File:</span> {ligandFiles[0].name}</p>
                      {isMultiModelLigand && (
                        <p className="text-green-600 mt-1">
                          ✓ Smart extraction: Only MODEL {currentPose + 1} shown
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {currentInteractions && currentInteractions.length > 0 && (
                  <>
                    <div className="border-b pb-3">
                      <h4 className="font-semibold text-gray-700 mb-2">
                        Interactions (Pose {currentPose + 1})
                      </h4>
                      <div className="space-y-2 text-xs">
                        <div className="mb-2">
                          <span className="font-medium">Total: </span>
                          {currentInteractions.length} interactions
                        </div>
                        {Object.entries(interactionStats).map(([type, count]) => (
                          count > 0 && (
                            <div key={type} className="flex items-center gap-2">
                              <div 
                                className="w-3 h-3 rounded-full flex-shrink-0" 
                                style={{ backgroundColor: getInteractionColor(type) }}
                              />
                              <span className="flex-1">{type}</span>
                              <span className="font-medium">{count}</span>
                            </div>
                          )
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 className="font-semibold text-gray-700 mb-2">Interaction Details</h4>
                      <div className="space-y-2 text-xs max-h-64 overflow-y-auto">
                        {currentInteractions.map((inter, idx) => (
                          <div 
                            key={idx} 
                            className="p-2 bg-white rounded border"
                            style={{ borderLeftWidth: '3px', borderLeftColor: getInteractionColor(inter.interaction_type) }}
                          >
                            <div className="font-medium text-gray-800">
                              {inter.restype}{inter.resnr} ({inter.reschain})
                            </div>
                            <div className="text-gray-600 mt-1">
                              {inter.interaction_type}
                            </div>
                            <div className="text-gray-500 mt-1">
                              Distance: {parseFloat(inter.dist).toFixed(2)} Å
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Feature Notes */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">🎯 Smart Multi-Model Support</h3>
        <div className="text-sm text-blue-800 space-y-2">
          <p><strong>What it does:</strong></p>
          <ul className="list-disc list-inside ml-2 space-y-1">
            <li><strong>Detects multi-model files:</strong> Automatically recognizes PDB/PDBQT files with multiple MODELs</li>
            <li><strong>Extracts individual poses:</strong> When PLIP data is uploaded, shows only the MODEL corresponding to current pose</li>
            <li><strong>Prevents coordinate mismatches:</strong> Ensures ligand and interactions are always aligned</li>
            <li><strong>Works seamlessly:</strong> No extra steps needed - just upload and visualize!</li>
          </ul>
          <p className="mt-3"><strong>Supported formats:</strong></p>
          <ul className="list-disc list-inside ml-2">
            <li><strong>Multi-model:</strong> Single PDBQT/PDB with MODEL 1, MODEL 2, etc. (from Vina/AutoDock)</li>
            <li>Plip file must be <strong>JSON </strong>file</li>
            <li><strong>Individual files:</strong> Separate files for each pose intrections_all.json file or Hydrogen Bonds, Hydrophobic Interactions or Salt Bridges file </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
