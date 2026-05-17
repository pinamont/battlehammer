import json
from pathlib import Path

TEMPLATE = Path("templates/builder_template.html")
OUTPUT = Path("dist/battlehammer_builder.html")
DATA_DIR = Path("data")

def build_html():
    # Carica template
    html = TEMPLATE.read_text(encoding="utf-8")

    # Combina tutti i JSON in un unico oggetto
    combined = {}

    for json_file in DATA_DIR.glob("*.json"):
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

    # Salva output
    OUTPUT.write_text(html, encoding="utf-8")
    print("Creato:", OUTPUT)

if __name__ == "__main__":
    build_html()
