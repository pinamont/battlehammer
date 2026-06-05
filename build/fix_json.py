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
