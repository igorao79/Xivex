"use client";

import { useState, useRef, useCallback } from "react";
import {
  Wand2,
  Loader2,
  FileUp,
  ArrowRight,
  SkipForward,
  Copy,
  Check,
  Download,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { MarkdownRenderer } from "./markdown-renderer";
import { useI18n } from "@/lib/i18n";

type Step = "input" | "clarifying" | "generating" | "done";

interface QA {
  question: string;
  answer: string;
}

export function PromptBuilder() {
  const { t } = useI18n();
  const [step, setStep] = useState<Step>("input");
  const [request, setRequest] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [allQA, setAllQA] = useState<QA[]>([]);
  const [round, setRound] = useState(0);
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 1: Submit request → get clarifying questions
  const handleSubmitRequest = useCallback(async () => {
    if (!request.trim() || isLoading) return;
    setIsLoading(true);

    try {
      const res = await fetch("/api/prompting/clarify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: request.trim() }),
      });
      const data = await res.json();

      if (!data.questions?.length) {
        // No questions returned — generate directly (fallback)
        await generatePrompt([]);
      } else {
        setQuestions(data.questions);
        setAnswers(new Array(data.questions.length).fill(""));
        setRound(1);
        setStep("clarifying");
      }
    } catch {
      // Fallback: generate without questions
      await generatePrompt([]);
    } finally {
      setIsLoading(false);
    }
  }, [request, isLoading]);

  // Step 2: Submit answers → get more questions or generate
  const handleSubmitAnswers = useCallback(async () => {
    if (isLoading) return;
    setIsLoading(true);

    const currentQA: QA[] = questions
      .map((q, i) => ({
        question: q,
        answer: answers[i]?.trim() || "(не указано)",
      }));
    const combined = [...allQA, ...currentQA];

    try {
      if (round < 3) {
        // Ask for more questions
        const res = await fetch("/api/prompting/clarify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            request: request.trim(),
            previousAnswers: combined,
          }),
        });
        const data = await res.json();

        if (data.done || !data.questions?.length || round >= 2) {
          // Done clarifying
          setAllQA(combined);
          await generatePrompt(combined);
        } else {
          setAllQA(combined);
          setQuestions(data.questions);
          setAnswers(new Array(data.questions.length).fill(""));
          setRound((r) => r + 1);
        }
      } else {
        setAllQA(combined);
        await generatePrompt(combined);
      }
    } catch {
      setAllQA(combined);
      await generatePrompt(combined);
    } finally {
      setIsLoading(false);
    }
  }, [questions, answers, allQA, round, request, isLoading]);

  // Skip clarification → generate immediately
  const handleSkip = useCallback(async () => {
    const currentQA: QA[] = questions
      .map((q, i) => ({
        question: q,
        answer: answers[i]?.trim() || "",
      }))
      .filter((qa) => qa.answer);
    const combined = [...allQA, ...currentQA];
    setAllQA(combined);
    await generatePrompt(combined);
  }, [questions, answers, allQA, request]);

  // Step 3: Generate the prompt via streaming
  const generatePrompt = useCallback(
    async (finalQA: QA[]) => {
      setStep("generating");
      setGeneratedPrompt("");
      setIsLoading(true);

      try {
        const res = await fetch("/api/prompting/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            request: request.trim(),
            answers: finalQA,
          }),
        });

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        if (!reader) throw new Error("No stream");

        let fullContent = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          const lines = text.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") break;

              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  fullContent += parsed.content;
                  setGeneratedPrompt(fullContent);
                }
              } catch {
                // skip
              }
            }
          }
        }

        setStep("done");
      } catch {
        setGeneratedPrompt("Error generating prompt. Please try again.");
        setStep("done");
      } finally {
        setIsLoading(false);
      }
    },
    [request]
  );

  // File upload handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "txt" && ext !== "md") return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      setRequest((prev) => (prev ? prev + "\n\n" + text : text));
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Copy prompt
  const handleCopy = async () => {
    await navigator.clipboard.writeText(generatedPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Download as .md
  const handleDownload = () => {
    const blob = new Blob([generatedPrompt], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "prompt.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Reset
  const handleReset = () => {
    setStep("input");
    setRequest("");
    setQuestions([]);
    setAnswers([]);
    setAllQA([]);
    setRound(0);
    setGeneratedPrompt("");
    setIsLoading(false);
  };

  return (
    <div className="max-w-3xl mx-auto">
      <AnimatePresence mode="wait">
        {/* ─── Step 1: Input ─── */}
        {step === "input" && (
          <motion.div
            key="input"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            {/* Header */}
            <div className="text-center space-y-2">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Wand2 className="size-7 text-primary" />
              </div>
              <h1 className="text-2xl font-bold">{t.promptTitle}</h1>
              <p className="text-muted-foreground">{t.promptEmptyHint}</p>
            </div>

            {/* Textarea */}
            <div className="space-y-3">
              <textarea
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                placeholder={t.promptPlaceholder}
                className="w-full min-h-[160px] rounded-xl border bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 resize-y"
                disabled={isLoading}
              />

              {/* File upload */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <FileUp className="size-4" />
                {t.promptUploadFile}
              </button>
            </div>

            {/* Submit button */}
            <Button
              onClick={handleSubmitRequest}
              disabled={!request.trim() || isLoading}
              className="w-full gap-2"
              size="lg"
            >
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {t.promptGenerate}
            </Button>
          </motion.div>
        )}

        {/* ─── Step 2: Clarifying Questions ─── */}
        {step === "clarifying" && (
          <motion.div
            key="clarifying"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            {/* Header */}
            <div className="space-y-1">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Wand2 className="size-5 text-primary" />
                {t.promptClarifying}
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  ({round}/3)
                </span>
              </h2>
              <p className="text-sm text-muted-foreground">
                {t.promptEmpty}
              </p>
            </div>

            {/* Previous Q&A */}
            {allQA.length > 0 && (
              <div className="space-y-2 opacity-60">
                {allQA.map((qa, i) => (
                  <div key={i} className="rounded-lg border bg-muted/30 px-4 py-3 space-y-1">
                    <p className="text-sm font-medium">{qa.question}</p>
                    <p className="text-sm text-muted-foreground">{qa.answer}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Current questions */}
            <div className="space-y-4">
              {questions.map((q, i) => (
                <motion.div
                  key={`${round}-${i}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="space-y-2"
                >
                  <label className="text-sm font-medium">{q}</label>
                  <input
                    type="text"
                    value={answers[i] || ""}
                    onChange={(e) => {
                      const next = [...answers];
                      next[i] = e.target.value;
                      setAnswers(next);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && i === questions.length - 1) {
                        handleSubmitAnswers();
                      }
                    }}
                    className="w-full rounded-lg border bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    disabled={isLoading}
                    placeholder="..."
                  />
                </motion.div>
              ))}
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <Button
                onClick={handleSubmitAnswers}
                disabled={isLoading}
                className="flex-1 gap-2"
              >
                {isLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ArrowRight className="size-4" />
                )}
                {t.promptContinue}
              </Button>
              <Button
                variant="outline"
                onClick={handleSkip}
                disabled={isLoading}
                className="gap-2"
              >
                <SkipForward className="size-4" />
                {t.promptSkip}
              </Button>
            </div>
          </motion.div>
        )}

        {/* ─── Step 3: Generating ─── */}
        {step === "generating" && (
          <motion.div
            key="generating"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-primary" />
              {t.promptGenerating}
            </div>
            <div className="rounded-xl border bg-card p-6 min-h-[200px]">
              <MarkdownRenderer content={generatedPrompt} isStreaming />
            </div>
          </motion.div>
        )}

        {/* ─── Step 4: Result ─── */}
        {step === "done" && (
          <motion.div
            key="done"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            {/* Header with actions */}
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Sparkles className="size-5 text-primary" />
                {t.promptResult}
              </h2>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  className="gap-1.5"
                >
                  {copied ? (
                    <>
                      <Check className="size-3.5 text-green-500" />
                      {t.copied}
                    </>
                  ) : (
                    <>
                      <Copy className="size-3.5" />
                      {t.promptCopy}
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownload}
                  className="gap-1.5"
                >
                  <Download className="size-3.5" />
                  {t.promptDownload}
                </Button>
              </div>
            </div>

            {/* Prompt content */}
            <div className="rounded-xl border bg-card p-6">
              <MarkdownRenderer content={generatedPrompt} />
            </div>

            {/* Start over */}
            <Button
              variant="ghost"
              onClick={handleReset}
              className="w-full gap-2 text-muted-foreground"
            >
              <RotateCcw className="size-4" />
              {t.promptStartOver}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
