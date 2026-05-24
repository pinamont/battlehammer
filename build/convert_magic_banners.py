import re
import json
import unicodedata
import sys

# ------------------------------------------------------------
# Utility: normalizza stringhe per creare ID leggibili
# ------------------------------------------------------------
def slugify(text):
    text = text.lower()
    text = unicodedata.normalize("NFD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return text.strip("_")

# ------------------------------------------------------------
# Estrae informazioni da frasi tipo "Solo Skaven."
# ------------------------------------------------------------
def parse_additional_rules(add_text):
    add_text = add_text.strip().rstrip(".")
    rules = {
        "only_for_army": [],
        "not_for_army": [],
        "only_for_type": [],
        "not_for_type": []
    }

    # SOLO X
    m = re.match(r"Solo (.+)", add_text, re.IGNORECASE)
    if m:
        banners = re.split(r" o | e |, ", m.group(1))
        rules["only_for_army"] = [slugify(x.strip()) for x in banners]
        return rules

    # NON PER X
    m = re.match(r"Non per (.+)", add_text, re.IGNORECASE)
    if m:
        banners = re.split(r" o | e |, ", m.group(1))
        rules["not_for_army"] = [slugify(x.strip()) for x in banners]
        return rules

    # Se vuoi aggiungere "Solo per maghi", "Non per demoni", ecc.
    # puoi estendere qui con altre regex

    return rules

def parse_category_restriction(category):
    rules = {
        "only_for_army": [],
        "not_for_army": [],
        "only_for_type": [],
        "not_for_type": []
    }

    # if category.casefold() == "arcani":
    #     rules["only_for_type"] = ["mago"]
    #
    # if category.casefold() == "armature magiche":
    #     rules["not_for_type"] = ["mago"]

    return rules

# ------------------------------------------------------------
# Parser principale
# ------------------------------------------------------------
def parse_magic_banners(tex_content):
    banners = []

    # Trova sezioni
    section_pattern = r"\\begin{sezione}{([^}]+)}(.*?)\\end{sezione}"
    sections = re.findall(section_pattern, tex_content, re.DOTALL)

    for section_name, section_body in sections:
        category = section_name.strip()
        category = category.casefold().title()

        # Salta gli stendardi magici
        if category != "Stendardi Magici":
            continue

        # Trova magicitemblock
        block_pattern = r"\\begin{magicitemblock}{([^}]+)}{([^}]+)}(.*?)\\end{magicitemblock}"
        blocks = re.findall(block_pattern, section_body, re.DOTALL)

        for name, cost, body in blocks:
            name = name.strip()
            name = name.casefold().title()
            name = name.replace("\\",'')
            name = name.replace('*','')
            cost = int(cost.strip())

            # Estrai eventuali \add{...}
            add_pattern = r"\\add{([^}]+)}"
            adds = re.findall(add_pattern, body)

            # Rimuovi le righe \add dal testo descrittivo
            description = re.sub(add_pattern, "", body).strip()
            description = re.sub(r"\s+", " ", description)

            # Regole derivate da \add
            rules = {
                "only_for_army": [],
                "not_for_army": [],
                "only_for_type": [],
                "not_for_type": []
            }

            for add in adds:
                parsed = parse_additional_rules(add)
                for k in rules:
                    rules[k].extend(parsed[k])

            parsed = parse_category_restriction(category)
            for k in rules:
                rules[k].extend(parsed[k])

            banner = {
                "id": slugify(name),
                "name": name,
                "cost": cost,
                "category": category,
                "description": description,
                "only_for_army": rules["only_for_army"],
                "not_for_army": rules["not_for_army"],
                "only_for_type": rules["only_for_type"],
                "not_for_type": rules["not_for_type"]
            }

            banners.append(banner)

    return banners

# ------------------------------------------------------------
# MAIN
# ------------------------------------------------------------
if __name__ == "__main__":
    input_file = sys.argv[1]

    if input_file == "":
        print("ERROR: need to specify input .tex file!")
        exit()

    with open(input_file, "r", encoding="utf-8") as f:
        tex = f.read()

    banners = parse_magic_banners(tex)

    output = {
        "magic_banners": banners
    }

    with open("data/magic_items/magic_banners.json", "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print("Creato magic_banners.json con", len(banners), "oggetti.")
