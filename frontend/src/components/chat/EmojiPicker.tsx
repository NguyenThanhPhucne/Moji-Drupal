import { useThemeStore } from "@/stores/useThemeStore";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Smile } from "lucide-react";
import { useEffect, useState } from "react";
import type { ComponentType } from "react";

interface EmojiPickerProps {
  onChange: (value: string) => void;
}

interface EmojiSelectPayload {
  native: string;
}

const EmojiPicker = ({ onChange }: EmojiPickerProps) => {
  const { isDark } = useThemeStore();
  const [isOpen, setIsOpen] = useState(false);
  const [pickerComponent, setPickerComponent] = useState<ComponentType<any> | null>(
    null,
  );
  const [emojiData, setEmojiData] = useState<unknown>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || (pickerComponent && emojiData)) {
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    Promise.all([
      import("@emoji-mart/react"),
      import("@emoji-mart/data/sets/14/native.json"),
    ])
      .then(([pickerModule, dataModule]) => {
        if (!isMounted) {
          return;
        }

        const pickerModuleAny = pickerModule as unknown as {
          default?: ComponentType<any>;
          Picker?: ComponentType<any>;
        };
        const PickerComponent = pickerModuleAny.default || pickerModuleAny.Picker;
        const resolvedData = dataModule?.default || dataModule;

        if (PickerComponent && resolvedData) {
          setPickerComponent(() => PickerComponent);
          setEmojiData(resolvedData);
        }
      })
      .catch((error) => {
        console.error("Failed to load emoji picker", error);
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [emojiData, isOpen, pickerComponent]);

  const PickerComponent = pickerComponent;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger className="cursor-pointer">
        <Smile className="size-4" />
      </PopoverTrigger>

      <PopoverContent
        side="right"
        sideOffset={40}
        className="bg-tranparent border-none shadow-none drop-shadow-none mb-12"
      >
        {PickerComponent && emojiData ? (
          <PickerComponent
            theme={isDark ? "dark" : "light"}
            data={emojiData}
            onEmojiSelect={(emoji: EmojiSelectPayload) => onChange(emoji.native)}
            emojiSize={24}
          />
        ) : (
          <div className="min-w-[240px] rounded-xl border border-border/60 bg-card/90 px-3 py-3 text-xs text-muted-foreground shadow-sm">
            {isLoading ? "Loading emoji..." : "Emoji picker is loading"}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default EmojiPicker;
