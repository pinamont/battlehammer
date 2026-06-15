import json
import sys
from collections import defaultdict

# ------------------------------------------------------------
# Helpers
# ------------------------------------------------------------

CATEGORY_ORDER = [
    "Armi Magiche",
    "Armature Magiche",
    "Difese Arcane",
    "Oggetti Incantati",
    "Arcani",
    "Ricettacoli"
]

def latex_escape(s):
    """Escape minimale per caratteri speciali LaTeX."""
    return (
         s.replace("\\", "\\\\")
         .replace("&", "\\&")
         .replace("%", "\\%")
         .replace("$", "\\$")
         .replace("#", "\\#")
         .replace("_", "\\_")
         .replace("{", "\\{")
         .replace("}", "\\}")
    )

# def format_restrictions(item):
#     """Converte le restrizioni in testo leggibile per \\add{}."""
#     parts = []
#
#     # Solo per armate
#     if item.get("only_for_army"):
#         armies = [a.capitalize() for a in item["only_for_army"]]
#         if len(armies) == 1:
#             parts.append(f"Solo {armies[0]}.")
#         else:
#             parts.append("Solo " + " o ".join(armies) + ".")
#
#     # Non per armate
#     if item.get("not_for_army"):
#         armies = [a.capitalize() for a in item["not_for_army"]]
#         if len(armies) == 1:
#             parts.append(f"Non per {armies[0]}.")
#         else:
#             parts.append("Non per " + " o ".join(armies) + ".")
#
#     # Solo per tipo
#     if item.get("only_for_type"):
#         types = [t.capitalize() for t in item["only_for_type"]]
#         if len(types) == 1:
#             parts.append(f"Solo per {types[0]}.")
#         else:
#             parts.append("Solo per " + " o ".join(types) + ".")
#
#     # Non per tipo
#     if item.get("not_for_type"):
#         types = [t.capitalize() for t in item["not_for_type"]]
#         if len(types) == 1:
#             parts.append(f"Non per {types[0]}.")
#         else:
#             parts.append("Non per " + " o ".join(types) + ".")
#
#     # Multiple
#     if item.get("allow_multiple"):
#         parts.append("Se ne può selezionare più di una per esercito.")
#
#     if item.get("allow_multiple_per_model"):
#         parts.append("Se ne può selezionare più di una per modello.")
#
#     if not parts:
#         return ""
#
#     return " ".join(parts)
def format_restrictions(item):
    parts = []

    category = item.get("category", "").lower()

    # --- 1) Solo per armate ---
    if item.get("only_for_army"):
        armies = [pretty_name(a) for a in item["only_for_army"]]
        if len(armies) == 1:
            parts.append(f"Solo {armies[0]}.")
        else:
            parts.append("Solo " + " o ".join(armies) + ".")

    # --- 2) Non per armate ---
    if item.get("not_for_army"):
        armies = [pretty_name(a) for a in item["not_for_army"]]
        if len(armies) == 1:
            parts.append(f"Non per {armies[0]}.")
        else:
            parts.append("Non per " + " o ".join(armies) + ".")

    # --- 3) Solo per tipo ---
    if item.get("only_for_type"):
        types = [pretty_name(t) for t in item["only_for_type"]]

        # FIX: gli Arcani non devono mai dire “Solo per Mago.”
        if category == "arcani" and types == ["Mago"]:
            pass
        else:
            if len(types) == 1:
                parts.append(f"Solo per {types[0]}.")
            else:
                parts.append("Solo per " + " o ".join(types) + ".")

    # FIX: Armature Magiche → “Può essere usata da un Mago.”
    if category == "armature magiche" and not "Mago" in item.get("not_for_type"):
        parts.append("Può essere usato da un Mago.")

    # --- 4) Non per tipo ---
    if item.get("not_for_type"):
        types = [pretty_name(t) for t in item["not_for_type"]]

        # FIX: Armature Magiche → non mostrare “Non può essere usata da un Mago.”
        if category == "armature magiche" and "Mago" in types:
            types.remove("Mago")

        if len(types) == 1:
            parts.append(f"Non per {types[0]}.")
        elif len(types) >= 2:
            parts.append("Non per " + " o ".join(types) + ".")

    # --- 5) Solo per unità ---
    if item.get("only_for_unit"):
        units = [pretty_name(u) for u in item["only_for_unit"]]
        if len(units) == 1:
            parts.append(f"Solo per {units[0]}.")
        elif len(units) >= 2:
            parts.append("Solo per " + " o ".join(units) + ".")

    # --- 6) Multiple ---
    if item.get("allow_multiple"):
        parts.append("Se ne può selezionare più di una per esercito.")

    if item.get("allow_multiple_per_model"):
        parts.append("Se ne può selezionare più di una per modello.")

    return " ".join(parts)

