import re

with open('src/context/AppContext.tsx', 'r') as f:
    content = f.read()

# Add toastAction to AppContextType
content = content.replace(
    'toastMessage: string | null;',
    'toastMessage: string | null;\n  toastAction?: { label: string; onClick: () => void } | null;\n  showToast: (msg: string, action?: { label: string; onClick: () => void }) => void;'
)

# Add showToast function to AppProvider
replacement = """  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastAction, setToastAction] = useState<{ label: string; onClick: () => void } | null>(null);

  const showToast = (msg: string, action?: { label: string; onClick: () => void }) => {
    setToastMessage(msg);
    setToastAction(action || null);
    setTimeout(() => {
      setToastMessage(prev => prev === msg ? null : prev);
      setToastAction(prev => prev === action ? null : prev);
    }, 6000);
  };
"""
content = re.sub(
    r"const \[toastMessage, setToastMessage\] = useState<string \| null>\(null\);",
    replacement,
    content
)

# Replace existing setToastMessage calls
content = re.sub(
    r"setToastMessage\((.*?)\);.*?setTimeout\(\(\) => setToastMessage\(null\), 3000\);",
    r"showToast(\1);",
    content,
    flags=re.DOTALL
)

# Add to value
content = content.replace('toastMessage,\n', 'toastMessage,\n      toastAction,\n      showToast,\n')

with open('src/context/AppContext.tsx', 'w') as f:
    f.write(content)
