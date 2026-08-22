"use client";

import { useState } from "react";
import { QuizQuestion } from "@/lib/stories";
import { CheckCircle2, XCircle, ChevronRight, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuizModalProps {
  questions: QuizQuestion[];
  storyTitle: string;
  onFinish: (score: number) => void;
  onClose: () => void;
}

export default function QuizModal({ questions, storyTitle, onFinish, onClose }: QuizModalProps) {
  const [currentQ, setCurrentQ] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [finished, setFinished] = useState(false);

  const question = questions[currentQ];
  const isLast = currentQ === questions.length - 1;
  const score = answers.filter(Boolean).length;

  const handleSelect = (idx: number) => {
    if (selected !== null) return;
    setSelected(idx);
  };

  const handleNext = () => {
    if (selected === null) return;
    const correct = selected === question.correct;
    const newAnswers = [...answers, correct];
    setAnswers(newAnswers);

    if (isLast) {
      const finalScore = newAnswers.filter(Boolean).length;
      setFinished(true);
      onFinish(finalScore);
    } else {
      setCurrentQ((q) => q + 1);
      setSelected(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md animate-slide-up overflow-hidden">
        {!finished ? (
          <>
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-5 py-4">
              <div className="flex items-center justify-between text-white mb-2">
                <span className="text-sm font-medium opacity-80">Verständnisfragen</span>
                <span className="text-sm font-bold">
                  {currentQ + 1} / {questions.length}
                </span>
              </div>
              <div className="w-full bg-white/20 rounded-full h-1.5">
                <div
                  className="bg-white rounded-full h-1.5 transition-all duration-300"
                  style={{ width: `${((currentQ) / questions.length) * 100}%` }}
                />
              </div>
            </div>

            {/* Question */}
            <div className="p-5">
              <h3 className="text-base font-bold text-gray-900 mb-4">{question.question}</h3>

              <div className="space-y-2">
                {question.options.map((option, idx) => {
                  let style = "border-gray-200 text-gray-800 hover:border-blue-300 hover:bg-blue-50";
                  if (selected !== null) {
                    if (idx === question.correct) {
                      style = "border-green-400 bg-green-50 text-green-800";
                    } else if (idx === selected && selected !== question.correct) {
                      style = "border-red-400 bg-red-50 text-red-800";
                    } else {
                      style = "border-gray-100 text-gray-400";
                    }
                  }

                  return (
                    <button
                      key={idx}
                      onClick={() => handleSelect(idx)}
                      className={cn(
                        "w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition-all",
                        style
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span>{option}</span>
                        {selected !== null && idx === question.correct && (
                          <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                        )}
                        {selected !== null && idx === selected && selected !== question.correct && (
                          <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {selected !== null && (
                <button
                  onClick={handleNext}
                  className="mt-4 w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-2 animate-fade-in"
                >
                  {isLast ? "See results" : "Next question"}
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </>
        ) : (
          /* Results */
          <div className="p-8 text-center">
            <div className="text-5xl mb-4">
              {score === questions.length ? "🏆" : score >= 2 ? "⭐" : "📚"}
            </div>
            <Trophy className="w-8 h-8 text-yellow-500 mx-auto mb-2" />
            <h3 className="text-xl font-bold text-gray-900 mb-1">
              {score}/{questions.length} correct
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              {score === questions.length
                ? "Perfekt! Hervorragende Arbeit! 🎉"
                : score >= 2
                ? "Gut gemacht! Keep reading more stories!"
                : "Weitermachen! Try rereading the story."}
            </p>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setCurrentQ(0);
                  setSelected(null);
                  setAnswers([]);
                  setFinished(false);
                }}
                className="flex-1 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
              >
                Retry
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
