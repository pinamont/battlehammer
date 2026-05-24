import json
from pathlib import Path

TEMPLATE = Path("templates/builder_template.html")
OUTPUT = Path("dist/battlehammer_builder.html")
DATA_DIR = Path("data")
TEMPLATE_DIR = Path("templates")

def build_html():
    # Carica template
    html = TEMPLATE.read_text(encoding="utf-8")

    # Carica altri file secondo i sotto template
    fileMap = {
        "__HEAD__" : "builder_template_head.html",
        "__HEADER__" : "builder_template_header.html",
        "__MAIN__" : "builder_template_main.html",
        "__SCRIPT__" : "builder_template_script.js",
        # "__IMFELL__" : "inputs/imfell.txt",
        # "__EBGARAMOND__" : "inputs/ebgaramond.txt",
        # "__BORDER_IMAGE__" : "inputs/border_image.txt"
        }
    for keyword,fileName in fileMap.items():
        print(keyword + " <-- " + fileName)
        text = ""
        for inFile in TEMPLATE_DIR.glob(fileName):
            print(inFile)
            text += inFile.read_text(encoding="utf-8")
        # questi due devono essere a riga singola
        if keyword in ["__IMFELL__","__BORDER_IMAGE__"]:
            text = text.replace("\n", "")
        html = html.replace(keyword, text)


    # Combina tutti i JSON in un unico oggetto
    combined = {}

    for json_file in DATA_DIR.glob("armies/*.json"):
        data = json.loads(json_file.read_text(encoding="utf-8"))

        # Ogni file deve avere una singola chiave (nome fazione)
        if len(data.keys()) != 1:
            raise ValueError(f"Il file {json_file} deve avere una sola chiave (nome fazione).")

        faction_name = list(data.keys())[0]
        combined[faction_name] = data[faction_name]

    # Converti in testo JSON
    json_text = json.dumps(combined, indent=2)

    # Inserisci nel template
    html = html.replace("__FACTION_JSON__", json_text)

    # --- #

    # Stessa cosa per gli oggetti magici
    combined = {}

    for json_file in DATA_DIR.glob("magic_items/*.json"):
        data = json.loads(json_file.read_text(encoding="utf-8"))

        # Ogni file deve avere una singola chiave (nome fazione)
        if len(data.keys()) != 1:
            raise ValueError(f"Il file {json_file} deve avere una sola chiave (nome fazione).")

        faction_name = list(data.keys())[0]
        combined[faction_name] = data[faction_name]

    # Converti in testo JSON
    json_text = json.dumps(combined, indent=2)

    # Inserisci nel template
    html = html.replace("__ITEM_JSON__", json_text)

    # Salva output
    OUTPUT.write_text(html, encoding="utf-8")
    print("Creato:", OUTPUT)

if __name__ == "__main__":
    build_html()
