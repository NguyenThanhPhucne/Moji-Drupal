import { useCallback, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";

interface UseImageDropZoneResult {
  isDragOver: boolean;
  handleDragEnter: (event: DragEvent<HTMLElement>) => void;
  handleDragLeave: (event: DragEvent<HTMLElement>) => void;
  handleDrop: (event: DragEvent<HTMLElement>) => void;
  handleDragOver: (event: DragEvent<HTMLElement>) => void;
}

export const useImageDropZone = (
  handleFileChange: (event: ChangeEvent<HTMLInputElement>) => void,
): UseImageDropZoneResult => {
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    dragCounter.current += 1;
    if (event.dataTransfer.types.includes("Files")) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      dragCounter.current = 0;
      setIsDragOver(false);
      const file = event.dataTransfer.files?.[0];
      if (file?.type.startsWith("image/")) {
        const mockEvent = {
          target: { files: event.dataTransfer.files },
        } as unknown as ChangeEvent<HTMLInputElement>;
        handleFileChange(mockEvent);
      }
    },
    [handleFileChange],
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
  }, []);

  return {
    isDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    handleDragOver,
  };
};
