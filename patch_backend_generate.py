import re

with open('backend/src/index.ts', 'r') as f:
    content = f.read()

old_gen = """        const TARGET_API_KEY = (provider === "gemini" ? env.GEMINI_API_KEY : env.NVIDIA_API_KEY) || apiKey;
        
        if (!TARGET_API_KEY) {
          return new Response(JSON.stringify({ error: `${provider.toUpperCase()}_API_KEY is not configured in Cloudflare Environment Variables, and no key was provided.` }), {"""

new_gen = """        const TARGET_API_KEY = apiKey;
        
        if (!TARGET_API_KEY) {
          return new Response(JSON.stringify({ error: `Please enter your ${provider} API Key in the Sprekio settings.` }), {"""

content = content.replace(old_gen, new_gen)

with open('backend/src/index.ts', 'w') as f:
    f.write(content)

