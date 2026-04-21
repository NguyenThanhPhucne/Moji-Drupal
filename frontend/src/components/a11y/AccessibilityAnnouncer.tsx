import { useA11yAnnouncerStore } from "@/stores/useA11yAnnouncerStore";

const AccessibilityAnnouncer = () => {
  const politeAnnouncement = useA11yAnnouncerStore(
    (state) => state.politeAnnouncement,
  );
  const assertiveAnnouncement = useA11yAnnouncerStore(
    (state) => state.assertiveAnnouncement,
  );

  return (
    <>
      <div
        key={`polite-${politeAnnouncement?.id ?? 0}`}
        className="sr-only"
        data-testid="a11y-live-polite"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {politeAnnouncement?.message || ""}
      </div>
      <div
        key={`assertive-${assertiveAnnouncement?.id ?? 0}`}
        className="sr-only"
        data-testid="a11y-live-assertive"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
      >
        {assertiveAnnouncement?.message || ""}
      </div>
    </>
  );
};

export default AccessibilityAnnouncer;
