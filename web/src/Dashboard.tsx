import { useEffect, useState } from 'react';
import { auth, loginWithGoogle, logout, getVocabularyWords, deleteVocabularyWord, updateVocabularyWordStatus } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';

interface SavedWord {
  id: string;
  word: string;
  translation: string;
  type?: string;
  gender?: string;
  contextSentence: string;
  savedAt: any;
  videoId?: string;
  videoTitle?: string;
  saveCount?: number;
  status?: 'learning' | 'learned';
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<'vault' | 'videos' | 'quiz'>('vault');
  const [words, setWords] = useState<SavedWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ uid: string, email: string } | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser({ uid: firebaseUser.uid, email: firebaseUser.email || '' });
        const wordRes = await getVocabularyWords(firebaseUser.uid);
        if (wordRes.success) {
          setWords(wordRes.words);
        }
      } else {
        setUser(null);
        setWords([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    setLoading(true);
    await loginWithGoogle();
    setLoading(false);
  };

  const playAudio = (text: string) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    window.speechSynthesis.speak(utterance);
  };

  const getGenderColor = (gender?: string) => {
    if (gender?.toLowerCase() === 'der') return 'text-blue-600 bg-blue-50 border-blue-200';
    if (gender?.toLowerCase() === 'die') return 'text-red-600 bg-red-50 border-red-200';
    if (gender?.toLowerCase() === 'das') return 'text-green-600 bg-green-50 border-green-200';
    return 'text-gray-600 bg-gray-50 border-gray-200';
  };

  return (
    <div className="flex h-screen bg-[#f8fafc] text-gray-900 font-sans selection:bg-blue-200">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col shadow-sm z-10">
        <div className="p-6">
          <h1 className="text-2xl font-black tracking-tighter text-blue-600 flex items-center gap-2">
            <span>🇩🇪</span> Sprekio
          </h1>
        </div>
        
        <div className="flex-1 px-4 py-2 space-y-2">
          <button 
            onClick={() => setActiveTab('vault')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'vault' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <span>📚</span> Vocab Vault
          </button>
          <button 
            onClick={() => setActiveTab('videos')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'videos' ? 'bg-purple-50 text-purple-700' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <span>📺</span> Watched Videos
          </button>
          <button 
            onClick={() => setActiveTab('quiz')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'quiz' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <span>🎮</span> Quiz Arena
          </button>
        </div>

        {user && (
          <div className="p-4 border-t border-gray-100 flex flex-col gap-2">
            <div className="text-sm font-medium text-gray-500 truncate">
              {user.email}
            </div>
            <button 
              onClick={logout}
              className="text-xs text-red-500 hover:text-red-700 font-medium text-left"
            >
              Log out
            </button>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600"></div>
          </div>
        ) : !user ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8">
            <h2 className="text-3xl font-bold mb-4">Welcome to Sprekio!</h2>
            <p className="text-gray-500 mb-8 max-w-md">Log in to view your saved German vocabulary, practice with quizzes, and track the videos you've learned from.</p>
            <button 
              onClick={handleLogin}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-full shadow-lg transition-colors text-lg"
            >
              Sign in with Google
            </button>
          </div>
        ) : activeTab === 'vault' ? (
          <VocabularyVault words={words} setWords={setWords} user={user} playAudio={playAudio} getGenderColor={getGenderColor} />
        ) : activeTab === 'videos' ? (
          <VideoTracker words={words} />
        ) : (
          <QuizArena words={words} />
        )}
      </div>
    </div>
  );
}

function VocabularyVault({ words, setWords, user, playAudio, getGenderColor }: any) {
  const [filter, setFilter] = useState<'all' | 'learning' | 'learned'>('all');

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this word completely?")) return;
    const res = await deleteVocabularyWord(user.uid, id);
    if (res.success) {
      setWords((prev: any) => prev.filter((w: any) => w.id !== id));
    } else {
      alert("Failed to delete word: " + (res.error || "Unknown error"));
    }
  };

  const handleUpdateStatus = async (id: string, status: 'learning' | 'learned') => {
    const res = await updateVocabularyWordStatus(user.uid, id, status);
    if (res.success) {
      setWords((prev: any) => prev.map((w: any) => w.id === id ? { ...w, status } : w));
    } else {
      alert("Failed to update word status: " + (res.error || "Unknown error"));
    }
  };

  if (words.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center">
        <span className="text-6xl mb-4 opacity-50">📭</span>
        <h2 className="text-2xl font-bold text-gray-800">Your vault is empty</h2>
        <p className="text-gray-500 mt-2">Go watch some YouTube and save new words!</p>
      </div>
    );
  }

  const learningWords = words.filter((w: any) => w.status !== 'learned');
  const learnedWords = words.filter((w: any) => w.status === 'learned');

  const displayedWords = filter === 'all' ? words : filter === 'learning' ? learningWords : learnedWords;

  return (
    <div className="p-10 max-w-7xl mx-auto">
      <header className="mb-10 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tight">Vocabulary Vault</h1>
          <p className="text-gray-500 mt-2 text-lg">
            You have saved <span className="font-bold text-blue-600">{words.length}</span> words. 
            ({learnedWords.length} learned, {learningWords.length} learning)
          </p>
        </div>
        
        <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
          <button 
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${filter === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'}`}
          >
            All
          </button>
          <button 
            onClick={() => setFilter('learning')}
            className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${filter === 'learning' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'}`}
          >
            Still Learning
          </button>
          <button 
            onClick={() => setFilter('learned')}
            className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${filter === 'learned' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'}`}
          >
            Learned
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {displayedWords.map((w: any) => (
          <div key={w.id} className="group bg-white rounded-3xl p-6 shadow-sm border border-gray-100 hover:shadow-xl hover:border-blue-200 transition-all duration-300 flex flex-col">
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-3">
                <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${getGenderColor(w.gender)}`}>
                  {w.gender ? w.gender : w.type || 'Word'}
                </span>
                {w.status === 'learned' ? (
                  <span className="text-[10px] font-black text-green-600 bg-green-50 px-3 py-1 rounded-full border border-green-200 uppercase tracking-widest">✅ Learned</span>
                ) : (
                  <span className="text-[10px] font-black text-orange-600 bg-orange-50 px-3 py-1 rounded-full border border-orange-200 uppercase tracking-widest">⏳ Learning</span>
                )}
              </div>

              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-3xl font-black text-gray-900 tracking-tight">{w.word}</h2>
                <button 
                  onClick={() => playAudio(w.word)} 
                  className="opacity-0 group-hover:opacity-100 text-blue-500 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 p-2 rounded-full transition-all transform hover:scale-110 active:scale-95"
                  title="Play audio"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
                </button>
              </div>
              <p className="text-lg font-bold text-blue-600">{w.translation}</p>
            </div>

            <div className="mt-auto pt-5 border-t border-gray-100 flex flex-col gap-4">
              <p className="text-sm text-gray-500 font-medium leading-relaxed italic">"{w.contextSentence}"</p>
              
              {w.videoTitle && (
                <div className="text-xs font-bold text-gray-400 flex items-center gap-1.5">
                  <span className="text-red-500">▶</span> {w.videoTitle.substring(0, 35)}{w.videoTitle.length > 35 ? '...' : ''}
                </div>
              )}

              <div className="flex gap-2 mt-1 h-0 overflow-hidden group-hover:h-10 opacity-0 group-hover:opacity-100 transition-all duration-300 origin-top">
                {w.status === 'learned' ? (
                  <button 
                    onClick={() => handleUpdateStatus(w.id, 'learning')}
                    className="flex-1 bg-orange-50 hover:bg-orange-100 text-orange-700 text-xs font-bold rounded-xl transition-colors border border-orange-200 flex items-center justify-center"
                  >
                    Mark as Learning
                  </button>
                ) : (
                  <button 
                    onClick={() => handleUpdateStatus(w.id, 'learned')}
                    className="flex-1 bg-green-50 hover:bg-green-100 text-green-700 text-xs font-bold rounded-xl transition-colors border border-green-200 flex items-center justify-center"
                  >
                    Mark as Learned
                  </button>
                )}
                <button 
                  onClick={() => handleDelete(w.id)} 
                  className="w-10 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition-colors border border-red-200 flex items-center justify-center"
                  title="Delete completely"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function VideoTracker({ words }: { words: SavedWord[] }) {
  // Group words by videoId
  const videosMap = new Map<string, { title: string, count: number, id: string, lastSavedMs: number }>();
  
  words.forEach(w => {
    if (w.videoId) {
      const timeMs = w.savedAt?.seconds ? w.savedAt.seconds * 1000 : 0;
      const existing = videosMap.get(w.videoId);
      if (existing) {
        existing.count += 1;
        if (timeMs > existing.lastSavedMs) existing.lastSavedMs = timeMs;
      } else {
        videosMap.set(w.videoId, { 
          id: w.videoId, 
          title: w.videoTitle || 'Unknown Video', 
          count: 1,
          lastSavedMs: timeMs
        });
      }
    }
  });

  const videos = Array.from(videosMap.values()).sort((a, b) => b.lastSavedMs - a.lastSavedMs);

  if (videos.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center">
        <span className="text-6xl mb-4 opacity-50">📺</span>
        <h2 className="text-2xl font-bold text-gray-800">No videos tracked yet</h2>
        <p className="text-gray-500 mt-2">Save words while watching YouTube to build your video library.</p>
      </div>
    );
  }

  return (
    <div className="p-10 max-w-5xl mx-auto">
      <header className="mb-10">
        <h1 className="text-4xl font-black text-gray-900 tracking-tight">Watched Videos</h1>
        <p className="text-gray-500 mt-2 text-lg">You have learned words from <span className="font-bold text-purple-600">{videos.length}</span> videos.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {videos.map(v => (
          <a href={`https://youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer" key={v.id} className="group bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-200 hover:shadow-xl transition-all duration-300 flex">
            <div className="w-48 h-full bg-gray-100 flex-shrink-0 relative overflow-hidden">
              <img src={`https://img.youtube.com/vi/${v.id}/mqdefault.jpg`} alt={v.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
            </div>
            <div className="p-5 flex flex-col justify-center">
              <h2 className="font-bold text-gray-900 leading-tight mb-2 group-hover:text-purple-600 transition-colors line-clamp-2">{v.title}</h2>
              <p className="text-sm font-semibold text-gray-500 bg-gray-100 self-start px-3 py-1 rounded-full">
                {v.count} word{v.count > 1 ? 's' : ''} learned
              </p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

function QuizArena({ words }: { words: SavedWord[] }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null);
  
  // Selection state
  const [selectedVideo, setSelectedVideo] = useState<string>('all');

  // Extract videos for dropdown
  const videosMap = new Map<string, string>();
  words.forEach(w => { if (w.videoId) videosMap.set(w.videoId, w.videoTitle || 'Unknown Video'); });
  const videos = Array.from(videosMap.entries());

  const startQuiz = () => {
    let sourceWords = selectedVideo === 'all' ? words : words.filter(w => w.videoId === selectedVideo);
    
    if (sourceWords.length < 4) {
      alert("You need at least 4 saved words in this selection to play the Quiz Arena!");
      return;
    }
    
    // Select up to 10 words, weighted by saveCount (frequent words appear more)
    const selectedWords: SavedWord[] = [];
    const pool = [...sourceWords];
    
    while (selectedWords.length < Math.min(10, sourceWords.length) && pool.length > 0) {
      // Calculate total weight
      const totalWeight = pool.reduce((sum, w) => sum + (w.saveCount || 1), 0);
      let randomNum = Math.random() * totalWeight;
      let selectedIndex = 0;
      
      for (let i = 0; i < pool.length; i++) {
        randomNum -= (pool[i].saveCount || 1);
        if (randomNum <= 0) {
          selectedIndex = i;
          break;
        }
      }
      
      selectedWords.push(pool[selectedIndex]);
      pool.splice(selectedIndex, 1); // Remove so we don't pick it again for THIS quiz round
    }
    
    // Generate questions
    const generated = selectedWords.map(wordObj => {
      // Pick 3 random wrong answers from ALL words
      const wrong = words.filter(w => w.id !== wordObj.id).sort(() => 0.5 - Math.random()).slice(0, 3);
      const options = [wordObj, ...wrong].sort(() => 0.5 - Math.random());
      return {
        word: wordObj,
        options
      };
    });

    setQuestions(generated);
    setCurrentIndex(0);
    setScore(0);
    setIsPlaying(true);
    setFeedback(null);
  };

  const handleAnswer = (selectedWordId: string) => {
    if (feedback !== null) return;

    const isCorrect = selectedWordId === questions[currentIndex].word.id;
    if (isCorrect) setScore(s => s + 1);
    
    setFeedback(isCorrect ? 'correct' : 'incorrect');

    setTimeout(() => {
      setFeedback(null);
      if (currentIndex + 1 < questions.length) {
        setCurrentIndex(c => c + 1);
      } else {
        setIsPlaying(false);
      }
    }, 1200);
  };

  if (!isPlaying) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-10">
        <div className="bg-white p-12 rounded-3xl shadow-xl border border-gray-100 max-w-2xl w-full text-center">
          <div className="text-6xl mb-6">🎯</div>
          <h1 className="text-4xl font-black text-gray-900 mb-4">The Quiz Arena</h1>
          <p className="text-xl text-gray-500 mb-8">Test your knowledge. Words you save more frequently are more likely to appear!</p>
          
          <div className="mb-8 text-left bg-gray-50 p-6 rounded-2xl border border-gray-200">
            <label className="block text-sm font-bold text-gray-700 mb-2">Select Quiz Source:</label>
            <select 
              value={selectedVideo}
              onChange={(e) => setSelectedVideo(e.target.value)}
              className="w-full bg-white border border-gray-300 text-gray-900 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 block p-3 font-medium"
            >
              <option value="all">🌍 Overall Vocabulary ({words.length} words)</option>
              {videos.map(([id, title]) => (
                <option key={id} value={id}>📺 {title.substring(0, 50)}{title.length > 50 ? '...' : ''}</option>
              ))}
            </select>
          </div>

          <button 
            onClick={startQuiz}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xl font-bold w-full py-4 px-12 rounded-full shadow-lg hover:shadow-indigo-300/50 transition-all transform hover:-translate-y-1 active:translate-y-0"
          >
            Start Challenge
          </button>
        </div>
      </div>
    );
  }

  const currentQ = questions[currentIndex];

  return (
    <div className="h-full flex flex-col items-center justify-center p-10 bg-indigo-50/50">
      <div className="w-full max-w-3xl">
        <div className="flex justify-between items-center mb-8">
          <span className="text-indigo-800 font-bold bg-indigo-100 px-4 py-2 rounded-full">
            Question {currentIndex + 1} of {questions.length}
          </span>
          <span className="text-indigo-800 font-bold bg-indigo-100 px-4 py-2 rounded-full">
            Score: {score}
          </span>
        </div>

        <div className={`bg-white rounded-3xl p-12 shadow-2xl border-2 transition-colors duration-300 text-center mb-8 ${
          feedback === 'correct' ? 'border-green-400 bg-green-50' : 
          feedback === 'incorrect' ? 'border-red-400 bg-red-50' : 'border-transparent'
        }`}>
          <h2 className="text-5xl font-black text-gray-900 mb-4">{currentQ.word.word}</h2>
          <p className="text-gray-400 italic">"{currentQ.word.contextSentence}"</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {currentQ.options.map((opt: any) => {
            let btnClass = "bg-white hover:bg-gray-50 border-2 border-gray-200 text-gray-800";
            if (feedback !== null) {
              if (opt.id === currentQ.word.id) {
                btnClass = "bg-green-500 border-green-600 text-white shadow-lg shadow-green-200"; // Correct
              } else {
                btnClass = "bg-gray-100 border-gray-200 text-gray-400 opacity-50"; // Dim others
              }
            }

            return (
              <button
                key={opt.id}
                onClick={() => handleAnswer(opt.id)}
                className={`text-xl font-bold py-6 px-6 rounded-2xl transition-all shadow-sm ${btnClass}`}
              >
                {opt.translation}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
