import os, re

dirs = ['协会狩灵角色卡', '事务所狩灵角色卡', '工坊狩灵角色卡', '游魂角色卡', '罪灵角色卡', '锈钟角色卡']

for d in dirs:
    for root, dirs_list, files in os.walk(d):
        for f in files:
            if f.endswith('简介.md') and not f.startswith('.'):
                path = os.path.join(root, f).replace('\\', '/')
                with open(path, 'r', encoding='utf-8') as fh:
                    content = fh.read()

                # Extract key fields using regex
                name_match = re.search(r'姓名：(.+)', content)
                alias_match = re.search(r'一般称呼：(.+)', content)
                gender_match = re.search(r'性别：(.+)', content)
                age_match = re.search(r'年龄：(.+)', content)
                height_match = re.search(r'身高：(.+)', content)
                weight_match = re.search(r'体重：(.+)', content)
                faction_match = re.search(r'从属：(.+)', content)
                status_match = re.search(r'身份：(.+)', content)
                rank_match = re.search(r'评级：(.+)', content)
                eval_match = re.search(r'评估方：(.+)', content)
                header_match = re.match(r'^(.+档案：)', content)

                # Check for 五段式 structure
                sections = re.findall(r'^([一二三四五])、', content, re.MULTILINE)

                print(f"FILE: {path}")
                print(f"  档案头: {header_match.group(1) if header_match else 'MISSING'}")
                print(f"  姓名: {name_match.group(1) if name_match else '?'}")
                print(f"  一般称呼: {alias_match.group(1) if alias_match else '?'}")
                print(f"  性别: {gender_match.group(1) if gender_match else '?'}")
                print(f"  年龄: {age_match.group(1) if age_match else '?'}")
                print(f"  身高: {height_match.group(1) if height_match else '?'}")
                print(f"  体重: {weight_match.group(1) if weight_match else '?'}")
                print(f"  从属: {faction_match.group(1) if faction_match else '?'}")
                print(f"  身份: {status_match.group(1) if status_match else '?'}")
                print(f"  评级: {rank_match.group(1) if rank_match else '?'}")
                print(f"  评估方: {eval_match.group(1) if eval_match else '?'}")
                print(f"  五段式序号: {sections}")
                print()
