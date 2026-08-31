with open('src/context/AppContext.tsx', 'r') as f:
    lines = f.readlines()

new_lines = []
skip = False
for line in lines:
    if "showToast: (msg: string) => void;" in line:
        continue
    if "const showToast = useCallback((msg: string) => {" in line:
        skip = True
        continue
    if skip and "}, []);" in line:
        skip = False
        continue
    if skip:
        continue
    new_lines.append(line)

with open('src/context/AppContext.tsx', 'w') as f:
    f.writelines(new_lines)
