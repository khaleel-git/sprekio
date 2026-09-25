import re

with open('Chrome Extension/src/content/index.tsx', 'r') as f:
    content = f.read()

# 1. Add state for API keys
state_old = """  const [ccSize, setCcSize] = useState<'small' | 'medium' | 'large'>('medium');"""
state_new = """  const [ccSize, setCcSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [geminiKey, setGeminiKey] = useState('');
  const [nvidiaKey, setNvidiaKey] = useState('');"""
content = content.replace(state_old, state_new)

# 2. Add to storage read
storage_get_old = """      chrome.storage.local.get(['sprekio_isEnabled', 'sprekio_autoPause', 'sprekio_provider', 'sprekio_subtitleStyle', 'sprekio_grammarColors', 'sprekio_translationEnabled', 'sprekio_ccVertical', 'sprekio_ccHorizontal', 'sprekio_ccSize'], (result) => {"""
storage_get_new = """      chrome.storage.local.get(['sprekio_isEnabled', 'sprekio_autoPause', 'sprekio_provider', 'sprekio_subtitleStyle', 'sprekio_grammarColors', 'sprekio_translationEnabled', 'sprekio_ccVertical', 'sprekio_ccHorizontal', 'sprekio_ccSize', 'sprekio_geminiKey', 'sprekio_nvidiaKey'], (result) => {"""
content = content.replace(storage_get_old, storage_get_new)

# 3. Add to storage load
storage_load_old = """        if (result.sprekio_ccSize !== undefined) setCcSize(result.sprekio_ccSize as any);"""
storage_load_new = """        if (result.sprekio_ccSize !== undefined) setCcSize(result.sprekio_ccSize as any);
        if (result.sprekio_geminiKey !== undefined) setGeminiKey(result.sprekio_geminiKey as string);
        if (result.sprekio_nvidiaKey !== undefined) setNvidiaKey(result.sprekio_nvidiaKey as string);"""
content = content.replace(storage_load_old, storage_load_new)

# 4. Add to storage save
storage_save_old = """          sprekio_ccHorizontal: ccHorizontal,
          sprekio_ccSize: ccSize
        });
      } catch (e) {"""
storage_save_new = """          sprekio_ccHorizontal: ccHorizontal,
          sprekio_ccSize: ccSize,
          sprekio_geminiKey: geminiKey,
          sprekio_nvidiaKey: nvidiaKey
        });
      } catch (e) {"""
content = content.replace(storage_save_old, storage_save_new)

# 5. Add to useEffect deps for storage save
storage_deps_old = """  }, [isEnabled, autoPause, provider, subtitleStyle, grammarColors, translationEnabled, ccVertical, ccHorizontal, ccSize, hasLoadedSettings]);"""
storage_deps_new = """  }, [isEnabled, autoPause, provider, subtitleStyle, grammarColors, translationEnabled, ccVertical, ccHorizontal, ccSize, geminiKey, nvidiaKey, hasLoadedSettings]);"""
content = content.replace(storage_deps_old, storage_deps_new)

# 6. Send the key in the API call
api_call_old = """        chrome.runtime.sendMessage(
          { action: "translateSentence", text: textToTranslate, provider },"""
api_call_new = """        const apiKey = provider === 'gemini' ? geminiKey : nvidiaKey;
        chrome.runtime.sendMessage(
          { action: "translateSentence", text: textToTranslate, provider, apiKey },"""
content = content.replace(api_call_old, api_call_new)

# 7. Add UI for entering API keys in settings menu
ui_old = """              <select value={provider} onChange={(e) => setProvider(e.target.value as any)} style={{ backgroundColor: '#3f3f3f', color: '#eee', border: '1px solid #555', borderRadius: '4px', padding: '3px', fontSize: '12px', cursor: 'pointer', outline: 'none' }}>
                <option value="youtube">YouTube (Native)</option>
                <option value="gemini">Gemini</option>
                <option value="nvidia">Nvidia</option>
              </select>
            </div>
            
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px'}}>"""

ui_new = """              <select value={provider} onChange={(e) => setProvider(e.target.value as any)} style={{ backgroundColor: '#3f3f3f', color: '#eee', border: '1px solid #555', borderRadius: '4px', padding: '3px', fontSize: '12px', cursor: 'pointer', outline: 'none' }}>
                <option value="youtube">YouTube (Native)</option>
                <option value="gemini">Gemini</option>
                <option value="nvidia">Nvidia</option>
              </select>
            </div>

            {provider === 'gemini' && (
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', marginTop: '2px'}}>
                <span style={{fontWeight: 'bold', color: '#f59e0b'}}>API Key:</span>
                <input type="password" value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)} placeholder="Gemini Key" style={{ backgroundColor: '#3f3f3f', color: '#eee', border: '1px solid #555', borderRadius: '4px', padding: '3px 6px', fontSize: '12px', width: '130px', outline: 'none' }} />
              </div>
            )}

            {provider === 'nvidia' && (
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', marginTop: '2px'}}>
                <span style={{fontWeight: 'bold', color: '#10b981'}}>API Key:</span>
                <input type="password" value={nvidiaKey} onChange={(e) => setNvidiaKey(e.target.value)} placeholder="Nvidia Key" style={{ backgroundColor: '#3f3f3f', color: '#eee', border: '1px solid #555', borderRadius: '4px', padding: '3px 6px', fontSize: '12px', width: '130px', outline: 'none' }} />
              </div>
            )}
            
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px'}}>"""

content = content.replace(ui_old, ui_new)

# Also add provider, geminiKey, nvidiaKey to the translation effect deps
deps_old = """  }, [liveText, isEnabled, translationEnabled, activeTranscriptIndex, transcript, provider]);"""
deps_new = """  }, [liveText, isEnabled, translationEnabled, activeTranscriptIndex, transcript, provider, geminiKey, nvidiaKey]);"""
content = content.replace(deps_old, deps_new)

with open('Chrome Extension/src/content/index.tsx', 'w') as f:
    f.write(content)

