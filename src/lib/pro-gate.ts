import { toast } from "sonner";
import { EFFECTS } from "@/lib/editor/fx";

/**
 * One place that decides which features need a model or a service this app does not ship, and what
 * the user is told instead of a broken button. The marketing page used to advertise these as working
 * local features, which is why the wording lives here rather than inline: the same sentence is shown
 * on every surface and asserted by a test.
 */
export type ProFeature = "autoCaptions" | "captionTranslate" | "aiPortrait" | "aiAvatar";

/** Flip an entry when that part of Pro actually ships; the button then runs its real handler. */
export const PRO_AVAILABLE: Record<ProFeature, boolean> = {
  autoCaptions: false,
  captionTranslate: false,
  aiPortrait: false,
  aiAvatar: false,
};

export const proLocked = (feature: ProFeature): boolean => !PRO_AVAILABLE[feature];

/** The mark put on a control that is gated, so the user is not surprised after clicking it. */
export const PRO_BADGE = "Pro";

export interface ProCopy {
  /** the name the control carries, so the user knows before clicking */
  label: string;
  /** headline shown when they try to use it anyway */
  title: string;
  /** what is actually available in the free editor for this task */
  body: string;
}

export const PRO_COPY = {
  autoCaptions: {
    label: "Auto-captions",
    title: "Auto-captions are coming soon in the Pro version",
    body: "Speech-to-text for your timeline's audio isn't part of this build. Import an .srt/.vtt file or add cues at the playhead — retiming, styling and burned-in export all work today.",
  },
  captionTranslate: {
    label: "Translate",
    title: "Caption translation is coming soon in the Pro version",
    body: "Translation runs on a service this editor does not include yet. Duplicate the track and edit the text, or import a subtitle file in the language you need.",
  },
  aiPortrait: {
    label: "AI portrait",
    title: "AI portrait effects are coming soon in the Pro version",
    body: "Background removal and portrait blur need a segmentation model that isn't enabled here. Chroma key and shape masks cut a subject out today.",
  },
  aiAvatar: {
    label: "Talking avatar",
    title: "The talking AI avatar is coming soon in the Pro version",
    body: "Avatar generation needs a connected generation service, so nothing is produced in this tab. Text, stickers and your own footage cover the lower-third.",
  },
} as const satisfies Record<ProFeature, ProCopy>;

/** Effect groups that are AI features rather than pixel maths the engine performs itself. */
export const PRO_EFFECT_GROUPS: ReadonlySet<string> = new Set(["AI portrait"]);

export function isProEffect(id: string): boolean {
  const def = EFFECTS.find((e) => e.id === id);
  return !!def && PRO_EFFECT_GROUPS.has(def.group);
}

/** A gallery tile is locked when it belongs to a Pro group; other tabs are all engine presets. */
export function isProPreset(tab: string, id: string): boolean {
  return tab === "Effects" && isProEffect(id);
}

/** The one notice every gated control raises, so "coming soon" is phrased identically everywhere. */
export function announcePro(feature: ProFeature): void {
  const copy = PRO_COPY[feature];
  toast.info(copy.title, { description: copy.body });
}
