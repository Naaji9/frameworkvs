import { Link } from "react-router-dom";

export default function Navbar() {
  return (
    <nav className="fixed top-0 left-0 w-full bg-white shadow-md z-50">
      <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold text-blue-600">Combi-VS</h1>
        <div className="flex gap-4">
          <Link to="/" className="hover:text-blue-600">Home</Link>
    
          <Link to="/docs" className="hover:text-blue-600">
           User guide
          </Link>
        </div>
      </div>
    </nav>
  );
}

