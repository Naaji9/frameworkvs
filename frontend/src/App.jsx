import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import './styles/globals.css'
import Home from "./pages/Home";
import NewDocking from "./pages/NewDocking";
import AdvancedAnalysisPage from "./pages/AdvancedAnalysisPage"; 
import DocumentationPage from "./pages/DocumentationPage";

function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/new-docking" element={<NewDocking />} />
        <Route path="/advanced-analysis" element={<AdvancedAnalysisPage />} /> 
        <Route path="/documentation" element={<DocumentationPage />} />
      </Routes>
    </>
  );
}

export default App;

