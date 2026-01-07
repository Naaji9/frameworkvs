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
// Extract specific model from multi-model PDB/PDBQT file
const extractModelFromFile = (fileContent, modelNumber) => {
  const lines = fileContent.split('\n');
  const extractedLines = [];
  let inTargetModel = false;
  let currentModel = 0;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Start of a MODEL
    if (trimmed.startsWith('MODEL')) {
      currentModel++;
      if (currentModel === modelNumber) {
        inTargetModel = true;
      }
      continue; // Skip MODEL line itself
    }
    
    // End of a MODEL
    if (trimmed.startsWith('ENDMDL')) {
      if (inTargetModel) {
        break; // We're done with our target model
      }
      continue;
    }
    
    // ONLY extract coordinate lines (ATOM/HETATM)
    if (inTargetModel) {
      if (trimmed.startsWith('ATOM') || trimmed.startsWith('HETATM')) {
        extractedLines.push(line); // Clean coordinate line only
      }
      // Skip: ROOT, ENDROOT, BRANCH, ENDBRANCH, REMARK, TORSDOF, etc.
    }
  }
  
  const result = extractedLines.join('\n');
  
  console.log(`✂️ Extracted MODEL ${modelNumber}: ${extractedLines.length} ATOM lines`);
  
  // If no MODEL/ENDMDL tags found, return original content (single model file)
  if (extractedLines.length === 0) {
    console.warn(`⚠️ No ATOM lines found in MODEL ${modelNumber}, returning full content`);
    return fileContent;
  }
  
  return result;
};

// Detect if file has multiple models - IMPROVED VERSION
const hasMultipleModels = (fileContent) => {
  const modelLines = fileContent.match(/^MODEL\s+\d+/gm);
  const modelCount = modelLines ? modelLines.length : 0;
  
  // Also check for ENDMDL tags
  const endmdlCount = (fileContent.match(/^ENDMDL/gm) || []).length;
  
  // Consider it multi-model if we have at least 2 MODEL tags
  // OR if we have MODEL and ENDMDL tags (some formats might have only one MODEL)
  return modelCount > 1 || (modelCount === 1 && endmdlCount === 1);
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
  // Parse PDBQT atom line with charge extraction
const parsePDBQTAtomLine = (line) => {
  return {
    serial: parseInt(line.substring(6, 11).trim()),
    name: line.substring(12, 16).trim(),
    resName: line.substring(17, 20).trim(),
    chain: line.substring(21, 22).trim(),
    resSeq: parseInt(line.substring(22, 26).trim()),
    x: parseFloat(line.substring(30, 38).trim()),
    y: parseFloat(line.substring(38, 46).trim()),
    z: parseFloat(line.substring(46, 54).trim()),
    charge: parseFloat(line.substring(66, 76).trim()) || 0,
    element: line.substring(76, 78).trim() || line.substring(12, 14).trim().replace(/[0-9]/g, '')
  };
};

// Parse torsion remark lines
const parseTorsionRemark = (line) => {
  const parts = line.split(/\s+/).filter(p => p);
  return {
    index: parseInt(parts[1]),
    status: parts[2], // 'A' for Active, 'I' for Inactive
    atom1_index: parseInt(parts[4].split('_')[1]),
    atom2_index: parseInt(parts[6].split('_')[1]),
    atom1_name: parts[4],
    atom2_name: parts[6]
  };
};

// Calculate torsion angle between four atoms
const calculateTorsionAngle = (atoms, i, j, k, l) => {
  const b1 = { x: atoms[j].x - atoms[i].x, y: atoms[j].y - atoms[i].y, z: atoms[j].z - atoms[i].z };
  const b2 = { x: atoms[k].x - atoms[j].x, y: atoms[k].y - atoms[j].y, z: atoms[k].z - atoms[j].z };
  const b3 = { x: atoms[l].x - atoms[k].x, y: atoms[l].y - atoms[k].y, z: atoms[l].z - atoms[k].z };
  
  const n1 = crossProduct(b1, b2);
  const n2 = crossProduct(b2, b3);
  
  const m1 = crossProduct(n1, b2);
  
  const x = dotProduct(n1, n2);
  const y = dotProduct(m1, n2);
  
  return Math.atan2(y, x) * (180 / Math.PI);
};

const crossProduct = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x
});

