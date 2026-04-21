import { create } from "zustand";

type Announcement = {
  id: number;
  message: string;
};

interface A11yAnnouncerState {
  politeAnnouncement: Announcement | null;
  assertiveAnnouncement: Announcement | null;
  announcePolite: (message: string) => void;
  announceAssertive: (message: string) => void;
}

const createAnnouncement = (message: string): Announcement => ({
  id: Date.now() + Math.floor(Math.random() * 1000),
  message,
});

export const useA11yAnnouncerStore = create<A11yAnnouncerState>((set) => ({
  politeAnnouncement: null,
  assertiveAnnouncement: null,

  announcePolite: (message) => {
    set({ politeAnnouncement: createAnnouncement(message) });
  },

  announceAssertive: (message) => {
    set({ assertiveAnnouncement: createAnnouncement(message) });
  },
}));
