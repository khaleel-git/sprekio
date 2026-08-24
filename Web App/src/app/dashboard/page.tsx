"use client";

import { useEffect, useState } from 'react';
import { auth, db, signInWithPopup, googleProvider, signOut, collection, query, where, getDocs, updateDoc, doc, deleteDoc, orderBy } from '@/lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';

interface SavedWord {
  id: string;
  word: string;
  translation: string;
  type?: string;
  gender?: string;
  contextSentence: string;
  savedAt: string;
  status?: 'learning' | 'learned';
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<'vault' | 'quiz'>('vault');
  const [words, setWords] = useState<SavedWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        fetchWords(currentUser.uid);
      } else {
        setWords([]);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const fetchWords = async (uid: string) => {
    try {
      const q = query(
        collection(db, 'vocabulary'),
        where('userId', '==', uid),
        orderBy('savedAt', 'desc')
      );
      const snapshot = await getDocs(q);
      const fetchedWords: SavedWord[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        fetchedWords.push({
          id: doc.id,
          word: data.word,
          translation: data.translation,
          type: data.type,
          gender: data.gender,
          contextSentence: data.contextSentence,
          savedAt: data.savedAt?.toDate().toISOString() || new Date().toISOString(),
          status: data.status || 'learning'
        });
      });
      setWords(fetchedWords);
    } catch (e) {
      console.error("Failed to fetch words:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      console.error("Login failed:", e);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error("Logout failed:", e);
    }
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

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this word from your vault?')) return;
    try {
      await deleteDoc(doc(db, "vocabulary", id));
      setWords(words.filter(w => w.id !== id));
    } catch (e) {
      console.error("Failed to delete word:", e);
    }
  };

  const handleUpdateStatus = async (id: string, status: 'learning' | 'learned') => {
    try {
      await updateDoc(doc(db, "vocabulary", id), { status });
      setWords(words.map(w => w.id === id ? { ...w, status } : w));
    } catch (e) {
      console.error("Failed to update status:", e);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-120px)] bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-120px)] bg-gray-50 text-center px-4">
        <div className="bg-white p-10 rounded-2xl shadow-sm border border-gray-100 max-w-md w-full">
          <div className="text-5xl mb-6">dYc</div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome to Sprekio</h1>
          <p className="text-gray-500 mb-8">Sign in to view your saved vocabulary vault and take quizzes.</p>
          <button 
            onClick={handleLogin}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl transition-colors shadow-sm"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-120px)] bg-gray-50 font-sans selection:bg-blue-200">
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col hidden lg:flex fixed h-[calc(100vh-56px)] z-10">
        <div className="p-6">
          <h1 className="text-2xl font-black tracking-tight text-gray-900 flex items-center gap-2">
            dYcdYئ Dashboard
          </h1>
          <div className="mt-2 text-xs text-gray-500 font-medium truncate">{user.email}</div>
        </div>
        
        <nav className="flex-1 px-4 space-y-2 mt-4">
          <button 
            onClick={() => setActiveTab('vault')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${
              activeTab === 'vault' 
                ? 'bg-blue-50 text-blue-700 shadow-sm border border-blue-100' 
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            dY Vault <span className="ml-auto bg-white text-xs py-0.5 px-2 rounded-full shadow-sm">{words.length}</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('quiz')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${
              activeTab === 'quiz' 
                ? 'bg-indigo-50 text-indigo-700 shadow-sm border border-indigo-100' 
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            dY Quiz Arena
          </button>
        </nav>

        <div className="p-4 border-t border-gray-100">
          <button 
            onClick={handleLogout}
            className="w-full py-2 text-sm text-gray-500 hover:text-red-600 font-medium transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>

      <div className="lg:pl-64 flex-1">
        {activeTab === 'vault' ? (
          <Vault words={words} handleDelete={handleDelete} handleUpdateStatus={handleUpdateStatus} playAudio={playAudio} getGenderColor={getGenderColor} />
        ) : (
          <QuizArena words={words} />
        )}
      </div>
    </div>
  );
}

function Vault({ words, handleDelete, handleUpdateStatus, playAudio, getGenderColor }: any) {
  if (words.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-10 mt-20">
        <div className="text-6xl mb-6 opacity-50">dY"</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Your vault is empty!</h2>
        <p className="text-gray-500 max-w-sm">Use the Sprekio Chrome Extension while watching YouTube videos to save words here.</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight mb-2">Vocabulary Vault</h2>
          <p className="text-gray-500 font-medium">You've saved {words.length} words from YouTube.</p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {words.map((w: any) => (
          <div key={w.id} className="group bg-white rounded-3xl p-6 shadow-sm border border-gray-100 hover:border-blue-200 hover:shadow-xl transition-all duration-300 flex flex-col h-full transform hover:-translate-y-1">
            <div className="flex-1">
              <div className="flex justify-between items-start mb-4">
                <span className="text-xs font-bold text-gray-400 bg-gray-50 px-2.5 py-1 rounded-md uppercase tracking-wider">
                  {w.type || 'word'}
                </span>
                
                {w.status === 'learned' ? (
                  <span className="text-[10px] font-black text-green-600 bg-green-50 px-3 py-1 rounded-full border border-green-200 uppercase tracking-widest flex items-center gap-1">
                    dY Learned
                  </span>
                ) : (
                  <span className="text-[10px] font-black text-orange-600 bg-orange-50 px-3 py-1 rounded-full border border-orange-200 uppercase tracking-widest">
                    dY3 Learning
                  </span>
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

function QuizArena({ words }: { words: any[] }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null);

  const startQuiz = () => {
    if (words.length < 4) {
      alert("You need at least 4 saved words to play the Quiz Arena!");
      return;
    }
    
    const shuffled = [...words].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, Math.min(10, words.length));
    
    const generated = selected.map(wordObj => {
      const wrong = words.filter(w => w.id !== wordObj.id).sort(() => 0.5 - Math.random()).slice(0, 3);
      const options = [wordObj, ...wrong].sort(() => 0.5 - Math.random());
      return { word: wordObj, options };
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
      <div className="h-full flex flex-col items-center justify-center p-10 min-h-[500px]">
        <div className="bg-white p-12 rounded-3xl shadow-xl border border-gray-100 max-w-2xl w-full text-center">
          <div className="text-6xl mb-6">dYs"dY,</div>
          <h1 className="text-4xl font-black text-gray-900 mb-4">The Quiz Arena</h1>
          <p className="text-xl text-gray-500 mb-8">Test your knowledge against your saved vocabulary.</p>
          
          {score > 0 && (
            <div className="mb-8 p-6 bg-indigo-50 rounded-2xl border border-indigo-100">
              <p className="text-lg font-bold text-indigo-900">Last Score: {score} / {questions.length}</p>
            </div>
          )}

          <button 
            onClick={startQuiz}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xl font-bold py-4 px-12 rounded-full shadow-lg hover:shadow-indigo-300/50 transition-all transform hover:-translate-y-1 active:translate-y-0"
          >
            Start Challenge
          </button>
        </div>
      </div>
    );
  }

  const currentQ = questions[currentIndex];

  return (
    <div className="h-full flex flex-col items-center justify-center p-10 bg-indigo-50/50 min-h-[500px]">
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
                btnClass = "bg-green-500 border-green-600 text-white shadow-lg shadow-green-200"; 
              } else {
                btnClass = "bg-gray-100 border-gray-200 text-gray-400 opacity-50"; 
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