const dotProduct = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

// Calculate RMSD between two sets of atoms
const calculateRMSD = (atoms1, atoms2) => {
  if (atoms1.length !== atoms2.length) return null;
  
  let sum = 0;
  for (let i = 0; i < atoms1.length; i++) {
    const dx = atoms1[i].x - atoms2[i].x;
    const dy = atoms1[i].y - atoms2[i].y;
    const dz = atoms1[i].z - atoms2[i].z;
    sum += dx*dx + dy*dy + dz*dz;
  }
  
  return Math.sqrt(sum / atoms1.length);
};

// Color scale for partial charges
const getChargeColor = (charge) => {
  if (charge < -0.5) return '#0000FF'; // Deep blue
  if (charge < -0.3) return '#4169E1'; // Royal blue
  if (charge < -0.1) return '#87CEEB'; // Sky blue
  if (charge < 0.1) return '#FFFFFF'; // White
  if (charge < 0.3) return '#FFB6C1'; // Light red
  if (charge < 0.5) return '#FF6347'; // Tomato red
  return '#8B0000'; // Dark red
};

// Color scale for Vina scores
const getScoreColor = (score) => {
  if (score < -9) return '#00FF00'; // Green - excellent
  if (score < -7) return '#ADFF2F'; // Green yellow - good
  if (score < -5) return '#FFFF00'; // Yellow - moderate
  if (score < -3) return '#FFA500'; // Orange - poor
  return '#FF0000'; // Red - very poor
};

