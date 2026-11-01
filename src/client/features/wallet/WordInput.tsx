import { useEffect, useRef, useState } from "react";
import { mnemonicSuggestions } from "../../../shared/mnemonic.ts";
import { cn } from "../../lib/utils";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "../../components/ui/popover";
import { Hint } from "../../components/common.tsx";
export function WordInput({
  index,
  value,
  hidden,
  onChange,
}: {
  index: number;
  value: string;
  hidden: boolean;
  onChange: (word: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const ref = useRef<HTMLInputElement>(null);
  const matches = hidden ? [] : mnemonicSuggestions(value);
  const candidates = matches.slice(0, 8);
  const show =
    open && !hidden && candidates.length > 0 && !(matches.length === 1 && matches[0] === value);
  const listId = `word-list-${index}`;
  function choose(word: string) {
    onChange(word);
    setOpen(false);
    setActive(-1);
    ref.current?.focus();
  }
  useEffect(() => {
    if (hidden) setOpen(false);
  }, [hidden]);
  return (
    <Popover open={Boolean(show)} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="word-cell">
          <span>{String(index + 1).padStart(2, "0")}</span>
          <Input
            ref={ref}
            aria-label={`第 ${index + 1} 个助记词`}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={Boolean(show)}
            aria-controls={listId}
            aria-activedescendant={show && active >= 0 ? `${listId}-${active}` : undefined}
            type={hidden ? "password" : "text"}
            value={value}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            onChange={(event) => {
              onChange(event.target.value);
              setActive(-1);
              setOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Escape" || event.key === "Tab") {
                setOpen(false);
                return;
              }
              if (["ArrowDown", "ArrowUp"].includes(event.key) && candidates.length && !hidden) {
                event.preventDefault();
                setOpen(true);
                setActive(
                  (current) =>
                    (current +
                      (event.key === "ArrowDown" ? 1 : current < 0 ? 0 : -1) +
                      candidates.length) %
                    candidates.length,
                );
              }
              if (event.key === "Enter" && show && active >= 0) {
                event.preventDefault();
                choose(candidates[active]);
              }
            }}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        collisionPadding={12}
        className="word-popover p-2"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          if (event.target === ref.current) event.preventDefault();
        }}
      >
        <div
          id={listId}
          role="listbox"
          aria-label="BIP-39 单词补全"
          className="grid grid-cols-2 gap-1"
        >
          {candidates.map((word, i) => (
            <Button
              key={word}
              id={`${listId}-${i}`}
              variant="ghost"
              role="option"
              aria-selected={active === i}
              tabIndex={-1}
              className={cn("justify-start font-mono text-sm", active === i && "bg-accent")}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(word)}
            >
              {word}
            </Button>
          ))}
        </div>
        <Hint className="px-1 pt-2">
          {matches.length > 8
            ? `共 ${matches.length} 个匹配，继续输入缩小范围`
            : "点击选择 · ↑↓ 选择 · Enter 确认"}
        </Hint>
      </PopoverContent>
    </Popover>
  );
}
