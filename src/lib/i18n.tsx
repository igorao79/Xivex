"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type Locale = "ru" | "en";

const translations = {
  ru: {
    // Landing
    heroPrefix: "Анализ любого",
    heroSuffix: "с помощью ИИ",
    heroDesc: "Загрузите PDF, Word, таблицу или текстовый файл. Получите мгновенный AI-отчёт и задайте дополнительные вопросы в чате.",
    // Upload
    uploadTitle: "Загрузите документ",
    uploadDrop: "Отпустите файл здесь",
    uploadHint: "Перетащите или нажмите для выбора. Поддерживает PDF, DOCX, XLSX, CSV, TXT, MD, JSON, HTML, XML",
    analyzing: "Анализируем документ...",
    // Header
    newDocument: "+ Новый документ",
    // Tabs
    tabReport: "Отчёт",
    tabChat: "Чат",
    // Report
    reportTitle: "Аналитический отчёт",
    words: "слов",
    pages: "стр.",
    justNow: "Только что",
    relatedArticles: "Связанные статьи",
    relatedArticlesDesc: "Найдено в интернете — реальные источники по теме документа",
    diveDeeper: "Узнать больше",
    diveDeeperDesc: "Нажмите на вопрос, чтобы задать его в чате",
    // Chat
    chatTitle: "Чат с документом",
    chatClear: "Очистить",
    chatEmpty: "Задайте любой вопрос по документу",
    chatEmptyHint: "Я найду ответы на основе содержимого документа",
    chatPlaceholder: "Задайте вопрос по документу...",
    chatThinking: "Думаю...",
    // Toasts
    uploadSuccess: "Документ успешно проанализирован!",
    uploadError: "Не удалось загрузить документ",
    // Suggested questions
    sq1: "Какие основные темы рассматриваются в документе?",
    sq2: "Кратко изложи ключевые выводы",
    sq3: "Какие важные данные и цифры есть в документе?",
    sq4: "Есть ли рекомендации или план действий?",
    sq5: "Какие вопросы остались без ответа?",
    // Modes
    modeAnalysis: "Анализ",
    modeChat: "Чат",
    // Agent chat
    agentTitle: "AI Ассистент",
    agentEmpty: "Спросите что угодно — я найду ответ в интернете",
    agentEmptyHint: "Я ищу информацию в сети, читаю страницы и собираю ответ с источниками",
    agentPlaceholder: "Спросите что угодно...",
    attachImage: "Прикрепить изображение",
    agentSearching: "Ищу",
    agentReading: "Читаю",
    agentSq1: "Какие последние новости в мире технологий?",
    agentSq2: "Сравни React и Vue в 2026 году",
    agentSq3: "Объясни квантовые вычисления простыми словами",
    agentSq4: "Какие тренды в AI сейчас?",
    // Actions
    copy: "Копировать",
    copied: "Скопировано!",
    regenerate: "Перегенерировать",
    sources: "Источники",
    sourcesCount: "источн.",
    // Sidebar
    newChat: "Новый чат",
    chatHistory: "История чатов",
    deleteChat: "Удалить",
    renameChat: "Переименовать",
    noHistory: "Нет сохранённых чатов",
    today: "Сегодня",
    yesterday: "Вчера",
    daysAgo: "дн. назад",
    // Auth
    authSignIn: "Войти",
    authSignUp: "Регистрация",
    authSignOut: "Выйти",
    authSignInTitle: "Вход в аккаунт",
    authSignInDesc: "Войдите, чтобы сохранять чаты",
    authSignUpTitle: "Создать аккаунт",
    authSignUpDesc: "Зарегистрируйтесь для сохранения чатов",
    authEmail: "Email",
    authPassword: "Пароль",
    authConfirmPassword: "Подтвердите пароль",
    authName: "Имя",
    authOr: "или",
    authNoAccount: "Нет аккаунта?",
    authHasAccount: "Уже есть аккаунт?",
    authInvalidCredentials: "Неверный email или пароль",
    authError: "Произошла ошибка",
    authPasswordMismatch: "Пароли не совпадают",
    authPasswordTooShort: "Пароль должен быть не менее 6 символов",
    authSignUpSuccess: "Аккаунт создан!",
    authUser: "Пользователь",
  },
  en: {
    // Landing
    heroPrefix: "Analyze any",
    heroSuffix: "with AI",
    heroDesc: "Upload a PDF, Word doc, spreadsheet, or text file. Get an instant AI-powered report, then ask follow-up questions in chat.",
    // Upload
    uploadTitle: "Upload a document",
    uploadDrop: "Drop your file here",
    uploadHint: "Drag & drop or click to select. Supports PDF, DOCX, XLSX, CSV, TXT, MD, JSON, HTML, XML",
    analyzing: "Analyzing document...",
    // Header
    newDocument: "+ New Document",
    // Tabs
    tabReport: "Report",
    tabChat: "Chat",
    // Report
    reportTitle: "Analysis Report",
    words: "words",
    pages: "pages",
    justNow: "Just now",
    relatedArticles: "Related Articles",
    relatedArticlesDesc: "Found across the web — real sources related to your document",
    diveDeeper: "Dive Deeper",
    diveDeeperDesc: "Click a question to ask it in the chat",
    // Chat
    chatTitle: "Chat with Document",
    chatClear: "Clear",
    chatEmpty: "Ask anything about your document",
    chatEmptyHint: "I'll search through the document to find relevant answers",
    chatPlaceholder: "Ask a question about the document...",
    chatThinking: "Thinking...",
    // Toasts
    uploadSuccess: "Document analyzed successfully!",
    uploadError: "Failed to upload document",
    // Suggested questions
    sq1: "What are the main topics covered in this document?",
    sq2: "Summarize the key findings and conclusions",
    sq3: "What are the most important data points?",
    sq4: "Are there any recommendations or action items?",
    sq5: "What questions remain unanswered?",
    // Modes
    modeAnalysis: "Analysis",
    modeChat: "Chat",
    // Agent chat
    agentTitle: "AI Assistant",
    agentEmpty: "Ask me anything — I'll search the web for answers",
    agentEmptyHint: "I search the internet, read pages, and compile answers with sources",
    agentPlaceholder: "Ask anything...",
    attachImage: "Attach image",
    agentSearching: "Searching",
    agentReading: "Reading",
    agentSq1: "What are the latest tech news?",
    agentSq2: "Compare React vs Vue in 2026",
    agentSq3: "Explain quantum computing in simple terms",
    agentSq4: "What are the current AI trends?",
    // Actions
    copy: "Copy",
    copied: "Copied!",
    regenerate: "Regenerate",
    sources: "Sources",
    sourcesCount: "sources",
    // Sidebar
    newChat: "New chat",
    chatHistory: "Chat history",
    deleteChat: "Delete",
    renameChat: "Rename",
    noHistory: "No saved chats",
    today: "Today",
    yesterday: "Yesterday",
    daysAgo: "days ago",
    // Auth
    authSignIn: "Sign in",
    authSignUp: "Sign up",
    authSignOut: "Sign out",
    authSignInTitle: "Sign in to your account",
    authSignInDesc: "Sign in to save your chats",
    authSignUpTitle: "Create an account",
    authSignUpDesc: "Sign up to save your chats",
    authEmail: "Email",
    authPassword: "Password",
    authConfirmPassword: "Confirm password",
    authName: "Name",
    authOr: "or",
    authNoAccount: "Don't have an account?",
    authHasAccount: "Already have an account?",
    authInvalidCredentials: "Invalid email or password",
    authError: "Something went wrong",
    authPasswordMismatch: "Passwords don't match",
    authPasswordTooShort: "Password must be at least 6 characters",
    authSignUpSuccess: "Account created!",
    authUser: "User",
  },
};

type TranslationKeys = keyof typeof translations.ru;
type Translations = Record<TranslationKeys, string>;

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translations;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("ru");

  useEffect(() => {
    const saved = localStorage.getItem("locale") as Locale | null;
    if (saved === "en" || saved === "ru") {
      setLocaleState(saved);
    }
  }, []);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    localStorage.setItem("locale", l);
  };

  return (
    <I18nContext.Provider value={{ locale, setLocale, t: translations[locale] }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