// Parse Vina/AutoDock docking PDBQT file
const parseDockingPDBQT = (fileContent) => {
  const result = {
    models: [],
    summary: {
      totalModels: 0,
      bestScore: Infinity,
      worstScore: -Infinity,
      avgScore: 0
    }
  };
  
  let currentModel = null;
  let inTorsionRemarks = false;
  let hasModelTags = false;
  
  const lines = fileContent.split('\n');
  let modelCount = 0;
  
  // Check if file has MODEL/ENDMDL tags
  hasModelTags = lines.some(line => line.trim().startsWith('MODEL'));
  
  // If no MODEL tags, treat entire file as single model
  if (!hasModelTags) {
    currentModel = {
      modelNumber: 1,
      atoms: [],
      torsions: [],
      branches: [],
      vinaScore: null,
      interEnergy: null,
      intraEnergy: null,
      totalEnergy: null,
      totalTorsions: 0,
      activeTorsions: 0
    };
    modelCount = 1;
  }
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Start new model (only if file has MODEL tags)
    if (trimmed.startsWith('MODEL')) {
      modelCount++;
      if (currentModel) {
        result.models.push(currentModel);
      }
      
      currentModel = {
        modelNumber: modelCount,
        atoms: [],
        torsions: [],
        branches: [],
        vinaScore: null,
        interEnergy: null,
        intraEnergy: null,
        totalEnergy: null,
        totalTorsions: 0,
        activeTorsions: 0
      };
      
      inTorsionRemarks = false;
    }
    
    // Parse VINA docking scores
    else if (trimmed.startsWith('REMARK VINA RESULT:') && currentModel) {
      const parts = trimmed.split(/\s+/).filter(p => p);
      if (parts.length >= 6) {
        currentModel.vinaScore = parseFloat(parts[3]);
        currentModel.rmsd_lb = parseFloat(parts[4]);
        currentModel.rmsd_ub = parseFloat(parts[5]);
      }
    }
    
    // Parse AutoDock4 format scores
    else if (trimmed.includes('Estimated Free Energy of Binding') && currentModel) {
      const match = trimmed.match(/[-\d\.]+/g);
      if (match && match[0]) {
        currentModel.vinaScore = parseFloat(match[0]);
      }
    }
    
    // Parse energy components
    else if (trimmed.startsWith('REMARK INTER + INTRA:') && currentModel) {
      currentModel.totalEnergy = parseFloat(trimmed.split(':')[1].trim());
    }
    else if (trimmed.startsWith('REMARK INTER:') && currentModel) {
      currentModel.interEnergy = parseFloat(trimmed.split(':')[1].trim());
    }
    else if (trimmed.startsWith('REMARK INTRA:') && currentModel) {
      currentModel.intraEnergy = parseFloat(trimmed.split(':')[1].trim());
    }
    
    // Parse torsion information
    else if (trimmed.includes('active torsions:') && currentModel) {
      const match = trimmed.match(/\d+/);
      if (match) {
        currentModel.totalTorsions = parseInt(match[0]);
        inTorsionRemarks = true;
      }
    }
    else if (inTorsionRemarks && trimmed.startsWith('REMARK') && trimmed.includes('between atoms:')) {
      const torsion = parseTorsionRemark(trimmed);
      if (torsion) {
        currentModel.torsions.push(torsion);
        if (torsion.status === 'A') currentModel.activeTorsions++;
      }
    }
    
    // Parse ATOM lines
    else if ((trimmed.startsWith('ATOM') || trimmed.startsWith('HETATM')) && currentModel) {
      try {
        const atomData = parsePDBQTAtomLine(line);
        currentModel.atoms.push(atomData);
      } catch (e) {
        console.warn('Failed to parse atom line:', line);
      }
    }
    
    // Parse BRANCH information
    else if (trimmed.startsWith('BRANCH') && currentModel) {
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 3) {
        currentModel.branches.push({
          from: parseInt(parts[1]),
          to: parseInt(parts[2])
        });
      }
    }
    
    // End model (only if file has ENDMDL tags)
    else if (trimmed.startsWith('ENDMDL') && hasModelTags) {
      if (currentModel) {
        result.models.push(currentModel);
        currentModel = null;
      }
      inTorsionRemarks = false;
    }
  }
  
  // If we have a current model that hasn't been added (single model file)
  if (currentModel && !hasModelTags) {
    result.models.push(currentModel);
  }
  
  // Calculate summary statistics
  if (result.models.length > 0) {
    const scores = result.models.map(m => m.vinaScore).filter(s => s !== null);
    if (scores.length > 0) {
      result.summary.bestScore = Math.min(...scores);
      result.summary.worstScore = Math.max(...scores);
      result.summary.avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    }
    result.summary.totalModels = result.models.length;
  }
  
  console.log('Parsed docking data:', result);
  return result;
};

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
    // PDBQT Docking Analysis state
  const [dockingData, setDockingData] = useState(null);
  const [showCharges, setShowCharges] = useState(false);
  const [showTorsions, setShowTorsions] = useState(true);
  const [showScores, setShowScores] = useState(true);
  const [referencePose, setReferencePose] = useState(0);
  
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
  // Visualize partial charges
  const visualizeCharges = (viewer, atoms) => {
    atoms.forEach(atom => {
      const color = getChargeColor(atom.charge);
      viewer.addSphere({
        center: { x: atom.x, y: atom.y, z: atom.z },
        radius: 0.3 + Math.abs(atom.charge) * 0.5,
        color: color,
        alpha: 0.6
      });
      
      // Label significant charges
      if (Math.abs(atom.charge) > 0.3) {
        viewer.addLabel(
          atom.charge.toFixed(2),
          {
            position: { x: atom.x, y: atom.y, z: atom.z },
            backgroundColor: color,
            fontColor: 'white',
            fontSize: 9
          }
        );
      }
    });
  };

  // Visualize active torsions
  const visualizeTorsions = (viewer, model) => {
    if (!model.torsions || model.torsions.length === 0) return;
    
    model.torsions.forEach(torsion => {
      if (torsion.status === 'A') {
        const atom1 = model.atoms.find(a => a.serial === torsion.atom1_index);
        const atom2 = model.atoms.find(a => a.serial === torsion.atom2_index);
        
        if (atom1 && atom2) {
          // Highlight rotatable bond
          viewer.addCylinder({
            start: { x: atom1.x, y: atom1.y, z: atom1.z },
            end: { x: atom2.x, y: atom2.y, z: atom2.z },
            radius: 0.2,
            color: '#FFD700', // Gold for active torsions
            dashed: true,
            dashLength: 0.4,
            gapLength: 0.3
          });
          
          // Label with bond info
          const midpoint = {
            x: (atom1.x + atom2.x) / 2,
            y: (atom1.y + atom2.y) / 2,
            z: (atom1.z + atom2.z) / 2
          };
          
          viewer.addLabel(
            `T${torsion.index}`,
            {
              position: midpoint,
              backgroundColor: 'rgba(255, 215, 0, 0.7)',
              fontColor: 'black',
              fontSize: 10
            }
          );
        }
      }
    });
  };

  // Visualize docking scores
