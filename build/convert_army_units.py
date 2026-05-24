import re
import json
import unicodedata
import sys

# ------------------------------------------------------------
# Utility
# ------------------------------------------------------------

def slugify(text):
    text = text.lower()
    text = unicodedata.normalize("NFD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return text.strip("_")

def parse_range(text):
    """Converte '5-20' in (5, 20) oppure '1' in (1, 1)."""
    if "-" in text:
        a, b = text.split("-")
        return int(a), int(b)
    return int(text), int(text)

# ------------------------------------------------------------
# Parser principale
# ------------------------------------------------------------

def parse_army_units(tex):
    units = []

    # Trova sezioni
    section_pattern = r"\\begin{sezione}{([^}]+)}(.*?)\\end{sezione}"
    sections = re.findall(section_pattern, tex, re.DOTALL)

    for section_name, section_body in sections:
        category = section_name.strip()
        category = category.casefold().title()

        if (category == "Macchine E Mostri" or category == "Macchine da Guerra" or category == "Mostri"):
            category = "Macchine e Mostri"

        if (category == "Personaggi Speciali"):
            category = "Personaggi"

        if (category == "Cavalcature"):
            continue

        # Trova unitblock
        block_pattern = r"\\begin{unitblock}{([^}]+)}{([^}]+)}(.*?)\\end{unitblock}"
        blocks = re.findall(block_pattern, section_body, re.DOTALL)

        for name, cost, body in blocks:
            name = name.strip()
            cost = int(cost.strip().replace(" pt",""))

            unit = {
                "id": slugify(name),
                "name": name,
                "category": category,
                "cost_per_model": cost,
                "stats": {},
                "type": [],
                "min_size": 1,
                "max_size": 1,
                "rules": [],
                "equipment": [],
                "ranged": [],
                "options": [],
                "magic_item_slots": 0,
                "max_per_army": 0
            }

            # --- STATS ---
            m = re.search(r"\\stats{([^}]+)}{([^}]+)}{([^}]+)}{([^}]+)}{([^}]+)}", body)
            if m:
                unit["stats"] = {
                    "M": m.group(1),
                    "DC": m.group(2),
                    "D": m.group(3),
                    "F": m.group(4),
                    "R": m.group(5)
                }

            # --- TYPE ---
            m = re.search(r"\\type{([^}]+)}{([^}]+)}", body)
            if m:
                types = [t.strip() for t in m.group(1).split(",")]
                unit["type"] = types
                unit["min_size"], unit["max_size"] = parse_range(m.group(2))

            # --- REGOLE ---
            for r in re.findall(r"\\regole{([^}]+)}", body):
                unit["rules"].append(r.strip())

            # --- EQUIP ---
            for e in re.findall(r"\\equip{([^}]+)}", body):
                unit["equipment"].append(e.strip())

            # --- DISTANZA ---
            for d in re.findall(r"\\dist{([^}]+)}{([^}]+)}{([^}]+)}{([^}]+)}", body):
                unit["ranged"].append({
                    "name": d[0].strip(),
                    "range": d[1].strip(),
                    "dc": d[2].strip(),
                    "special": d[3].strip()
                })

            # --- OPZIONI ---
            for opt in re.findall(r"\\opt{([^}]+)}{([^}]+)}", body):
                name_opt = opt[0].strip()
                max_count = 1
                if "0-3" in name_opt:
                    name_opt = name_opt.replace("0-3 ","")
                    max_count = 3
                cost_opt = opt[1].strip().replace(" pt","")
                # FIXME
                cost_opt = cost_opt.split(',')[0]
                cost_opt = cost_opt.replace(" l'uno","")
                cost_opt = cost_opt.replace(" l'una","")
                #
                if "a modello" in cost_opt:
                    unit["options"].append({
                        "id": slugify(name_opt),
                        "name": name_opt,
                        "cost_per_model": int(cost_opt.replace("a modello",""))
                    })
                else:
                    unit["options"].append({
                        "id": slugify(name_opt),
                        "name": name_opt,
                        "cost": int(cost_opt)
                    })
                if max_count > 1:
                    unit["options"][-1]["max_count"] = max_count

            # --- MAX OGGETTI MAGICI ---
            m = re.search(r"opzioni.*?fino a (\d+) oggetti magici", body)
            if m:
                unit["magic_item_slots"] = int(m.group(1))

            # --- STENDARDO DA BATTAGLIA ---
            if "stendardo da battaglia" in unit["rules"]:
                unit["magic_banner_slot"] = True

            # --- PERSONAGGI SPECIALI ---
            if "personaggio speciale" in body.lower():
                unit["max_per_army"] = 1

            units.append(unit)

    return units

# ------------------------------------------------------------
# MAIN
# ------------------------------------------------------------

if __name__ == "__main__":
    input_file = sys.argv[1]
    faction_name = sys.argv[2]
    # or with slugify...

    if input_file == "":
        print("ERROR: need to specify input .tex file!")
        exit()

    with open(input_file, "r", encoding="utf-8") as f:
        tex = f.read()

    units = parse_army_units(tex)

    output = {
        f"{faction_name}": units
    }

    with open(f"data/armies/{faction_name}.json", "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"Creato {faction_name}.json con", len(units), "unità.")
