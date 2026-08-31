import re
with open('src/context/AppContext.tsx', 'r') as f:
    content = f.read()

# find the value={{ block
match = re.search(r'value=\{\{(.*?)\}\}', content, re.DOTALL)
if match:
    props = match.group(1).split(',')
    unique_props = []
    for p in props:
        p_strip = p.strip()
        if not p_strip: continue
        if p_strip not in unique_props:
            unique_props.append(p_strip)
    
    new_val = "value={{\n      " + ",\n      ".join(unique_props) + "\n    }}"
    content = content[:match.start()] + new_val + content[match.end():]

with open('src/context/AppContext.tsx', 'w') as f:
    f.write(content)
