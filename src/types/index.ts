import type { QuestionType } from "@prisma/client";

// Question option schemas per type
export type MultipleChoiceOptions = {
  choices: { text: string; isCorrect: boolean }[];
};

export type TrueFalseOptions = {
  correct: boolean;
};

export type OpenAnswerOptions = {
  acceptedAnswers: string[];
};

export type OrderingOptions = {
  items: string[];
  correctOrder: number[];
};

export type MatchingOptions = {
  pairs: { left: string; right: string }[];
};

export type SpotErrorOptions = {
  lines: string[];
  errorIndices: number[];
  explanation?: string;
};

export type NumericEstimationOptions = {
  correctValue: number;
  tolerance: number;
  maxRange: number;
  unit?: string;
};

export type ImageHotspotOptions = {
  imageUrl: string;
  hotspot: { x: number; y: number; radius: number };
  tolerance: number;
};

export type CodeCompletionOptions = {
  codeLines: string[];
  blankLineIndex: number;
  correctAnswer: string;
  mode: "choice" | "text";
  choices?: string[];
};

export type QuestionOptions =
  | MultipleChoiceOptions
  | TrueFalseOptions
  | OpenAnswerOptions
  | OrderingOptions
  | MatchingOptions
  | SpotErrorOptions
  | NumericEstimationOptions
  | ImageHotspotOptions
  | CodeCompletionOptions;

// Answer value schemas per type
export type MultipleChoiceValue = { selected: number[] };
export type TrueFalseValue = { selected: boolean };
export type OpenAnswerValue = { text: string };
export type OrderingValue = { order: number[]; orderedTexts: string[] };
export type MatchingValue = { matches: [number, number][]; matchedPairs: { left: string; right: string }[] };
export type SpotErrorValue = { selected: number[] };
export type NumericEstimationValue = { value: number };
export type ImageHotspotValue = { x: number; y: number };
export type CodeCompletionValue = { text: string } | { selected: number };

export type AnswerValue =
  | MultipleChoiceValue
  | TrueFalseValue
  | OpenAnswerValue
  | OrderingValue
  | MatchingValue
  | SpotErrorValue
  | NumericEstimationValue
  | ImageHotspotValue
  | CodeCompletionValue;

// Socket.io events
export interface ServerToClientEvents {
  playerJoined: (data: { playerName: string; playerCount: number; playerAvatar?: string }) => void;
  playerLeft: (data: { playerName: string; playerCount: number }) => void;
  playerReconnected: (data: { playerName: string; playerCount: number; playerAvatar?: string }) => void;
  rejoinSuccess: (data: {
    totalScore: number;
    currentQuestion?: number;
    totalQuestions: number;
    phase: "waiting" | "question" | "feedback";
  }) => void;
  questionStart: (data: {
    questionIndex: number;
    totalQuestions: number;
    question: {
      text: string;
      type: QuestionType;
      options: QuestionOptions;
      timeLimit: number;
      points: number;
      mediaUrl: string | null;
      confidenceEnabled?: boolean;
    };
  }) => void;
  answerCount: (data: { count: number; total: number }) => void;
  confidenceCount: (data: { count: number; total: number }) => void;
  questionResult: (data: {
    correctAnswer: QuestionOptions;
    distribution: Record<string, number>;
    leaderboard: { playerName: string; score: number; delta: number; playerAvatar?: string }[];
  }) => void;
  answerFeedback: (data: {
    isCorrect: boolean;
    score: number;
    totalScore: number;
    classCorrectPercent: number;
    confidenceEnabled?: boolean;
  }) => void;
  playerStats: (data: {
    position: number;
    totalPlayers: number;
    responseTimeMs: number;
    correctCount: number;
    totalAnswered: number;
    streak: number;
  }) => void;
  gameOver: (data: {
    podium: { playerName: string; score: number; position: number; playerAvatar?: string }[];
    fullResults: { playerName: string; score: number; playerAvatar?: string }[];
  }) => void;
  sessionError: (data: { message: string }) => void;
  gameState: (data: { status: string; currentQuestion?: number; sessionId: string }) => void;
  muteChanged: (data: { muted: boolean }) => void;
  kicked: (data: { reason: "host" }) => void;
  playerRenamed: (data: { oldName: string; newName: string; playerAvatar?: string }) => void;
  renameSuccess: (data: { newName: string }) => void;
}

export interface ClientToServerEvents {
  joinSession: (data: { pin: string; playerName: string; playerEmail?: string; playerAvatar?: string }) => void;
  rejoinSession: (data: { sessionId: string; playerName: string }) => void;
  startGame: () => void;
  nextQuestion: () => void;
  submitAnswer: (data: { value: AnswerValue }) => void;
  showResults: () => void;
  endGame: () => void;
  submitConfidence: (data: { confidenceLevel: number }) => void;
  leaveSession: () => void;
  toggleMute: (data: { muted: boolean }) => void;
  kickPlayer: (data: { playerName: string }) => void;
  renamePlayer: (data: { newName: string }) => void;
}
