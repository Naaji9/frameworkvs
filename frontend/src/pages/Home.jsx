import { Link } from "react-router-dom";
import moleculeImage1 from "../assets/molecu1le.jpg";
import TypingEffect from "./TypingEffect"; 

export default function Home() {
  const typingText = "Use 'New Docking' for generating the script. Use the 'Advanced Analysis' page for analyzing results, such as PLIP, converting, scoring functions or Visualazing.";

  return (
    <div className="min-h-screen flex flex-col bg-white-50">
      {/* Main content in horizontal layout */}
      <div className="flex flex-1">
        {/* Left: Text and Buttons */}
        <div className="flex flex-col justify-center px-6 md:px-12 lg:px-44 w-auto lg:w-1/2 z-10">
          <h1 className="text-5xl font-extrabold text-blue-700 mb-4">FrameworkVS </h1>
          <p className="text-lg text-gray-700 max-w-xl mb-8">
            A modern virtual screening tool for ligand-receptor docking simulations and analysis.
          </p>

          <div className="flex gap-6 mb-4"> {/* Added mb-4 for spacing below buttons */}
            <Link to="/new-docking">
              <button className="bg-blue-500 text-white py-3 px-8 rounded-full text-lg hover:bg-blue-700 shadow-lg">
                ➕ New Docking
              </button>
            </Link>
            <Link to="/advanced-analysis">
              <button className="bg-gray-500 text-white py-3 px-8 rounded-full text-lg hover:bg-gray-700 shadow-lg">
                🧬 Advanced Analysis
              </button>
            </Link>
          </div>

          {/* New line with typing effect */}
          <div className="mt-4 max-w-xl">
            <TypingEffect text={typingText} speed={80} />
          </div>

        </div>

        {/* Right: Image */}
        <div className="w-1/2 relative flex items-center justify-start">
          <img
            src={moleculeImage1}
            alt="Molecular Docking"
            className="w-auto h-auto object-cover opacity-80"
          />
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center text-sm text-gray-600 py-4">
        © Combi-Lab VS 3.0 2025. All rights reserved.
      </footer>
    </div>
  );
}
