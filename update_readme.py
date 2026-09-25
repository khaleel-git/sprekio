import re

with open('README.md', 'r') as f:
    content = f.read()

old_keys = """4. Configure your AI API Keys as Cloudflare Secrets:
   ```bash
   npx wrangler secret put GEMINI_API_KEY
   npx wrangler secret put NVIDIA_API_KEY
   ```"""

new_keys = """4. **Bring Your Own Key (BYOK)**: API keys are securely stored locally in the extension. Users must enter their own Google Gemini or Nvidia API Key directly into the Sprekio Settings Gear on YouTube."""

content = content.replace(old_keys, new_keys)

with open('README.md', 'w') as f:
    f.write(content)