# ------------------------------------------------------------
# Main conversion
# ------------------------------------------------------------

def convert_magic_items(json_path, tex_path):
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    items = data["magic_items"]

    # Raggruppa per categoria
    by_category = defaultdict(list)
    for item in items:
        by_category[item["category"]].append(item)
    #
    # # Ordina categorie alfabeticamente (o mantieni ordine originale)
    # categories = sorted(by_category.keys())

    # Ordina secondo CATEGORY_ORDER, mantenendo eventuali categorie extra in fondo
    categories = sorted(
        by_category.keys(),
        key=lambda c: CATEGORY_ORDER.index(c) if c in CATEGORY_ORDER else 999
    )

    with open(tex_path, "w", encoding="utf-8") as out:

        for idx, cat in enumerate(categories):
            items_in_cat = by_category[cat]

            # Nuova pagina + sezione
            out.write("\\newpage\n")
            out.write(f"\\begin{{sezione}}{{{latex_escape(cat.upper())}}}\n\n")

            # Ogni oggetto magico
            for item in items_in_cat:
                name = latex_escape(item["name"].upper())
                cost = item["cost"]
                desc = latex_escape(item["description"])
                restrictions = format_restrictions(item)

                out.write(f"\\begin{{magicitemblock}}{{{name}}}{{{cost}}}\n")
                out.write(desc + "\n")

                if restrictions:
                    out.write(f"\\add{{{latex_escape(restrictions)}}}\n")

                out.write("\\end{magicitemblock}\n\n")

            out.write("\\end{sezione}\n\n")
            out.write("%----------------------------\n\n")

    print(f"Creato file LaTeX: {tex_path}")

# def final_fix_to_tex(tex_path):
#   # temp file
#   os.system(f"mv {tex_path} tmp_{tex_path}")
#   # open input and output files
#   with open(f"tmp_{tex_path}", "rt") as fin:
#     with open(f"{tex_path}", "wt") as fout:
#         for line in fin:
#             new_line = line
#             new_line = new_line.replace('Elfi\_alti','Elfi Alti')
#             new_line = new_line.replace('Elfi\_silvani','Elfi Silvani')
#             new_line = new_line.replace('Orchi\_e\_goblin','Orchi e Goblin')
#             new_line = new_line.replace('Goblin\_delle\_tenebre','Goblin Delle Tenebre')
# #             ...
#             fout.write(new_line)

def pretty_name(s):
    # Eccezioni manuali
    special = {
        "elfi_alti": "Elfi Alti",
        "elfi_silvani": "Elfi Silvani",
        "orchi_e_goblin": "Orchi e Goblin",
        "goblin_delle_tenebre": "Goblin Delle Tenebre",
    }
    if s in special:
        return special[s]

    # Conversione generica: snake_case → Titolo
    parts = s.split("_")
    return " ".join(p.capitalize() for p in parts)



# ------------------------------------------------------------
# CLI
# ------------------------------------------------------------

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Uso: python magic_items_to_tex.py input.json output.tex")
        sys.exit(1)

    convert_magic_items(sys.argv[1], sys.argv[2])
    # final_fix_to_tex(sys.argv[2])
