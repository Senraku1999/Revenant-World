import json, os

dirs = ['协会狩灵角色卡', '事务所狩灵角色卡', '工坊狩灵角色卡', '游魂角色卡', '罪灵角色卡', '锈钟角色卡']
results = []

for d in dirs:
    for root, dirs_list, files in os.walk(d):
        for f in files:
            if f.endswith('.json') and not f.startswith('.'):
                path = os.path.join(root, f).replace('\\', '/')
                try:
                    with open(path, 'r', encoding='utf-8') as fh:
                        data = json.load(fh)
                    results.append({
                        'file': path,
                        'char_name': data.get('char_name', '?'),
                        'char_fullname': data.get('char_fullname', '?'),
                        'char_alias': data.get('char_alias', '?'),
                        'char_identity': data.get('char_identity', '?'),
                        'char_rank': data.get('char_rank', '?'),
                        'char_faction': data.get('char_faction', '?'),
                        'char_status': data.get('char_status', '?'),
                        'gender': data.get('char_persona', {}).get('gender', '?'),
                        'age': data.get('char_persona', {}).get('age', 0),
                        'height': data.get('char_persona', {}).get('appearance', {}).get('height', '?'),
                        'weight': data.get('char_persona', {}).get('appearance', {}).get('weight', '?'),
                        'weapon': str(data.get('char_persona', {}).get('appearance', {}).get('weapon', '?'))[:200],
                        'spirit': str(data.get('char_basic_abilities', {}).get('灵力', '?'))[:150],
                        'sight': str(data.get('char_basic_abilities', {}).get('灵视', '?'))[:150],
                        'physique': str(data.get('char_basic_abilities', {}).get('身体素质', '?'))[:150],
                        'special_keys': list(data.get('char_special_abilities', {}).keys()) if isinstance(data.get('char_special_abilities'), dict) else [],
                        'rel_keys': list(data.get('char_relationships', {}).keys()) if isinstance(data.get('char_relationships'), dict) else [],
                    })
                except Exception as e:
                    results.append({'file': path, 'error': str(e)})

for r in sorted(results, key=lambda x: x.get('file', '')):
    print(f"FILE: {r['file']}")
    if 'error' in r:
        print(f"  ERROR: {r['error']}")
        continue
    print(f"  name={r['char_name']} | fullname={r['char_fullname']} | alias={r['char_alias']}")
    print(f"  identity={r['char_identity']} | rank={r['char_rank']}")
    print(f"  faction={r['char_faction']} | status={r['char_status']}")
    print(f"  gender={r['gender']} | age={r['age']} | height={r['height']} | weight={r['weight']}")
    print(f"  weapon={r['weapon'][:150]}")
    print(f"  灵力={r['spirit'][:120]}")
    print(f"  灵视={r['sight'][:120]}")
    print(f"  身体素质={r['physique'][:120]}")
    print(f"  special_keys={r['special_keys']}")
    print(f"  rel_keys={r['rel_keys']}")
    print()
