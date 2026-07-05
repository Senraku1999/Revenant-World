import sys
sys.stdout = open('brede_level1_output.txt', 'w', encoding='utf-8')
sys.stderr = sys.stdout

import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))

# Import and run the checker directly
import importlib.util
spec = importlib.util.spec_from_file_location("checker", "审查脚本_GBT15834_一级国标.py")
checker_mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker_mod)
