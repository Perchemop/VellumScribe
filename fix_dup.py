import re

with open('src/context/AppContext.tsx', 'r') as f:
    content = f.read()

content = content.replace('setDarkMode,\n      showToast,\n      refreshData,', 'setDarkMode,\n      refreshData,')

with open('src/context/AppContext.tsx', 'w') as f:
    f.write(content)
