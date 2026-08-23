import { useEffect, useState } from 'react';
import './App.css';

interface SavedWord {
  id: string;
  word: string;
  translation: string;
  type?: string;
  gender?: string;
  contextSentence: string;
  savedAt: string;
}

function App() {
  const [user, setUser] = useState<{ uid: string, email: string } | null>(null);
  const [words, setWords] = useState<SavedWord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWords = () => {
    setLoading(true);
    chrome.runtime.sendMessage({ action: "getWords" }, (res) => {
      if (res && res.success) {
        setWords(res.words);
      }
      setLoading(false);
    });
  };

  useEffect(() => {
    // Check auth
    chrome.runtime.sendMessage({ action: "checkAuth" }, (res) => {
      if (res && res.loggedIn) {
        setUser(res.user);
        fetchWords();
      } else {
        setLoading(false);
      }
    });
  }, []);

  const handleLogin = () => {
    setLoading(true);
    chrome.runtime.sendMessage({ action: "login" }, (res) => {
      if (res && res.success) {
        setUser(res.user);
        fetchWords();
      } else {
        alert("Login failed: " + (res?.error || "Unknown error"));
        setLoading(false);
      }
    });
  };

  const launchDashboard = () => {
    chrome.tabs.create({ url: 'https://sprekio.khaleel.eu/' });
  };

  return (
    <div className="w-80 p-6 bg-white text-gray-900 font-sans flex flex-col relative text-center">
      <div className="text-5xl mb-4 mt-2">🇩🇪</div>
      <h1 className="text-3xl font-black tracking-tight text-gray-900 mb-2">Sprekio</h1>
      <p className="text-sm text-gray-500 mb-8 px-2">Your personalized German language lab. Syncs instantly with YouTube.</p>

      {!user ? (
        <button 
          onClick={handleLogin}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl shadow-md w-full transition-all"
        >
          {loading ? "Loading..." : "Sign in to Google"}
        </button>
      ) : (
        <div className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
            <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Total Words</p>
            <p className="text-3xl font-black text-blue-600">{words.length}</p>
          </div>
          
          <button 
            onClick={launchDashboard}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 px-6 rounded-xl shadow-lg shadow-indigo-200 w-full transition-all transform hover:-translate-y-0.5"
          >
            Launch Dashboard 🚀
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
