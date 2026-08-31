import re

with open('src/components/AudioRecorderPlayer.tsx', 'r') as f:
    content = f.read()

content = re.sub(
    r"// Fetch blob from temporary URL\s*const response = await fetch\(recordedAudio\.url\);\s*const blob = await response\.blob\(\);",
    "const blob = recordedAudio.blob;",
    content
)

with open('src/components/AudioRecorderPlayer.tsx', 'w') as f:
    f.write(content)
