import { useState } from "react";
import { Check, ChevronsUpDown, Layers, Globe2 } from "lucide-react";
import { CHAINS, CHAIN_ORDER, PREFERRED_CHAINS } from "../../../shared/wallet.mjs";
import { cn } from "../../lib/utils";
import { Button } from "../../components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "../../components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "../../components/ui/command";

const chainNames = CHAIN_ORDER;
export function NetworkSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const selected =
    value === "all"
      ? `全部匹配网络 · ${chainNames.length} 条主网`
      : `${CHAINS[value].name} · ${CHAINS[value].symbol}`;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-label="查询网络"
          aria-expanded={open}
          className="w-full justify-between bg-white"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Globe2 className="text-primary" />
            <span className="truncate">{selected}</span>
          </span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="network-popover p-0">
        <Command>
          <CommandInput
            placeholder="搜索网络或币种…"
            aria-label="搜索网络或币种"
          />
          <CommandList>
            <CommandEmpty>没有匹配的网络</CommandEmpty>
            <CommandGroup heading="查询范围">
              <CommandItem
                value="全部 all"
                onSelect={() => {
                  onChange("all");
                  setOpen(false);
                }}
              >
                <Layers />
                全部匹配网络
                <Check
                  className={cn("ml-auto", value !== "all" && "invisible")}
                />
              </CommandItem>
            </CommandGroup>
            {[
              ["常用网络", PREFERRED_CHAINS],
              [
                "其他网络",
                chainNames.filter((name) => !PREFERRED_CHAINS.includes(name)),
              ],
            ].map(([heading, names]) => (
              <CommandGroup key={heading} heading={heading}>
                {names.map((name) => (
                  <CommandItem
                    key={name}
                    value={`${name} ${CHAINS[name].name} ${CHAINS[name].symbol}`}
                    onSelect={() => {
                      onChange(name);
                      setOpen(false);
                    }}
                  >
                    <span
                      className={cn(
                        "network-dot",
                        CHAINS[name].family && "bg-violet-400",
                      )}
                    />
                    <span>{CHAINS[name].name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {CHAINS[name].symbol}
                    </span>
                    {value === name && <Check />}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
