"use client";

import { useTranslations } from "next-intl";
import { X } from "lucide-react";

const HELP_ICONS: Record<string, string> = {
  MULTIPLE_CHOICE: "🔘",
  TRUE_FALSE: "✅",
  OPEN_ANSWER: "✏️",
  ORDERING: "🔢",
  MATCHING: "🔗",
  SPOT_ERROR: "🔍",
  NUMERIC_ESTIMATION: "🔢",
  IMAGE_HOTSPOT: "🎯",
  CODE_COMPLETION: "💻",
};

const HELP_KEYS: Record<string, { title: string; desc: string; editor: string; player: string; scoring: string; example: string; answer: string }> = {
  MULTIPLE_CHOICE: { title: "multipleChoice", desc: "multipleChoiceDesc", editor: "multipleChoiceEditor", player: "multipleChoicePlayer", scoring: "multipleChoiceScoring", example: "multipleChoiceExample", answer: "multipleChoiceAnswer" },
  TRUE_FALSE: { title: "trueFalse", desc: "trueFalseDesc", editor: "trueFalseEditor", player: "trueFalsePlayer", scoring: "trueFalseScoring", example: "trueFalseExample", answer: "trueFalseAnswer" },
  OPEN_ANSWER: { title: "openAnswer", desc: "openAnswerDesc", editor: "openAnswerEditor", player: "openAnswerPlayer", scoring: "openAnswerScoring", example: "openAnswerExample", answer: "openAnswerAnswer" },
  ORDERING: { title: "ordering", desc: "orderingDesc", editor: "orderingEditor", player: "orderingPlayer", scoring: "orderingScoring", example: "orderingExample", answer: "orderingAnswer" },
  MATCHING: { title: "matching", desc: "matchingDesc", editor: "matchingEditor", player: "matchingPlayer", scoring: "matchingScoring", example: "matchingExample", answer: "matchingAnswer" },
  SPOT_ERROR: { title: "spotError", desc: "spotErrorDesc", editor: "spotErrorEditor", player: "spotErrorPlayer", scoring: "spotErrorScoring", example: "spotErrorExample", answer: "spotErrorAnswer" },
  NUMERIC_ESTIMATION: { title: "numericEstimation", desc: "numericEstimationDesc", editor: "numericEstimationEditor", player: "numericEstimationPlayer", scoring: "numericEstimationScoring", example: "numericEstimationExample", answer: "numericEstimationAnswer" },
  IMAGE_HOTSPOT: { title: "imageHotspot", desc: "imageHotspotDesc", editor: "imageHotspotEditor", player: "imageHotspotPlayer", scoring: "imageHotspotScoring", example: "imageHotspotExample", answer: "imageHotspotAnswer" },
  CODE_COMPLETION: { title: "codeCompletion", desc: "codeCompletionDesc", editor: "codeCompletionEditor", player: "codeCompletionPlayer", scoring: "codeCompletionScoring", example: "codeCompletionExample", answer: "codeCompletionAnswer" },
};

interface Props {
  type: string;
  onClose: () => void;
}

export function QuestionHelpDialog({ type, onClose }: Props) {
  const t = useTranslations("questionHelp");
  const tc = useTranslations("common");
  const keys = HELP_KEYS[type];
  const icon = HELP_ICONS[type];
  if (!keys) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{icon}</span>
            <h2 className="text-xl font-bold text-slate-800 dark:text-white">
              {t(keys.title)}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-5">
          {/* Description */}
          <p className="text-base text-slate-700 dark:text-slate-300 leading-relaxed">
            {t(keys.desc)}
          </p>

          {/* Editor tip */}
          <section>
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
              {t("editorSection")}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {t(keys.editor)}
            </p>
          </section>

          {/* Player view */}
          <section>
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
              {t("playerSection")}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {t(keys.player)}
            </p>
          </section>

          {/* Scoring */}
          <section>
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
              {t("scoringSection")}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {t(keys.scoring)}
            </p>
          </section>

          {/* Example */}
          <section className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <h3 className="text-sm font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-2">
              {t("exampleSection")}
            </h3>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {t(keys.example)}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 whitespace-pre-line">
              {t(keys.answer)}
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 px-6 py-3 rounded-b-2xl">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-base transition-colors"
          >
            {tc("close")}
          </button>
        </div>
      </div>
    </div>
  );
}
