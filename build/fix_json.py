import json
import sys
import re

def pretty_json(data):
    data = re.sub(r': {\n        "', r': { "', data)
    data = re.sub(r',\n        ', r', ', data)
    data = re.sub(r'\n      }', r' }', data)
    data = re.sub(r'\n      \]', r' ]', data)

    data = re.sub(r'\[\n        ', r'[ ', data)
    data = re.sub(r'\[ {', r'[\n        {', data)
    data = re.sub(r'', r'', data)
    data = re.sub(r',   ', r', ', data)
    data = re.sub(r'{\n          ', r'{ ', data)
    data = re.sub(r'\n        }', r' }', data)
    data = re.sub(r' }, { ', r' },\n        { ', data)
    # data = re.sub(r'', r'', data)
    # data = re.sub(r'', r'', data)
    # data = re.sub(r'', r'', data)

    data = re.sub(r'"M":','"Movimento":', data)
    data = re.sub(r'"DC":','"Attacco":', data)
    data = re.sub(r'"D":','"Difesa":', data)
    data = re.sub(r'"F":','"Corpo":', data)
    data = re.sub(r'"R":','"Coraggio":', data)

    data = re.sub(r'"dc":','"att":', data)
    data = re.sub(r'"special":','"spec":', data)

    data = re.sub(r'"id": "campione", "name": "campione",'
                  ,'"id": "campione", "name": "campione", "stat_modifiers": {"Attacco": 1},', data)
    data = re.sub(r'"id": "scudo", "name": "scudo",'
                  ,'"id": "scudo", "name": "scudo", "add_equipment": "scudo", "stat_modifiers": {"Difesa": 1},', data)
    data = re.sub(r'"id": "armatura_pesante", "name": "armatura pesante",'
                  ,'"id": "armatura_pesante", "name": "armatura pesante", "add_equipment": "armatura pesante", "stat_modifiers": {"Difesa": 1},', data)
    data = re.sub(r'"id": "arma_a_due_mani", "name": "arma a due mani",'
                  ,'"id": "arma_a_due_mani", "name": "arma a due mani", "add_equipment": "arma a due mani", "stat_modifiers": {"Attacco": 1},', data)
    data = re.sub(r'"id": "due_armi", "name": "due armi",'
                  ,'"id": "due_armi", "name": "due armi", "add_equipment": "due armi", "stat_modifiers": {"Attacco": 1},', data)
    data = re.sub(r'"id": "lancia", "name": "lancia",'
                  ,'"id": "lancia", "name": "lancia", "add_equipment": "lancia", "add_spec": {"Attacco": "+1 in carica (se a cavallo)"},', data)
    data = re.sub(r'"id": "lancia_da_cavaliere", "name": "lancia da cavaliere",'
                  ,'"id": "lancia_da_cavaliere", "name": "lancia da cavaliere", "add_equipment": "lancia da cavaliere", "add_spec": {"Attacco": "+2 in carica (se a cavallo)"},', data)
    data = re.sub(r'"id": "alabarda", "name": "alabarda",'
                  ,'"id": "alabarda", "name": "alabarda", "add_equipment": "alabarda", "add_spec": {"Attacco": "+1 se non carica e unità 8+"},', data)
    data = re.sub(r'"id": "cavallo", "name": "cavallo",'
                  ,'"id": "cavallo", "name": "cavallo", "add_mount": "cavallo", "stat_modifiers": {"Movimento": 1, "Corpo": 1}, "change_type": {"fanteria": "cavalleria_leggera"},', data)
    data = re.sub(r'"id": "falco_gigante", "name": "falco gigante",'
                  ,'"id": "falco_gigante", "name": "falco gigante", "add_mount": "falco gigante", "stat_modifiers": {"Corpo": 1}, "change_type": {"fanteria": "cavalleria_volante"}, "add_spec": {"Movimento": "movimento in volo 4 caselle"},', data)
    data = re.sub(r'"id": "cavallo_bardato", "name": "cavallo bardato",'
                  ,'"id": "cavallo_bardato", "name": "cavallo bardato", "add_mount": "cavallo bardato", "stat_modifiers": {"Movimento": 1, "Difesa": 1, "Corpo": 1}, "change_type": {"fanteria": "cavalleria_pesante"},', data)
    data = re.sub(r'"id": "drago", "name": "drago",'
                  ,'"id": "drago", "name": "drago", "add_mount": "drago",', data)
    data = re.sub(r'"id": "pegaso", "name": "pegaso",'
                  ,'"id": "pegaso", "name": "pegaso", "add_mount": "pegaso",', data)
    data = re.sub(r'"id": "grifone", "name": "grifone",'
                  ,'"id": "grifone", "name": "grifone", "add_mount": "grifone",', data)
    data = re.sub(r'"id": "manticora", "name": "manticora",'
                  ,'"id": "manticora", "name": "manticora", "add_mount": "manticora",', data)
    data = re.sub(r'"id": "viverna", "name": "viverna",'
                  ,'"id": "viverna", "name": "viverna", "add_mount": "viverna",', data)
    data = re.sub(r'"id": "ippogriffo", "name": "ippogriffo",'
                  ,'"id": "ippogriffo", "name": "ippogriffo", "add_mount": "ippogriffo",', data)
    data = re.sub(r'"id": "aquila", "name": "aquila",'
                  ,'"id": "aquila_gigante", "name": "aquila gigante", "add_mount": "aquila_gigante",', data)

    return data

# ---- ESEMPIO DI UTILIZZO ----

if __name__ == "__main__":
  input_file = sys.argv[1]
  output_file = sys.argv[2]
  # output_file = input_file

  with open(input_file, "r", encoding="utf-8") as f:
    data = json.load(f)

  json_dumps = json.dumps(data, ensure_ascii=False, indent=2)
  formatted = pretty_json(json_dumps)

  with open(output_file, "w", encoding="utf-8") as f:
    f.write(formatted)

  print(f"Fatto! File salvato come {output_file}")
