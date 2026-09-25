import re

with open('backend/src/index.ts', 'r') as f:
    content = f.read()

# Change JSON parsing to extract apiKey
old_parse = """        const { text, provider = "nvidia" } = await request.json() as { text: string, provider?: string };"""
new_parse = """        const { text, provider = "nvidia", apiKey } = await request.json() as { text: string, provider?: string, apiKey?: string };"""
content = content.replace(old_parse, new_parse)

# Change Gemini key logic
old_gemini = """          const apiKey = env.GEMINI_API_KEY;
          if (!apiKey) throw new Error("GEMINI_API_KEY not configured");"""
new_gemini = """          if (!apiKey) throw new Error("Please enter your Gemini API Key in the Sprekio settings.");"""
content = content.replace(old_gemini, new_gemini)

# Change Nvidia key logic
old_nvidia = """          const apiKey = env.NVIDIA_API_KEY;
          if (!apiKey) throw new Error("NVIDIA_API_KEY not configured");"""
new_nvidia = """          if (!apiKey) throw new Error("Please enter your Nvidia API Key in the Sprekio settings.");"""
content = content.replace(old_nvidia, new_nvidia)

with open('backend/src/index.ts', 'w') as f:
    f.write(content)
