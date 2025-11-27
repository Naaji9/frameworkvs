# core/plip_parser.py

import xml.etree.ElementTree as ET

def parse_xml_file(xml_path: str) -> dict:
    """
    Parse a PLIP XML report and extract interaction details.

    Args:
        xml_path (str): Path to the PLIP XML output file.

    Returns:
        dict: Parsed interaction summary.
    """
    tree = ET.parse(xml_path)
    root = tree.getroot()

    interactions = []

    # PLIP XML structure: interactions are under <bindingsite> tags
    for bindingsite in root.findall(".//bindingsite"):
        site_info = {
            "site_id": bindingsite.attrib.get("id", ""),
            "interactions": []
        }
        for interaction in bindingsite.findall(".//interaction"):
            interaction_type = interaction.attrib.get("type", "")
            residues = []
            for residue in interaction.findall(".//residue"):
                res_name = residue.attrib.get("resname", "")
                res_num = residue.attrib.get("resnr", "")
                residues.append(f"{res_name}{res_num}")
            site_info["interactions"].append({
                "type": interaction_type,
                "residues": residues
            })
        interactions.append(site_info)

    return {
        "interaction_sites": interactions
    }

def parse_all_interactions(xml_path: str) -> dict:
    extract_hydrogen_bond_data(xml_path)
    extract_hydrophobic_data(xml_path)
    extract_halogen_bond_data(xml_path)
    extract_pi_stack_data(xml_path)
    extract_pi_cation_data(xml_path)
    extract_metal_complex_data(xml_path)
    extract_water_bridge_data(xml_path)
    extract_salt_bridge_data(xml_path)
    return {"status": "parsed", "xml": xml_path}
