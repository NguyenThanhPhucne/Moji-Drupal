import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { MessageCircleMore, MoreHorizontal, Phone, Video } from "lucide-react";

const ACCENTS = [
  "blue",
  "violet",
  "rose",
  "emerald",
  "amber",
  "sunset",
  "ocean",
  "slate",
] as const;

type Accent = (typeof ACCENTS)[number];

type QaState = "normal" | "hover" | "focus" | "active";

const QA_STATES: QaState[] = ["normal", "hover", "focus", "active"];

const stateClassMap: Record<QaState, string> = {
  normal: "",
  hover: "chat-qa-force-hover",
  focus: "chat-qa-force-focus",
  active: "chat-qa-force-active",
};

const ChatContrastQaPage = () => {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains("dark");

    root.classList.remove("dark");

    return () => {
      if (hadDark) {
        root.classList.add("dark");
      }
    };
  }, []);

  const accentFilter = searchParams.get("accent");
  const stateFilter = searchParams.get("state") as QaState | null;

  const accentsToRender = useMemo(() => {
    if (!accentFilter || !ACCENTS.includes(accentFilter as Accent)) {
      return ACCENTS;
    }
    return [accentFilter as Accent];
  }, [accentFilter]);

  const statesToRender = useMemo(() => {
    if (!stateFilter || !QA_STATES.includes(stateFilter)) {
      return QA_STATES;
    }
    return [stateFilter];
  }, [stateFilter]);

  return (
    <main className="chat-qa-page">
      <div className="chat-qa-layout">
        <section className="chat-qa-header">
          <h1 className="chat-qa-title">Chat Light-Mode Contrast QA Checklist</h1>
          <p className="chat-qa-subtitle">
            Capture screenshots for each accent and state to finalize production contrast in main chat UI.
          </p>

          <div className="chat-qa-shotlist">
            <div className="chat-qa-shot-item">Header actions: readable icon + ring visible</div>
            <div className="chat-qa-shot-item">Message actions: border contrast + hover separation</div>
            <div className="chat-qa-shot-item">Modal buttons: secondary/danger text clarity</div>
            <div className="chat-qa-shot-item">Delete scope card: focus ring + surface layering</div>
          </div>
        </section>

        <section className="chat-qa-grid">
          {accentsToRender.map((accent) => (
            <article key={accent} className="chat-qa-accent-card" data-accent={accent}>
              <header className="chat-qa-accent-head">
                <h2 className="chat-qa-accent-name">{accent}</h2>
                <span className="chat-qa-pill">light mode</span>
              </header>

              <div className="chat-qa-states">
                {statesToRender.map((state) => (
                  <section
                    key={`${accent}-${state}`}
                    className={`chat-qa-state-block ${stateClassMap[state]}`.trim()}
                  >
                    <div className="chat-qa-state-row">
                      <h3 className="chat-qa-state-name">{state}</h3>
                      <span className="chat-qa-check">screenshot required</span>
                    </div>

                    <div className="chat-qa-controls">
                      <button type="button" className="chat-header-action-btn" aria-label="Voice action preview">
                        <Phone className="size-4" />
                      </button>
                      <button type="button" className="chat-header-action-btn" aria-label="Video action preview">
                        <Video className="size-4" />
                      </button>
                      <button type="button" className="chat-message-action-btn" aria-label="Message reaction action preview">
                        <MessageCircleMore className="size-4" />
                      </button>
                      <button type="button" className="chat-message-action-btn" aria-label="Message menu action preview">
                        <MoreHorizontal className="size-4" />
                      </button>
                    </div>

                    <div className="chat-qa-modal-row">
                      <button type="button" className="chat-modal-btn chat-modal-btn--secondary">Cancel</button>
                      <button type="button" className="chat-modal-btn chat-modal-btn--danger">Delete</button>
                    </div>

                    <button type="button" className="chat-delete-scope-option chat-qa-delete-preview">
                      <p className="chat-qa-delete-title">Remove for you</p>
                      <p className="chat-qa-delete-desc">
                        Check border readability, focus ring, and text contrast.
                      </p>
                    </button>
                  </section>
                ))}
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
};

export default ChatContrastQaPage;
