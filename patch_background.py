import re

with open('Chrome Extension/src/background/index.ts', 'r') as f:
    content = f.read()

# Modify handleSentenceTranslation signature and call
old_sig = """async function handleSentenceTranslation(text: string, provider?: string) {"""
new_sig = """async function handleSentenceTranslation(text: string, provider?: string, apiKey?: string) {"""
content = content.replace(old_sig, new_sig)

old_body = """      body: JSON.stringify({ text, provider: provider || "nvidia" })"""
new_body = """      body: JSON.stringify({ text, provider: provider || "nvidia", apiKey })"""
content = content.replace(old_body, new_body)

# Update the call site in the message listener
old_call = """  if (request.action === "translateSentence") {
    handleSentenceTranslation(request.text, request.provider).then(sendResponse);"""
new_call = """  if (request.action === "translateSentence") {
    handleSentenceTranslation(request.text, request.provider, request.apiKey).then(sendResponse);"""
content = content.replace(old_call, new_call)

with open('Chrome Extension/src/background/index.ts', 'w') as f:
    f.write(content)