// Visualize docking scores - FIXED VERSION
const visualizeScores = (viewer, models, currentIdx) => {
  if (!models || models.length === 0 || currentIdx >= models.length) return;
  
  const currentModel = models[currentIdx];
  if (currentModel.vinaScore === null || currentModel.vinaScore === undefined) {
    console.log('No Vina score available for model', currentIdx);
    return;
  }
  
  // Calculate centroid of ligand atoms
  const atoms = currentModel.atoms || [];
  if (atoms.length === 0) return;
  
  const centroid = atoms.reduce((acc, atom) => ({
    x: acc.x + atom.x / atoms.length,
    y: acc.y + atom.y / atoms.length,
    z: acc.z + atom.z / atoms.length
  }), { x: 0, y: 0, z: 0 });
  
  // Color based on score
  const color = getScoreColor(currentModel.vinaScore);
  
  // Add score label - FIXED: Show actual kcal/mol value
  viewer.addLabel(
    `Score: ${currentModel.vinaScore.toFixed(2)} kcal/mol`,
    {
      position: { 
        x: centroid.x, 
        y: centroid.y + 5, // Offset above ligand
        z: centroid.z 
      },
      backgroundColor: color,
      backgroundOpacity: 0.8,
      fontColor: 'white',
      fontSize: 12,
      showBackground: true
    }
  );
  
  // Add energy breakdown if available
  const hasInter = currentModel.interEnergy !== null && currentModel.interEnergy !== undefined;
  const hasIntra = currentModel.intraEnergy !== null && currentModel.intraEnergy !== undefined;
  
  if (hasInter && hasIntra) {
    viewer.addLabel(
      `Inter: ${currentModel.interEnergy.toFixed(2)}\nIntra: ${currentModel.intraEnergy.toFixed(2)}`,
      {
        position: { 
          x: centroid.x, 
          y: centroid.y + 7,
          z: centroid.z 
        },
        backgroundColor: '#333',
        backgroundOpacity: 0.8,
        fontColor: 'white',
        fontSize: 10,
        showBackground: true
      }
    );
  }
  
  // Also show RMSD bounds if available
  if (currentModel.rmsd_lb !== undefined && currentModel.rmsd_ub !== undefined) {
    viewer.addLabel(
      `RMSD lb/ub: ${currentModel.rmsd_lb.toFixed(2)}/${currentModel.rmsd_ub.toFixed(2)} Å`,
      {
        position: { 
          x: centroid.x, 
          y: centroid.y + 9,
          z: centroid.z 
        },
        backgroundColor: '#555',
        backgroundOpacity: 0.8,
        fontColor: 'white',
        fontSize: 9,
        showBackground: true
      }
    );
  }
};
  // Render molecules
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
          
          // Apply charge-based coloring if enabled
          if (showCharges && dockingData && dockingData.models[currentPose]) {
            const currentModel = dockingData.models[currentPose];
            visualizeCharges(viewer, currentModel.atoms);
          }
          
          // Visualize torsions if enabled
          if (showTorsions && dockingData && dockingData.models[currentPose]) {
            const currentModel = dockingData.models[currentPose];
            visualizeTorsions(viewer, currentModel);
          }
          
          // Visualize docking scores if enabled
          if (showScores && dockingData && dockingData.models[currentPose]) {
            visualizeScores(viewer, dockingData.models, currentPose);
          }
          
          // Calculate RMSD if reference pose is set
          if (dockingData && dockingData.models.length > 1 && referencePose !== currentPose) {
            const refModel = dockingData.models[referencePose];
            const currentModel = dockingData.models[currentPose];
            
            if (refModel.atoms.length === currentModel.atoms.length) {
              const rmsd = calculateRMSD(refModel.atoms, currentModel.atoms);
              if (rmsd !== null) {
                viewer.addLabel(
                  `RMSD to Pose ${referencePose + 1}: ${rmsd.toFixed(2)}Å`,
                  {
                    position: { x: 0, y: 20, z: 0 },
                    backgroundColor: '#333',
                    backgroundOpacity: 0.8,
                    fontColor: 'white',
                    fontSize: 11,
                    showBackground: true
                  }
                );
              }
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
    plipData, showInteractions, interactionFilters, isMultiModelLigand,
    dockingData, showCharges, showTorsions, showScores, referencePose]);

  // Auto-play
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
  setDockingData(null); // Reset docking data
  
  // Read first file to check for multiple models
  if (files.length > 0) {
    const firstFile = files[0];
    const content = await firstFile.text();
    const isMulti = hasMultipleModels(content);
    
    setIsMultiModelLigand(isMulti);
    
    // Store content for multi-model files
    if (isMulti) {
      setLigandFileContents([content]);
    } else {
      setLigandFileContents([]);
    }
    
    // Always try to parse docking data for PDBQT files
    if (firstFile.name.toLowerCase().endsWith('.pdbqt')) {
      try {
        const parsedData = parseDockingPDBQT(content);
        if (parsedData.models.length > 0) {
          setDockingData(parsedData);
          console.log(`✓ Parsed docking data:`, parsedData);
          
          if (isMulti) {
            const modelCount = parsedData.models.length;
            alert(`✓ Detected multi-model file with ${modelCount} poses!\nDocking scores and torsion data extracted automatically.`);
          } else {
            alert(`✓ Single model PDBQT file loaded!\nScore: ${parsedData.models[0]?.vinaScore?.toFixed(2) || 'N/A'} kcal/mol`);
          }
        }
      } catch (error) {
        console.warn('Could not parse docking data:', error);
      }
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
            <div className="text-4xl mb-2">🗐</div>
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
                {Array.from({ length: maxPoses }, (_, i) => {
                  let scoreText = '';
                  if (dockingData && dockingData.models[i]) {
                    const model = dockingData.models[i];
                    if (model.vinaScore !== null) {
                      scoreText = ` (${model.vinaScore.toFixed(2)} kcal/mol)`;
                    }
                  }
                  
                  return (
                    <option key={i} value={i}>
                      {isMultiModelLigand ? `MODEL ${i + 1}` : `Pose ${i + 1}`}
                      {scoreText}
                      {plipData && (() => {
                        const poseInteractions = plipData.filter(
                          inter => inter.position === String(i + 1)
                        );
                        return poseInteractions.length > 0 
                          ? ` [${poseInteractions.length} int.]` 
                          : '';
                      })()}
                    </option>
                  );
                })}
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

          {/* Docking Analysis Controls */}
          {dockingData && dockingData.models.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
        
                Docking Analysis
              </h3>
              
              <div className="space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showScores}
                    onChange={(e) => setShowScores(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm">Show Docking Scores</span>
                </label>
                
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showTorsions}
                    onChange={(e) => setShowTorsions(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm">Show Active Torsions</span>
                </label>
                

                
                {dockingData.models.length > 1 && (
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">
                      Reference for RMSD
                    </label>
                    <select
                      value={referencePose}
                      onChange={(e) => setReferencePose(Number(e.target.value))}
                      className="w-full text-sm border rounded px-2 py-1"
                    >
                      {dockingData.models.map((model, idx) => (
                        <option key={idx} value={idx}>
                          Pose {idx + 1} ({model.vinaScore ? model.vinaScore.toFixed(2) : 'N/A'} kcal/mol)
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}
        </div> {/* This closes lg:col-span-1 */}

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

                {/* NEW DOCKING ANALYSIS SECTION - ADD HERE */}
                {dockingData && dockingData.models[currentPose] && (
                  <div className="border-b pb-3">
                    <h4 className="font-semibold text-gray-700 mb-2">
                      Docking Analysis
                    </h4>
                    <div className="space-y-2 text-xs text-gray-600">
                      {dockingData.models[currentPose].vinaScore !== null && (
                        <div className="flex justify-between">
                          <span className="font-medium">Vina Score:</span>
                          <span 
                            className="font-bold"
                            style={{ color: getScoreColor(dockingData.models[currentPose].vinaScore) }}
                          >
                            {dockingData.models[currentPose].vinaScore.toFixed(2)} kcal/mol
                          </span>
                        </div>
                      )}
                      
                      {dockingData.models[currentPose].interEnergy !== null && (
                        <div className="flex justify-between">
                          <span>Interaction Energy:</span>
                          <span>{dockingData.models[currentPose].interEnergy.toFixed(2)}</span>
                        </div>
                      )}
                      
                      {dockingData.models[currentPose].intraEnergy !== null && (
                        <div className="flex justify-between">
                          <span>Internal Energy:</span>
                          <span>{dockingData.models[currentPose].intraEnergy.toFixed(2)}</span>
                        </div>
                      )}
                      
                      <div className="flex justify-between">
                        <span>Active Torsions:</span>
                        <span>{dockingData.models[currentPose].activeTorsions || 0} / {dockingData.models[currentPose].totalTorsions || 0}</span>
                      </div>
                      
                      {dockingData.summary && (
                        <div className="mt-2 pt-2 border-t border-gray-200">
                          <div className="text-xs text-gray-500">
                            Best: {dockingData.summary.bestScore.toFixed(2)} | 
                            Worst: {dockingData.summary.worstScore.toFixed(2)} | 
                            Avg: {dockingData.summary.avgScore.toFixed(2)}
                          </div>
                        </div>
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
        <h3 className="font-semibold text-blue-900 mb-2">Docking Analysis</h3>
        <div className="text-sm text-blue-800 space-y-2">
          <p><strong>Now supports AutoDock/Vina PDBQT files:</strong></p>
          <ul className="list-disc list-inside ml-2 space-y-1">
            <li><strong>Automatic score extraction:</strong> Vina binding scores</li>
            <li><strong>Rotatable bond visualization:</strong> Highlights active torsions from docking</li>
            <li><strong>Multi-model support:</strong> Automatic extraction of individual docking poses</li>
          </ul>
          <p className="mt-3"><strong>Supported docking formats:</strong></p>
          <ul className="list-disc list-inside ml-2">
            <li><strong>AutoDock/Vina PDBQT:</strong> Multi-model files with REMARK scores</li>
            <li><strong>Plip:</strong> Plip result pose interactions, Hydrophobic Interactions, Hydrogen Bonds etc</li>

          </ul>
        </div>
      </div>
    </div>
  );
}
